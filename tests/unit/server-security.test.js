import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createConfig } from "../../server/config.js";
import { isAllowedOrigin } from "../../server/security/cors.js";
import { createSafeLogger } from "../../server/security/safe-logger.js";

describe("server configuration and security helpers", () => {
  it("uses fallback mode when remote credentials are incomplete", () => {
    const config = createConfig({ PLANNER_MODE: "remote", OPENAI_API_KEY: "", OPENAI_MODEL: "" });
    assert.equal(config.requestedPlanner, "remote");
    assert.equal(config.effectivePlanner, "fallback");
    assert.equal(config.remoteConfigured, false);
  });

  it("activates remote mode only when both server credentials exist", () => {
    const config = createConfig({
      PLANNER_MODE: "remote",
      OPENAI_API_KEY: "fictional-api-key",
      OPENAI_MODEL: "fictional-model",
    });
    assert.equal(config.effectivePlanner, "remote");
    assert.equal(config.remoteConfigured, true);
  });

  it("allows only absent, Chrome-extension, and local development origins", () => {
    assert.equal(isAllowedOrigin(undefined), true);
    assert.equal(isAllowedOrigin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"), true);
    assert.equal(isAllowedOrigin("http://localhost:8787"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:5173"), true);
    assert.equal(isAllowedOrigin("https://example.com"), false);
    assert.equal(isAllowedOrigin("chrome-extension://invalid"), false);
  });

  it("logs only the approved request metadata", () => {
    const lines = [];
    const logger = createSafeLogger((line) => lines.push(line));
    const record = logger.plan({
      requestId: "request-safe-001",
      fieldCount: 7,
      planner: "fallback",
      durationMs: 12.6,
      outcome: "accepted",
      code: "OK",
      request: { forbidden: "must-not-log" },
    });

    assert.deepEqual(Object.keys(record), [
      "event", "requestId", "fieldCount", "planner", "durationMs", "outcome", "code",
    ]);
    assert.equal(lines[0].includes("must-not-log"), false);
  });
});
