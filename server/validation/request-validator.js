import { validatePlanningRequest } from "../../shared/contracts.js";
import { SafeHttpError } from "../errors.js";

export function requireValidPlanningRequest(value) {
  const result = validatePlanningRequest(value);
  if (result.ok) return result.value;

  throw new SafeHttpError(
    400,
    "INVALID_PLANNING_REQUEST",
    "The sanitized planning request is invalid.",
    result.errors.map(({ path, code }) => ({ path, code })),
  );
}
