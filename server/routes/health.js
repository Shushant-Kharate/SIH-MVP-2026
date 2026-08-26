import express from "express";

export function createHealthRouter(config) {
  const router = express.Router();

  router.get("/", (_request, response) => {
    response.json({
      status: "ok",
      service: "privacyfill-planner",
      planner: config.effectivePlanner,
      requestedPlanner: config.requestedPlanner,
      remoteConfigured: config.remoteConfigured,
    });
  });

  return router;
}
