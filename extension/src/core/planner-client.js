import {
  assertValidPlanningRequest,
  assertValidPlanningResponse,
  ContractValidationError,
} from "../../../shared/contracts.js";
import { assertNoProfileLeak, ProfileLeakError } from "./leak-checker.js";

export const PLANNER_ENDPOINT = "http://localhost:8787/api/plan";

export class PlannerClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PlannerClientError";
    this.code = code;
  }
}

function assertCorrelatedPlan(plan, request) {
  if (plan.requestId !== request.requestId) {
    throw new PlannerClientError("REQUEST_ID_MISMATCH", "The planner returned a mismatched request ID.");
  }
  if (plan.snapshotId !== request.snapshotId) {
    throw new PlannerClientError("SNAPSHOT_ID_MISMATCH", "The planner returned a stale form snapshot.");
  }
}

export async function requestPlannerPlan({
  request,
  profileValues,
  endpoint = PLANNER_ENDPOINT,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}) {
  try {
    assertValidPlanningRequest(request);
    assertNoProfileLeak(request, profileValues);
  } catch (error) {
    if (error instanceof ProfileLeakError) {
      throw new PlannerClientError("PRIVACY_LEAK_BLOCKED", "The outgoing request failed its privacy check.");
    }
    if (error instanceof ContractValidationError) {
      throw new PlannerClientError("INVALID_PLANNING_REQUEST", "The outgoing planning request is invalid.");
    }
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new PlannerClientError("PLANNER_TIMEOUT", "The local planner service timed out.");
    }
    throw new PlannerClientError("PLANNER_UNAVAILABLE", "Start the local planner service and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new PlannerClientError("PLANNER_REJECTED_REQUEST", "The planner service rejected the safe request.");
  }

  let plan;
  try {
    plan = await response.json();
    assertValidPlanningResponse(plan);
    assertCorrelatedPlan(plan, request);
    assertNoProfileLeak(plan, profileValues);
  } catch (error) {
    if (error instanceof ProfileLeakError) {
      throw new PlannerClientError("PLANNER_RESPONSE_LEAK", "The planner response contained a protected value.");
    }
    if (error instanceof PlannerClientError) throw error;
    throw new PlannerClientError("INVALID_PLANNER_RESPONSE", "The planner returned an invalid action plan.");
  }

  return plan;
}
