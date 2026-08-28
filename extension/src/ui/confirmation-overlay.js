import { ACTION_TYPES } from "../../../shared/action-types.js";
import { createAuditEntry } from "../core/audit-log.js";

const guardsByForm = new WeakMap();
const CATEGORY_LABELS = Object.freeze({
  "PROFILE.AADHAAR": "Aadhaar",
  "PROFILE.PAN": "PAN",
});

export class SubmissionGuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SubmissionGuardError";
    this.code = code;
  }
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function displayCategory(category) {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  return category?.startsWith("PROFILE.") ? titleCase(category.slice("PROFILE.".length)) : "Sensitive data";
}

function resolveTargetForm(scan, actions) {
  const forms = new Set();
  let formId = null;

  for (const action of actions) {
    if (!action.target) continue;
    const field = scan.fields.find((candidate) => candidate.fieldId === action.target);
    const element = scan.elementByFieldId.get(action.target);
    const form = element?.closest?.("form");
    if (field && form) {
      forms.add(form);
      formId ??= field.formId;
    }
  }

  if (forms.size === 0) {
    throw new SubmissionGuardError("FORM_NOT_FOUND", "No form was associated with the executed actions.");
  }
  if (forms.size !== 1) {
    throw new SubmissionGuardError("MULTIPLE_FORMS_UNSUPPORTED", "One action plan may guard only one form.");
  }
  return { form: [...forms][0], formId: formId ?? "FORM_0" };
}

function createElement(document, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createOverlay(state, submitter) {
  const { form, metadata } = state;
  const document = form.ownerDocument;
  const host = document.createElement("div");
  host.dataset.privacyfillOwned = "confirmation-overlay";
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
      padding: 20px; background: rgb(14 23 43 / 68%); font-family: Inter, system-ui, sans-serif; }
    .dialog { width: min(430px, calc(100vw - 40px)); border: 1px solid #dce3f0; border-radius: 20px;
      padding: 22px; color: #172033; background: #fff; box-shadow: 0 24px 80px rgb(10 20 40 / 35%); }
    .eyebrow { margin: 0 0 7px; color: #4564d8; font-size: 12px; font-weight: 800; letter-spacing: .08em;
      text-transform: uppercase; }
    h2 { margin: 0; font-size: 21px; line-height: 1.25; }
    .copy { margin: 10px 0 0; color: #59657b; font-size: 14px; line-height: 1.55; }
    .facts { display: grid; gap: 8px; margin: 17px 0; padding: 14px; border-radius: 14px; background: #f4f7fb; }
    .fact { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; }
    .fact span { color: #6a7488; } .fact strong { text-align: right; }
    .notice { margin: 0; border: 1px solid #b9e8d5; border-radius: 12px; padding: 11px 12px;
      color: #176748; background: #effaf5; font-size: 12px; line-height: 1.45; }
    .actions { display: grid; grid-template-columns: 1fr 1.3fr; gap: 10px; margin-top: 18px; }
    button { border: 0; border-radius: 12px; padding: 12px 14px; font: 700 14px Inter, system-ui, sans-serif;
      cursor: pointer; }
    .cancel { color: #344054; background: #edf1f6; } .submit { color: #fff; background: #4564d8; }
    button:focus-visible { outline: 3px solid #9eb1f2; outline-offset: 2px; }
  `;

  const backdrop = createElement(document, "div", "backdrop");
  const dialog = createElement(document, "section", "dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "privacyfill-confirm-title");
  dialog.append(
    createElement(document, "p", "eyebrow", "PrivacyFill confirmation"),
  );
  const title = createElement(document, "h2", "", "Review before local submission");
  title.id = "privacyfill-confirm-title";
  dialog.append(title);
  dialog.append(createElement(
    document,
    "p",
    "copy",
    "The extension filled this form locally. Confirm only after reviewing every visible field.",
  ));

  const facts = createElement(document, "div", "facts");
  const factRows = [
    ["Form", metadata.formName],
    ["Fields filled", String(metadata.filledCount)],
    [
      "Critical categories",
      metadata.criticalCategories.length > 0
        ? metadata.criticalCategories.map(displayCategory).join(", ")
        : "None",
    ],
  ];
  for (const [label, value] of factRows) {
    const row = createElement(document, "div", "fact");
    row.append(createElement(document, "span", "", label), createElement(document, "strong", "", value));
    facts.append(row);
  }
  dialog.append(facts);
  dialog.append(createElement(
    document,
    "p",
    "notice",
    "No private values are shown in this confirmation summary or written to the audit log.",
  ));

  const actions = createElement(document, "div", "actions");
  const cancel = createElement(document, "button", "cancel", "Cancel");
  cancel.type = "button";
  cancel.dataset.action = "cancel";
  const submit = createElement(document, "button", "submit", "Submit once");
  submit.type = "button";
  submit.dataset.action = "submit-once";
  actions.append(cancel, submit);
  dialog.append(actions);
  backdrop.append(dialog);
  shadow.append(style, backdrop);
  document.documentElement.append(host);
  state.host = host;

  const close = () => {
    host.remove();
    if (state.host === host) state.host = null;
  };
  const record = (status, code) => state.onAudit?.(createAuditEntry({
    fieldId: metadata.formId,
    action: ACTION_TYPES.REQUEST_CONFIRMATION,
    status,
    durationMs: 0,
    code,
  }));

  cancel.addEventListener("click", () => {
    record("skipped", "CONFIRMATION_CANCELLED");
    close();
  });
  submit.addEventListener("click", () => {
    record("success", "CONFIRMATION_ACCEPTED");
    close();
    state.bypassNext = true;
    try {
      if (typeof form.requestSubmit === "function") form.requestSubmit(submitter ?? undefined);
      else {
        const SubmitEventConstructor = document.defaultView?.SubmitEvent ?? document.defaultView?.Event;
        form.dispatchEvent(new SubmitEventConstructor("submit", { bubbles: true, cancelable: true }));
      }
    } catch {
      state.bypassNext = false;
      record("failed", "SUBMIT_ONCE_FAILED");
    }
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) cancel.click();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancel.click();
  });
  submit.focus();
  record("success", "CONFIRMATION_REQUESTED");
}

export function armSubmissionGuard({
  scan,
  actions,
  filledCount,
  criticalCategories = [],
  onAudit,
}) {
  const { form, formId } = resolveTargetForm(scan, actions);
  const formName = titleCase(form.dataset.demoForm || form.getAttribute("aria-label") || formId);
  const metadata = {
    formId,
    formName: formName || "Current Application Form",
    filledCount: Math.max(0, Number(filledCount) || 0),
    criticalCategories: [...new Set(criticalCategories)],
  };

  const existing = guardsByForm.get(form);
  if (existing) {
    existing.metadata = metadata;
    existing.onAudit = onAudit;
    return existing.controller;
  }

  const state = { form, metadata, onAudit, bypassNext: false, host: null };
  const listener = (event) => {
    if (state.bypassNext) {
      state.bypassNext = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!state.host) createOverlay(state, event.submitter);
  };
  form.addEventListener("submit", listener, true);

  const controller = Object.freeze({
    formId,
    formName,
    disarm() {
      state.host?.remove();
      state.host = null;
      form.removeEventListener("submit", listener, true);
      guardsByForm.delete(form);
    },
  });
  state.controller = controller;
  guardsByForm.set(form, state);
  return controller;
}
