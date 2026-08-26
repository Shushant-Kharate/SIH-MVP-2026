import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestPlannerPlan, PlannerClientError } from "../../extension/src/core/planner-client.js";
import { createFallbackPlan } from "../../server/planners/fallback-planner.js";
import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";
import { createSanitizedPlanningRequest } from "../fixtures/sanitized-form.js";

describe("extension planner client", () => {
  it("posts the exact safe request and accepts a correlated plan", async () => {
    const request = createSanitizedPlanningRequest();
    const expected = createFallbackPlan(request);
    let sentBody;
    const plan = await requestPlannerPlan({
      request,
      profileValues: FAKE_PROFILE,
      fetchImpl: async (_url, options) => {
        sentBody = options.body;
        return new Response(JSON.stringify(expected), { status: 200 });
      },
    });

    assert.equal(sentBody, JSON.stringify(request));
    assert.deepEqual(plan, expected);
    for (const rawValue of Object.values(FAKE_PROFILE)) assert.equal(sentBody.includes(rawValue), false);
  });

  it("rejects network failures, stale plans, and unsafe plan shapes", async () => {
    const request = createSanitizedPlanningRequest();
    const validPlan = createFallbackPlan(request);
    const fetches = [
      async () => { throw new Error("offline"); },
      async () => new Response(JSON.stringify({ ...validPlan, snapshotId: "stale" }), { status: 200 }),
      async () => new Response(JSON.stringify({ ...validPlan, actions: [{ action: "submit" }] }), { status: 200 }),
    ];

    for (const fetchImpl of fetches) {
      await assert.rejects(
        requestPlannerPlan({ request, profileValues: FAKE_PROFILE, fetchImpl }),
        PlannerClientError,
      );
    }
  });

  it("blocks a protected value injected into either request or response", async () => {
    const unsafeRequest = createSanitizedPlanningRequest();
    unsafeRequest.fields[0].label = FAKE_PROFILE[PROFILE_KEYS.NAME];
    await assert.rejects(
      requestPlannerPlan({ request: unsafeRequest, profileValues: FAKE_PROFILE, fetchImpl: async () => null }),
      (error) => error.code === "PRIVACY_LEAK_BLOCKED",
    );

    const request = createSanitizedPlanningRequest();
    const unsafePlan = createFallbackPlan(request);
    unsafePlan.actions.unshift({
      action: "select",
      target: "FIELD_3",
      value: FAKE_PROFILE[PROFILE_KEYS.NAME],
    });
    await assert.rejects(
      requestPlannerPlan({
        request,
        profileValues: FAKE_PROFILE,
        fetchImpl: async () => new Response(JSON.stringify(unsafePlan), { status: 200 }),
      }),
      (error) => error.code === "PLANNER_RESPONSE_LEAK",
    );
  });
});
