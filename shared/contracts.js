import { ACTION_TYPES, isAllowedActionType } from "./action-types.js";
import {
  isRiskLevel,
  isSupportedProfileKey,
  UNKNOWN_SENSITIVE,
} from "./pii-taxonomy.js";

export const CONTRACT_VERSION = 1;

export const CONTRACT_LIMITS = Object.freeze({
  MAX_TASK_LENGTH: 300,
  MAX_FIELDS: 100,
  MAX_ACTIONS: 100,
  MAX_LABEL_LENGTH: 200,
  MAX_OPTIONS_PER_FIELD: 100,
  MAX_OPTION_LENGTH: 200,
  MAX_ID_LENGTH: 100,
  MAX_REASON_LENGTH: 300,
});

export const FIELD_TAGS = Object.freeze(["input", "select", "textarea"]);
export const FIELD_TYPES = Object.freeze([
  "text",
  "email",
  "tel",
  "date",
  "number",
  "textarea",
  "select",
  "radio",
  "checkbox",
]);
export const PLANNER_TYPES = Object.freeze(["remote", "fallback"]);

export class ContractValidationError extends Error {
  constructor(contractName, errors) {
    super(`${contractName} validation failed`);
    this.name = "ContractValidationError";
    this.code = "CONTRACT_VALIDATION_FAILED";
    this.contractName = contractName;
    this.errors = errors;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function validateStrictKeys(value, allowedKeys, path, errors) {
  if (!isPlainObject(value)) {
    addError(errors, path, "EXPECTED_OBJECT", "Expected a plain object.");
    return false;
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      addError(errors, `${path}.${key}`, "UNKNOWN_PROPERTY", "Property is not allowed by this contract.");
    }
  }
  return true;
}

function validateString(value, path, errors, { min = 1, max, allowed } = {}) {
  if (typeof value !== "string") {
    addError(errors, path, "EXPECTED_STRING", "Expected a string.");
    return false;
  }
  if (value.length < min) {
    addError(errors, path, "STRING_TOO_SHORT", `Must contain at least ${min} character(s).`);
  }
  if (max !== undefined && value.length > max) {
    addError(errors, path, "STRING_TOO_LONG", `Must contain at most ${max} characters.`);
  }
  if (allowed && !allowed.includes(value)) {
    addError(errors, path, "UNSUPPORTED_VALUE", "Value is not in the allowed set.");
  }
  return true;
}

function validateBoolean(value, path, errors) {
  if (typeof value !== "boolean") {
    addError(errors, path, "EXPECTED_BOOLEAN", "Expected a boolean.");
    return false;
  }
  return true;
}

function validateId(value, path, errors) {
  return validateString(value, path, errors, { max: CONTRACT_LIMITS.MAX_ID_LENGTH });
}

function validateField(field, index, errors) {
  const path = `fields[${index}]`;
  if (!validateStrictKeys(
    field,
    [
      "fieldId", "formId", "tag", "type", "label", "required", "options",
      "suggestedProfileKey", "risk",
    ],
    path,
    errors,
  )) return;

  validateId(field.fieldId, `${path}.fieldId`, errors);
  validateId(field.formId, `${path}.formId`, errors);
  validateString(field.tag, `${path}.tag`, errors, { allowed: FIELD_TAGS });
  validateString(field.type, `${path}.type`, errors, { allowed: FIELD_TYPES });
  validateString(field.label, `${path}.label`, errors, {
    max: CONTRACT_LIMITS.MAX_LABEL_LENGTH,
  });
  validateBoolean(field.required, `${path}.required`, errors);

  if (!Array.isArray(field.options)) {
    addError(errors, `${path}.options`, "EXPECTED_ARRAY", "Expected an array of safe option strings.");
  } else {
    if (field.options.length > CONTRACT_LIMITS.MAX_OPTIONS_PER_FIELD) {
      addError(errors, `${path}.options`, "ARRAY_TOO_LONG", "Too many field options.");
    }
    field.options.forEach((option, optionIndex) => {
      validateString(option, `${path}.options[${optionIndex}]`, errors, {
        max: CONTRACT_LIMITS.MAX_OPTION_LENGTH,
      });
    });
  }

  if (
    field.suggestedProfileKey !== null
    && field.suggestedProfileKey !== UNKNOWN_SENSITIVE
    && !isSupportedProfileKey(field.suggestedProfileKey)
  ) {
    addError(
      errors,
      `${path}.suggestedProfileKey`,
      "UNSUPPORTED_PROFILE_KEY",
      "Profile key is not supported by the MVP taxonomy.",
    );
  }

  if (!isRiskLevel(field.risk)) {
    addError(errors, `${path}.risk`, "UNSUPPORTED_RISK", "Risk level is not supported.");
  }
}

export function validatePlanningRequest(value) {
  const errors = [];
  const path = "request";

  if (!validateStrictKeys(
    value,
    [
      "contractVersion", "requestId", "snapshotId", "task", "availableProfileKeys",
      "fields",
    ],
    path,
    errors,
  )) return { ok: false, errors };

  if (value.contractVersion !== CONTRACT_VERSION) {
    addError(errors, `${path}.contractVersion`, "UNSUPPORTED_VERSION", `Expected version ${CONTRACT_VERSION}.`);
  }
  validateId(value.requestId, `${path}.requestId`, errors);
  validateId(value.snapshotId, `${path}.snapshotId`, errors);
  validateString(value.task, `${path}.task`, errors, { max: CONTRACT_LIMITS.MAX_TASK_LENGTH });

  if (!Array.isArray(value.availableProfileKeys)) {
    addError(errors, `${path}.availableProfileKeys`, "EXPECTED_ARRAY", "Expected an array of profile-key names.");
  } else {
    const seenKeys = new Set();
    value.availableProfileKeys.forEach((key, index) => {
      if (!isSupportedProfileKey(key)) {
        addError(
          errors,
          `${path}.availableProfileKeys[${index}]`,
          "UNSUPPORTED_PROFILE_KEY",
          "Profile key is not supported.",
        );
      }
      if (seenKeys.has(key)) {
        addError(errors, `${path}.availableProfileKeys[${index}]`, "DUPLICATE_VALUE", "Profile keys must be unique.");
      }
      seenKeys.add(key);
    });
  }

  if (!Array.isArray(value.fields)) {
    addError(errors, `${path}.fields`, "EXPECTED_ARRAY", "Expected an array of sanitized fields.");
  } else {
    if (value.fields.length > CONTRACT_LIMITS.MAX_FIELDS) {
      addError(errors, `${path}.fields`, "ARRAY_TOO_LONG", "Too many fields in one planning request.");
    }
    const seenFieldIds = new Set();
    value.fields.forEach((field, index) => {
      validateField(field, index, errors);
      if (isPlainObject(field) && typeof field.fieldId === "string") {
        if (seenFieldIds.has(field.fieldId)) {
          addError(errors, `${path}.fields[${index}].fieldId`, "DUPLICATE_VALUE", "Field IDs must be unique.");
        }
        seenFieldIds.add(field.fieldId);
      }
    });
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

function validateAction(action, index, errors) {
  const path = `response.actions[${index}]`;
  if (!isPlainObject(action)) {
    addError(errors, path, "EXPECTED_OBJECT", "Expected an action object.");
    return;
  }

  if (!isAllowedActionType(action.action)) {
    addError(errors, `${path}.action`, "UNSAFE_ACTION", "Action is not on the allowlist.");
    return;
  }

  const allowedKeysByAction = {
    [ACTION_TYPES.FILL_PRIVATE]: ["action", "target", "profileKey"],
    [ACTION_TYPES.SELECT]: ["action", "target", "value"],
    [ACTION_TYPES.CHECK]: ["action", "target", "checked"],
    [ACTION_TYPES.FOCUS]: ["action", "target"],
    [ACTION_TYPES.REQUEST_CONFIRMATION]: ["action", "reason"],
  };

  validateStrictKeys(action, allowedKeysByAction[action.action], path, errors);

  if (action.action !== ACTION_TYPES.REQUEST_CONFIRMATION) {
    validateId(action.target, `${path}.target`, errors);
  }

  switch (action.action) {
    case ACTION_TYPES.FILL_PRIVATE:
      if (!isSupportedProfileKey(action.profileKey)) {
        addError(errors, `${path}.profileKey`, "UNSUPPORTED_PROFILE_KEY", "Profile key is not supported.");
      }
      break;
    case ACTION_TYPES.SELECT:
      validateString(action.value, `${path}.value`, errors, {
        max: CONTRACT_LIMITS.MAX_OPTION_LENGTH,
      });
      break;
    case ACTION_TYPES.CHECK:
      validateBoolean(action.checked, `${path}.checked`, errors);
      break;
    case ACTION_TYPES.REQUEST_CONFIRMATION:
      if (action.reason !== undefined) {
        validateString(action.reason, `${path}.reason`, errors, {
          max: CONTRACT_LIMITS.MAX_REASON_LENGTH,
        });
      }
      break;
    default:
      break;
  }
}

export function validatePlanningResponse(value) {
  const errors = [];
  const path = "response";

  if (!validateStrictKeys(
    value,
    ["contractVersion", "requestId", "snapshotId", "planner", "actions", "requiresConfirmation"],
    path,
    errors,
  )) return { ok: false, errors };

  if (value.contractVersion !== CONTRACT_VERSION) {
    addError(errors, `${path}.contractVersion`, "UNSUPPORTED_VERSION", `Expected version ${CONTRACT_VERSION}.`);
  }
  validateId(value.requestId, `${path}.requestId`, errors);
  validateId(value.snapshotId, `${path}.snapshotId`, errors);
  validateString(value.planner, `${path}.planner`, errors, { allowed: PLANNER_TYPES });

  if (!Array.isArray(value.actions)) {
    addError(errors, `${path}.actions`, "EXPECTED_ARRAY", "Expected an array of actions.");
  } else {
    if (value.actions.length > CONTRACT_LIMITS.MAX_ACTIONS) {
      addError(errors, `${path}.actions`, "ARRAY_TOO_LONG", "Too many actions in one plan.");
    }
    value.actions.forEach((action, index) => validateAction(action, index, errors));
  }

  if (value.requiresConfirmation !== true) {
    addError(
      errors,
      `${path}.requiresConfirmation`,
      "CONFIRMATION_REQUIRED",
      "MVP plans must require final user confirmation.",
    );
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

export function assertValidPlanningRequest(value) {
  const result = validatePlanningRequest(value);
  if (!result.ok) throw new ContractValidationError("PlanningRequest", result.errors);
  return result.value;
}

export function assertValidPlanningResponse(value) {
  const result = validatePlanningResponse(value);
  if (!result.ok) throw new ContractValidationError("PlanningResponse", result.errors);
  return result.value;
}
