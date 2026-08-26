import { ACTION_TYPES } from "../../shared/action-types.js";
import { CONTRACT_LIMITS, CONTRACT_VERSION } from "../../shared/contracts.js";
import { PII_TAXONOMY, isSupportedProfileKey } from "../../shared/pii-taxonomy.js";

function naturalIdOrder(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function isCompatible(field) {
  if (!isSupportedProfileKey(field.suggestedProfileKey)) return false;
  return PII_TAXONOMY[field.suggestedProfileKey].compatibleTypes.includes(field.type);
}

export function createFallbackPlan(request) {
  const available = new Set(request.availableProfileKeys);
  const orderedFields = [...request.fields].sort(
    (left, right) => naturalIdOrder(left.formId, right.formId)
      || naturalIdOrder(left.fieldId, right.fieldId),
  );

  const privateActions = orderedFields
    .filter((field) => available.has(field.suggestedProfileKey) && isCompatible(field))
    .slice(0, CONTRACT_LIMITS.MAX_ACTIONS - 1)
    .map((field) => ({
      action: ACTION_TYPES.FILL_PRIVATE,
      target: field.fieldId,
      profileKey: field.suggestedProfileKey,
    }));

  return {
    contractVersion: CONTRACT_VERSION,
    requestId: request.requestId,
    snapshotId: request.snapshotId,
    planner: "fallback",
    actions: [
      ...privateActions,
      {
        action: ACTION_TYPES.REQUEST_CONFIRMATION,
        reason: "Review the completed form before submission",
      },
    ],
    requiresConfirmation: true,
  };
}
