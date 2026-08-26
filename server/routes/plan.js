import express from "express";

import { createSafeErrorBody } from "../errors.js";
import { requireValidPlanningRequest } from "../validation/request-validator.js";

export function createPlanRouter({ plannerService, logger, rateLimiter }) {
  const router = express.Router();

  router.post("/", rateLimiter, async (request, response, next) => {
    const startedAt = performance.now();
    let planningRequest;

    try {
      planningRequest = requireValidPlanningRequest(request.body);
      const result = await plannerService.plan(planningRequest);

      logger.plan({
        requestId: planningRequest.requestId,
        fieldCount: planningRequest.fields.length,
        planner: result.plan.planner,
        durationMs: performance.now() - startedAt,
        outcome: result.usedFallback ? "fallback" : "accepted",
        code: result.fallbackCode,
      });
      response.json(result.plan);
    } catch (error) {
      if (error?.status) {
        logger.plan({
          requestId: planningRequest?.requestId ?? request.body?.requestId,
          fieldCount: planningRequest?.fields?.length ?? 0,
          planner: "none",
          durationMs: performance.now() - startedAt,
          outcome: "rejected",
          code: error.code,
        });
        response.status(error.status).json(createSafeErrorBody(error.code, error.message, error.details));
        return;
      }
      next(error);
    }
  });

  return router;
}
