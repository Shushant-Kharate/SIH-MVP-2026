import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ACTION_TYPES, ALLOWED_ACTION_TYPES } from "../../shared/action-types.js";
import {
  assertValidPlanningRequest,
  assertValidPlanningResponse,
  ContractValidationError,
  CONTRACT_LIMITS,
  validatePlanningRequest,
  validatePlanningResponse,
} from "../../shared/contracts.js";
import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { PROFILE_KEYS, SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { createSanitizedPlanningRequest } from "../fixtures/sanitized-form.js";
import { createValidPlan } from "../fixtures/valid-plan.js";

function errorCodes(result) {
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe("shared constants", () => {
  it("exposes only the MVP action allowlist", () => {
    assert.deepEqual(ALLOWED_ACTION_TYPES, [
      "fill_private",
      "select",
      "check",
      "focus",
      "request_confirmation",
    ]);
    assert.equal(ALLOWED_ACTION_TYPES.includes("submit"), false);
    assert.equal(ALLOWED_ACTION_TYPES.includes("click"), false);
  });

  it("defines all seven supported profile keys", () => {
    assert.equal(SUPPORTED_PROFILE_KEYS.length, 7);
    assert.equal(SUPPORTED_PROFILE_KEYS.includes(PROFILE_KEYS.AADHAAR), true);
    assert.equal(SUPPORTED_PROFILE_KEYS.includes(PROFILE_KEYS.PAN), true);
  });

  it("defines the cross-component message names", () => {
    assert.equal(MESSAGE_TYPES.PLAN_REQUEST, "PLAN_REQUEST");
    assert.equal(MESSAGE_TYPES.PING_CONTENT_SCRIPT, "PING_CONTENT_SCRIPT");
    assert.equal(MESSAGE_TYPES.ARM_SUBMISSION_GUARD, "ARM_SUBMISSION_GUARD");
  });
});

describe("planning request contract", () => {
  it("accepts a valid sanitized request", () => {
    const request = createSanitizedPlanningRequest();
    const result = validatePlanningRequest(request);

    assert.equal(result.ok, true);
    assert.equal(assertValidPlanningRequest(request), request);
  });

  it("rejects an unrestricted profile object", () => {
    const request = createSanitizedPlanningRequest();
    request.profile = { [PROFILE_KEYS.EMAIL]: "should-never-be-accepted@example.test" };

    const result = validatePlanningRequest(request);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("UNKNOWN_PROPERTY"), true);
  });

  it("rejects a raw field value property", () => {
    const request = createSanitizedPlanningRequest();
    request.fields[0].value = "Aarav Demo Sharma";

    const result = validatePlanningRequest(request);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("UNKNOWN_PROPERTY"), true);
  });

  it("rejects unsupported and duplicate profile keys", () => {
    const request = createSanitizedPlanningRequest();
    request.availableProfileKeys = [PROFILE_KEYS.NAME, PROFILE_KEYS.NAME, "PROFILE.PASSWORD"];

    const result = validatePlanningRequest(request);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("DUPLICATE_VALUE"), true);
    assert.equal(errorCodes(result).includes("UNSUPPORTED_PROFILE_KEY"), true);
  });

  it("rejects duplicate field IDs", () => {
    const request = createSanitizedPlanningRequest();
    request.fields[1].fieldId = request.fields[0].fieldId;

    const result = validatePlanningRequest(request);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("DUPLICATE_VALUE"), true);
  });

  it("enforces the task, field, label and option limits", () => {
    const request = createSanitizedPlanningRequest();
    request.task = "t".repeat(CONTRACT_LIMITS.MAX_TASK_LENGTH + 1);
    request.fields[0].label = "l".repeat(CONTRACT_LIMITS.MAX_LABEL_LENGTH + 1);
    request.fields[0].options = Array.from(
      { length: CONTRACT_LIMITS.MAX_OPTIONS_PER_FIELD + 1 },
      (_, index) => `Option ${index}`,
    );
    request.fields = Array.from(
      { length: CONTRACT_LIMITS.MAX_FIELDS + 1 },
      (_, index) => ({
        ...request.fields[0],
        fieldId: `FIELD_${index + 1}`,
      }),
    );

    const result = validatePlanningRequest(request);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("STRING_TOO_LONG"), true);
    assert.equal(errorCodes(result).includes("ARRAY_TOO_LONG"), true);
  });

  it("returns structured errors and assert helper throws a safe error", () => {
    const result = validatePlanningRequest(null);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors[0], {
      path: "request",
      code: "EXPECTED_OBJECT",
      message: "Expected a plain object.",
    });

    assert.throws(
      () => assertValidPlanningRequest(null),
      (error) => error instanceof ContractValidationError
        && error.code === "CONTRACT_VALIDATION_FAILED"
        && error.contractName === "PlanningRequest",
    );
  });
});

describe("planning response contract", () => {
  it("accepts a valid safe action plan", () => {
    const plan = createValidPlan();
    const result = validatePlanningResponse(plan);

    assert.equal(result.ok, true);
    assert.equal(assertValidPlanningResponse(plan), plan);
  });

  it("rejects submit, click and arbitrary actions", () => {
    for (const action of ["submit", "click", "run_script"]) {
      const plan = createValidPlan();
      plan.actions = [{ action, target: "FIELD_1" }];

      const result = validatePlanningResponse(plan);
      assert.equal(result.ok, false);
      assert.equal(errorCodes(result).includes("UNSAFE_ACTION"), true);
    }
  });

  it("rejects a literal value attached to fill_private", () => {
    const plan = createValidPlan();
    plan.actions[0].value = "Aarav Demo Sharma";

    const result = validatePlanningResponse(plan);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("UNKNOWN_PROPERTY"), true);
  });

  it("requires final confirmation", () => {
    const plan = createValidPlan();
    plan.requiresConfirmation = false;

    const result = validatePlanningResponse(plan);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("CONFIRMATION_REQUIRED"), true);
  });

  it("validates action-specific fields", () => {
    const plan = createValidPlan();
    plan.actions = [
      { action: ACTION_TYPES.CHECK, target: "FIELD_1", checked: "yes" },
      { action: ACTION_TYPES.SELECT, target: "FIELD_2", value: "" },
      { action: ACTION_TYPES.FILL_PRIVATE, target: "FIELD_3", profileKey: "PROFILE.PASSWORD" },
    ];

    const result = validatePlanningResponse(plan);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("EXPECTED_BOOLEAN"), true);
    assert.equal(errorCodes(result).includes("STRING_TOO_SHORT"), true);
    assert.equal(errorCodes(result).includes("UNSUPPORTED_PROFILE_KEY"), true);
  });

  it("rejects unknown response properties and excessive actions", () => {
    const plan = createValidPlan();
    plan.rawProfile = {};
    plan.actions = Array.from(
      { length: CONTRACT_LIMITS.MAX_ACTIONS + 1 },
      () => ({ action: ACTION_TYPES.FOCUS, target: "FIELD_1" }),
    );

    const result = validatePlanningResponse(plan);
    assert.equal(result.ok, false);
    assert.equal(errorCodes(result).includes("UNKNOWN_PROPERTY"), true);
    assert.equal(errorCodes(result).includes("ARRAY_TOO_LONG"), true);
  });
});
