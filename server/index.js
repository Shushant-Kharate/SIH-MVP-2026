import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { createConfig } from "./config.js";
import { createSafeErrorBody } from "./errors.js";
import { createPlannerService } from "./planners/planner-service.js";
import { createRemotePlanner } from "./planners/remote-planner.js";
import { createHealthRouter } from "./routes/health.js";
import { createPlanRouter } from "./routes/plan.js";
import { localCors } from "./security/cors.js";
import { createRateLimiter } from "./security/rate-limit.js";
import { createSafeLogger } from "./security/safe-logger.js";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const demoDirectory = path.resolve(serverDirectory, "..", "demo");

function setSecurityHeaders(_responsePath, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

export function createApp({
  config = createConfig(),
  fetchImpl = fetch,
  logWriter,
  plannerService,
  rateLimiter,
} = {}) {
  const app = express();
  app.disable("x-powered-by");

  const logger = createSafeLogger(logWriter);
  const remotePlanner = config.effectivePlanner === "remote"
    ? createRemotePlanner({
      apiKey: config.openAiApiKey,
      model: config.openAiModel,
      endpoint: config.openAiEndpoint,
      timeoutMs: config.remoteTimeoutMs,
      fetchImpl,
    })
    : undefined;
  const activePlannerService = plannerService ?? createPlannerService({
    mode: config.effectivePlanner,
    remotePlanner,
  });
  const activeRateLimiter = rateLimiter ?? createRateLimiter({ limit: config.rateLimitPerMinute });

  app.use("/api", localCors);
  app.use("/api", express.json({ limit: "32kb", strict: true }));
  app.use("/api/health", createHealthRouter(config));
  app.use("/api/plan", createPlanRouter({
    plannerService: activePlannerService,
    logger,
    rateLimiter: activeRateLimiter,
  }));

  app.get("/", (_request, response) => response.redirect(302, "/demo/"));
  app.use("/demo", express.static(demoDirectory, {
    fallthrough: false,
    index: "index.html",
    redirect: true,
    setHeaders: setSecurityHeaders,
  }));

  app.use("/api", (_request, response) => {
    response.status(404).json(createSafeErrorBody("API_NOT_FOUND", "API route not found."));
  });

  app.use((error, request, response, _next) => {
    if (response.headersSent) return;

    if (error?.type === "entity.too.large") {
      response.status(413).json(createSafeErrorBody("REQUEST_TOO_LARGE", "JSON request body is too large."));
      return;
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      response.status(400).json(createSafeErrorBody("INVALID_JSON", "Request body must be valid JSON."));
      return;
    }
    if (error?.status === 404 && request.path.startsWith("/demo")) {
      response.status(404).type("text/plain").send("Not found");
      return;
    }

    response.status(500).json(createSafeErrorBody("INTERNAL_ERROR", "The planner service could not complete the request."));
  });

  return app;
}

export function startServer(options = {}) {
  const config = options.config ?? createConfig();
  const app = createApp({ ...options, config });
  return app.listen(config.port, "127.0.0.1", () => {
    console.log(`PrivacyFill server: http://localhost:${config.port}`);
    console.log(`Planner mode: ${config.effectivePlanner}`);
  });
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) startServer();
