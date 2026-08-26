import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPlannerService } from "../../server/planners/planner-service.js";
import { createSanitizedPlanningRequest } from "../fixtures/sanitized-form.js";
import { createValidPlan } from "../fixtures/valid-plan.js";

describe("planner service", () => {
  it("accepts a valid correlated remote plan", async () => {
    const request = createSanitizedPlanningRequest();
    const remotePlan = { ...createValidPlan(), planner: "remote" };
    const service = createPlannerService({ mode: "remote", remotePlanner: async () => remotePlan });

    const result = await service.plan(request);
    assert.equal(result.plan.planner, "remote");
    assert.equal(result.usedFallback, false);
  });

  it("falls back after remote errors, malformed actions, or stale identifiers", async () => {
    const request = createSanitizedPlanningRequest();
    const failures = [
      async () => { throw Object.assign(new Error("offline"), { code: "REMOTE_UNAVAILABLE" }); },
      async () => ({ ...createValidPlan(), actions: [{ action: "submit" }] }),
      async () => ({ ...createValidPlan(), planner: "remote", snapshotId: "stale-snapshot" }),
    ];

    for (const remotePlanner of failures) {
      const result = await createPlannerService({ mode: "remote", remotePlanner }).plan(request);
      assert.equal(result.plan.planner, "fallback");
      assert.equal(result.usedFallback, true);
    }
  });

  it("does not invoke the remote planner in fallback mode", async () => {
    let calls = 0;
    const service = createPlannerService({
      mode: "fallback",
      remotePlanner: async () => { calls += 1; },
    });

    const result = await service.plan(createSanitizedPlanningRequest());
    assert.equal(calls, 0);
    assert.equal(result.plan.planner, "fallback");
  });
});
