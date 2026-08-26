import { validatePlanningResponse } from "../../shared/contracts.js";

export class UnsafePlannerResponseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UnsafePlannerResponseError";
    this.code = code;
  }
}

export function requireValidPlannerResponse(value, request) {
  const validation = validatePlanningResponse(value);
  if (!validation.ok) {
    throw new UnsafePlannerResponseError("INVALID_PLANNER_RESPONSE", "Planner response failed validation.");
  }
  if (value.requestId !== request.requestId) {
    throw new UnsafePlannerResponseError("REQUEST_ID_MISMATCH", "Planner response request ID did not match.");
  }
  if (value.snapshotId !== request.snapshotId) {
    throw new UnsafePlannerResponseError("SNAPSHOT_ID_MISMATCH", "Planner response snapshot ID did not match.");
  }
  return validation.value;
}
