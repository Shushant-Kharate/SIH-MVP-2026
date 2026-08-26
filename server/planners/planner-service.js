import { createFallbackPlan } from "./fallback-planner.js";
import { requireValidPlannerResponse } from "../validation/response-validator.js";

export function createPlannerService({ mode = "fallback", remotePlanner } = {}) {
  return Object.freeze({
    async plan(request) {
      if (mode === "remote" && remotePlanner) {
        try {
          const remotePlan = await remotePlanner(request);
          return {
            plan: requireValidPlannerResponse(remotePlan, request),
            usedFallback: false,
          };
        } catch (error) {
          const fallbackPlan = createFallbackPlan(request);
          return {
            plan: requireValidPlannerResponse(fallbackPlan, request),
            usedFallback: true,
            fallbackCode: error?.code ?? "REMOTE_REJECTED",
          };
        }
      }

      const fallbackPlan = createFallbackPlan(request);
      return {
        plan: requireValidPlannerResponse(fallbackPlan, request),
        usedFallback: false,
      };
    },
  });
}
