import { ACTION_TYPES } from "../../shared/action-types.js";
import { CONTRACT_VERSION } from "../../shared/contracts.js";
import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";

export function createValidPlan() {
  return {
    contractVersion: CONTRACT_VERSION,
    requestId: "request-demo-001",
    snapshotId: "snapshot-demo-001",
    planner: "fallback",
    actions: [
      {
        action: ACTION_TYPES.FILL_PRIVATE,
        target: "FIELD_1",
        profileKey: PROFILE_KEYS.NAME,
      },
      {
        action: ACTION_TYPES.FILL_PRIVATE,
        target: "FIELD_2",
        profileKey: PROFILE_KEYS.EMAIL,
      },
      {
        action: ACTION_TYPES.SELECT,
        target: "FIELD_3",
        value: "Engineering",
      },
      {
        action: ACTION_TYPES.REQUEST_CONFIRMATION,
        reason: "Review the completed form before submission",
      },
    ],
    requiresConfirmation: true,
  };
}
