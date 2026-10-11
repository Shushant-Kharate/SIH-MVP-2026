import { ACTION_TYPES } from "../../../shared/action-types.js";
import { createAuditEntry } from "./audit-log.js";

const OUTLINES = Object.freeze({
  success: "2px solid #1d936a",
  failed: "2px solid #c83f49",
});

function highlight(element, state) {
  element.dataset.privacyfillState = state;
  element.style.outline = OUTLINES[state];
  element.style.outlineOffset = "2px";
}

function dispatchEditEvents(element) {
  const EventConstructor = element.ownerDocument?.defaultView?.Event ?? Event;
  element.dispatchEvent(new EventConstructor("input", { bubbles: true }));
  element.dispatchEvent(new EventConstructor("change", { bubbles: true }));
}

function setNativeProperty(element, property, value) {
  const view = element.ownerDocument?.defaultView;
  const tag = element.tagName.toLowerCase();
  const prototype = tag === "textarea"
    ? view?.HTMLTextAreaElement?.prototype
    : view?.HTMLInputElement?.prototype;
  const setter = prototype && Object.getOwnPropertyDescriptor(prototype, property)?.set;
  if (setter) setter.call(element, value);
  else element[property] = value;
}

function prepareElement(element) {
  element.scrollIntoView?.({ block: "center", behavior: "smooth" });
  element.focus?.({ preventScroll: true });
}

function isConnected(element) {
  if (!element || element.isConnected === false) return false;
  return element.ownerDocument?.documentElement?.contains?.(element) !== false;
}

function requireLiveElement(element) {
  if (!isConnected(element)) throw new Error("TARGET_REPLACED");
}

async function settleFrameworkUpdates(element) {
  // React-style handlers are commonly synchronous while Vue and similar controlled-field updates may
  // flush in a microtask. Two checkpoints let both the event handler and its queued state update settle.
  await Promise.resolve();
  await Promise.resolve();
  requireLiveElement(element);
}

async function executeAction(action, element, profileValues) {
  requireLiveElement(element);
  prepareElement(element);

  switch (action.action) {
    case ACTION_TYPES.FILL_PRIVATE: {
      const value = profileValues[action.profileKey];
      if (typeof value !== "string" || value.length === 0) throw new Error("PROFILE_VALUE_MISSING");
      setNativeProperty(element, "value", value);
      dispatchEditEvents(element);
      await settleFrameworkUpdates(element);
      if (element.value !== value) throw new Error("VALUE_VERIFICATION_FAILED");
      break;
    }
    case ACTION_TYPES.SELECT: {
      const option = Array.from(element.options).find((candidate) => (
        candidate.textContent.trim() === action.value
      ));
      if (!option) throw new Error("OPTION_NOT_FOUND");
      for (const candidate of element.options) candidate.selected = candidate === option;
      const selectSetter = Object.getOwnPropertyDescriptor(
        element.ownerDocument?.defaultView?.HTMLSelectElement?.prototype ?? {},
        "value",
      )?.set;
      if (selectSetter) selectSetter.call(element, option.value);
      option.selected = true;
      dispatchEditEvents(element);
      await settleFrameworkUpdates(element);
      if (!option.selected || option.textContent.trim() !== action.value) {
        throw new Error("SELECT_VERIFICATION_FAILED");
      }
      break;
    }
    case ACTION_TYPES.CHECK:
      setNativeProperty(element, "checked", action.checked);
      dispatchEditEvents(element);
      await settleFrameworkUpdates(element);
      if (element.checked !== action.checked) throw new Error("CHECK_VERIFICATION_FAILED");
      break;
    case ACTION_TYPES.FOCUS:
      break;
    default:
      throw new Error("ACTION_NOT_EXECUTABLE");
  }
}

export async function executeValidatedActions({
  actions,
  scan,
  profileValues,
  now = performance.now.bind(performance),
}) {
  const auditEntries = [];
  let filledCount = 0;

  for (const action of actions) {
    const element = scan.elementByFieldId.get(action.target);
    const startedAt = now();

    try {
      await executeAction(action, element, profileValues);
      highlight(element, "success");
      if (action.action !== ACTION_TYPES.FOCUS) filledCount += 1;
      auditEntries.push(createAuditEntry({
        fieldId: action.target,
        profileKey: action.profileKey,
        action: action.action,
        status: "success",
        durationMs: now() - startedAt,
        code: "OK",
      }));
    } catch (error) {
      if (element) highlight(element, "failed");
      auditEntries.push(createAuditEntry({
        fieldId: action.target,
        profileKey: action.profileKey,
        action: action.action,
        status: "failed",
        durationMs: now() - startedAt,
        code: error?.message,
      }));
      return {
        ok: false,
        actionCount: actions.length,
        filledCount,
        auditEntries,
      };
    }
  }

  return {
    ok: true,
    actionCount: actions.length,
    filledCount,
    auditEntries,
  };
}
