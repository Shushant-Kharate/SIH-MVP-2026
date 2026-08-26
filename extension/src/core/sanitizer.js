import {
  assertValidPlanningRequest,
  CONTRACT_LIMITS,
  CONTRACT_VERSION,
  FIELD_TYPES,
} from "../../../shared/contracts.js";
import { isSupportedProfileKey, UNKNOWN_SENSITIVE } from "../../../shared/pii-taxonomy.js";

export const DEFAULT_PLANNING_TASK = "Fill this application form using my saved profile";

const TYPE_NORMALIZATION = Object.freeze({
  search: "text",
  url: "text",
});

function normalizeText(value, maximum) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function normalizeType(value) {
  const type = String(value ?? "text").toLowerCase();
  const normalized = TYPE_NORMALIZATION[type] ?? type;
  return FIELD_TYPES.includes(normalized) ? normalized : null;
}

function sanitizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options
    .filter((option) => typeof option === "string")
    .map((option) => normalizeText(option, CONTRACT_LIMITS.MAX_OPTION_LENGTH))
    .filter(Boolean)
    .slice(0, CONTRACT_LIMITS.MAX_OPTIONS_PER_FIELD);
}

function sanitizeField(field) {
  if (!field || typeof field !== "object") return null;
  if (field.suggestedProfileKey === UNKNOWN_SENSITIVE || field.readonly === true) return null;

  const type = normalizeType(field.type);
  if (!type) return null;

  const suggestedProfileKey = isSupportedProfileKey(field.suggestedProfileKey)
    ? field.suggestedProfileKey
    : null;

  return {
    fieldId: normalizeText(field.fieldId, CONTRACT_LIMITS.MAX_ID_LENGTH),
    formId: normalizeText(field.formId, CONTRACT_LIMITS.MAX_ID_LENGTH),
    tag: normalizeText(field.tag, 20).toLowerCase(),
    type,
    label: normalizeText(field.label, CONTRACT_LIMITS.MAX_LABEL_LENGTH),
    required: field.required === true,
    options: sanitizeOptions(field.options),
    suggestedProfileKey,
    risk: ["low", "medium", "high", "critical"].includes(field.risk) ? field.risk : "low",
  };
}

export function createPlanningRequest({
  scanResult,
  availableProfileKeys,
  requestId,
  task = DEFAULT_PLANNING_TASK,
}) {
  if (!scanResult || typeof scanResult !== "object" || !Array.isArray(scanResult.fields)) {
    const error = new Error("A safe form scan is required.");
    error.code = "SCAN_REQUIRED";
    throw error;
  }

  const safeKeys = [...new Set(
    (Array.isArray(availableProfileKeys) ? availableProfileKeys : [])
      .filter(isSupportedProfileKey),
  )];

  const fields = scanResult.fields
    .map(sanitizeField)
    .filter(Boolean)
    .slice(0, CONTRACT_LIMITS.MAX_FIELDS);

  const planningRequest = {
    contractVersion: CONTRACT_VERSION,
    requestId: normalizeText(requestId, CONTRACT_LIMITS.MAX_ID_LENGTH),
    snapshotId: normalizeText(scanResult.snapshotId, CONTRACT_LIMITS.MAX_ID_LENGTH),
    task: normalizeText(task, CONTRACT_LIMITS.MAX_TASK_LENGTH),
    availableProfileKeys: safeKeys,
    fields,
  };

  return assertValidPlanningRequest(planningRequest);
}

export function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
