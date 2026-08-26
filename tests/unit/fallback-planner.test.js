import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ACTION_TYPES } from "../../shared/action-types.js";
import { CONTRACT_LIMITS, validatePlanningResponse } from "../../shared/contracts.js";
import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { createFallbackPlan } from "../../server/planners/fallback-planner.js";
import { createSanitizedPlanningRequest } from "../fixtures/sanitized-form.js";

describe("deterministic fallback planner", () => {
  it("creates a valid private-reference plan without literal values", () => {
    const request = createSanitizedPlanningRequest();
    const plan = createFallbackPlan(request);

    assert.equal(validatePlanningResponse(plan).ok, true);
    assert.equal(plan.planner, "fallback");
    assert.deepEqual(plan.actions, [
      { action: ACTION_TYPES.FILL_PRIVATE, target: "FIELD_1", profileKey: PROFILE_KEYS.NAME },
      { action: ACTION_TYPES.FILL_PRIVATE, target: "FIELD_2", profileKey: PROFILE_KEYS.EMAIL },
      {
        action: ACTION_TYPES.REQUEST_CONFIRMATION,
        reason: "Review the completed form before submission",
      },
    ]);
    assert.equal(JSON.stringify(plan).includes("value"), false);
  });

  it("skips unavailable, unclassified and incompatible fields", () => {
    const request = createSanitizedPlanningRequest();
    request.availableProfileKeys = [PROFILE_KEYS.NAME];
    request.fields[0].type = "email";

    const plan = createFallbackPlan(request);

    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].action, ACTION_TYPES.REQUEST_CONFIRMATION);
  });

  it("sorts form and field identifiers naturally", () => {
    const request = createSanitizedPlanningRequest();
    request.availableProfileKeys = [PROFILE_KEYS.NAME, PROFILE_KEYS.EMAIL];
    request.fields = [
      { ...request.fields[0], fieldId: "FIELD_10" },
      { ...request.fields[1], fieldId: "FIELD_2" },
    ];

    const plan = createFallbackPlan(request);
    assert.deepEqual(plan.actions.slice(0, 2).map((action) => action.target), ["FIELD_2", "FIELD_10"]);
  });

  it("never exceeds the response action limit", () => {
    const request = createSanitizedPlanningRequest();
    request.availableProfileKeys = [PROFILE_KEYS.NAME];
    request.fields = Array.from({ length: CONTRACT_LIMITS.MAX_FIELDS }, (_, index) => ({
      ...request.fields[0],
      fieldId: `FIELD_${index + 1}`,
    }));

    const plan = createFallbackPlan(request);
    assert.equal(plan.actions.length, CONTRACT_LIMITS.MAX_ACTIONS);
    assert.equal(plan.actions.at(-1).action, ACTION_TYPES.REQUEST_CONFIRMATION);
  });
});
