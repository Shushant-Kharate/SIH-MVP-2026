import { ACTION_TYPES } from "../../../shared/action-types.js";
import {
  assertValidPlanningRequest,
  assertValidPlanningResponse,
  ContractValidationError,
} from "../../../shared/contracts.js";
import { PII_TAXONOMY, isSupportedProfileKey } from "../../../shared/pii-taxonomy.js";

export class ActionValidationError extends Error {
  constructor(errors) {
    super("The action plan failed local safety validation.");
    this.name = "ActionValidationError";
    this.code = "ACTION_PLAN_REJECTED";
    this.errors = errors;
  }
}

function addError(errors, code, actionIndex, fieldId) {
  errors.push({ code, actionIndex, ...(fieldId ? { fieldId } : {}) });
}

function isVisible(element) {
  if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
  if (element.closest?.("[hidden], [aria-hidden='true'], [data-privacyfill-owned]")) return false;
  const inlineStyle = (element.getAttribute?.("style") ?? "").replace(/\s+/g, "").toLowerCase();
  if (inlineStyle.includes("display:none") || inlineStyle.includes("visibility:hidden")) return false;

  const computed = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return computed?.display !== "none" && computed?.visibility !== "hidden";
}

function isConnected(element) {
  if (!element) return false;
  if (element.isConnected === false) return false;
  return element.ownerDocument?.documentElement?.contains?.(element) !== false;
}

function validateTargetState(action, actionIndex, requestField, scanField, element, errors) {
  if (!requestField || !scanField || !element) {
    addError(errors, "TARGET_NOT_FOUND", actionIndex, action.target);
    return false;
  }
  if (!isConnected(element)) {
    addError(errors, "TARGET_REPLACED", actionIndex, action.target);
    return false;
  }
  if (!isVisible(element)) {
    addError(errors, "TARGET_NOT_VISIBLE", actionIndex, action.target);
    return false;
  }
  if (element.disabled) {
    addError(errors, "TARGET_DISABLED", actionIndex, action.target);
    return false;
  }
  if (action.action !== ACTION_TYPES.FOCUS && (element.readOnly || element.hasAttribute?.("readonly"))) {
    addError(errors, "TARGET_READONLY", actionIndex, action.target);
    return false;
  }
  if (requestField.type !== scanField.type || requestField.formId !== scanField.formId) {
    addError(errors, "TARGET_METADATA_CHANGED", actionIndex, action.target);
    return false;
  }
  return true;
}

export function validateActionPlan({
  plan,
  request,
  scan,
  availableProfileKeys,
  criticalApproved = false,
}) {
  try {
    assertValidPlanningRequest(request);
    assertValidPlanningResponse(plan);
  } catch (error) {
    if (error instanceof ContractValidationError) {
      throw new ActionValidationError([{ code: "CONTRACT_INVALID", actionIndex: -1 }]);
    }
    throw error;
  }

  const errors = [];
  if (plan.requestId !== request.requestId) addError(errors, "REQUEST_ID_MISMATCH", -1);
  if (plan.snapshotId !== request.snapshotId) addError(errors, "PLAN_SNAPSHOT_MISMATCH", -1);
  if (scan.snapshotId !== request.snapshotId) addError(errors, "LIVE_SNAPSHOT_CHANGED", -1);

  const requestFields = new Map(request.fields.map((field) => [field.fieldId, field]));
  const scanFields = new Map(scan.fields.map((field) => [field.fieldId, field]));
  const available = new Set(availableProfileKeys);
  const targeted = new Set();
  const executableActions = [];

  plan.actions.forEach((action, actionIndex) => {
    if (action.action === ACTION_TYPES.REQUEST_CONFIRMATION) return;

    if (targeted.has(action.target)) {
      addError(errors, "DUPLICATE_TARGET_ACTION", actionIndex, action.target);
      return;
    }
    targeted.add(action.target);

    const requestField = requestFields.get(action.target);
    const scanField = scanFields.get(action.target);
    const element = scan.elementByFieldId.get(action.target);
    if (!validateTargetState(action, actionIndex, requestField, scanField, element, errors)) return;

    switch (action.action) {
      case ACTION_TYPES.FILL_PRIVATE: {
        if (!isSupportedProfileKey(action.profileKey) || !available.has(action.profileKey)) {
          addError(errors, "PROFILE_KEY_UNAVAILABLE", actionIndex, action.target);
          return;
        }
        if (
          requestField.suggestedProfileKey !== action.profileKey
          || scanField.classification.category !== action.profileKey
        ) {
          addError(errors, "PROFILE_KEY_MISMATCH", actionIndex, action.target);
          return;
        }
        if (!PII_TAXONOMY[action.profileKey].compatibleTypes.includes(scanField.type)) {
          addError(errors, "INCOMPATIBLE_CONTROL_TYPE", actionIndex, action.target);
          return;
        }
        if (requestField.risk === "critical" && !criticalApproved) {
          addError(errors, "CRITICAL_CONFIRMATION_REQUIRED", actionIndex, action.target);
          return;
        }
        break;
      }
      case ACTION_TYPES.SELECT:
        if (scanField.type !== "select") {
          addError(errors, "SELECT_TARGET_INVALID", actionIndex, action.target);
          return;
        }
        if (!requestField.options.includes(action.value)) {
          addError(errors, "SELECT_OPTION_NOT_ALLOWED", actionIndex, action.target);
          return;
        }
        break;
      case ACTION_TYPES.CHECK:
        if (!new Set(["checkbox", "radio"]).has(scanField.type)) {
          addError(errors, "CHECK_TARGET_INVALID", actionIndex, action.target);
          return;
        }
        break;
      case ACTION_TYPES.FOCUS:
        break;
      default:
        addError(errors, "ACTION_NOT_ALLOWED", actionIndex, action.target);
        return;
    }

    executableActions.push(action);
  });

  if (errors.length > 0) throw new ActionValidationError(errors);
  return { actions: executableActions, snapshotId: scan.snapshotId };
}
