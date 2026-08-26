import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { ACTION_TYPES } from "../../shared/action-types.js";
import { SUPPORTED_PROFILE_KEYS, PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { ActionValidationError, validateActionPlan } from "../../extension/src/core/action-validator.js";
import { scanDocument } from "../../extension/src/core/field-scanner.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { createFallbackPlan } from "../../server/planners/fallback-planner.js";

async function createScenario(name = "scholarship.html") {
  const html = await readFile(new URL(`../../demo/${name}`, import.meta.url), "utf8");
  const document = parseHTML(html).document;
  const scan = scanDocument(document);
  const request = createPlanningRequest({
    scanResult: { snapshotId: scan.snapshotId, fields: scan.fields.map((field) => ({
      fieldId: field.fieldId,
      formId: field.formId,
      tag: field.tag,
      type: field.type,
      label: field.label,
      required: field.required,
      readonly: field.readonly,
      options: field.options,
      suggestedProfileKey: field.classification.category,
      risk: field.classification.risk,
    })) },
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    requestId: "request-action-validator",
  });
  return { document, scan, request, plan: createFallbackPlan(request) };
}

function errorCodes(error) {
  return error instanceof ActionValidationError ? error.errors.map((entry) => entry.code) : [];
}

describe("local action-plan validator", () => {
  it("accepts a correlated fallback plan after critical approval", async () => {
    const scenario = await createScenario();
    const result = validateActionPlan({
      ...scenario,
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      criticalApproved: true,
    });

    assert.equal(result.actions.length, 6);
    assert.equal(result.actions.every((action) => action.action === ACTION_TYPES.FILL_PRIVATE), true);
  });

  it("requires explicit approval before critical identifiers are resolved", async () => {
    const scenario = await createScenario();
    assert.throws(
      () => validateActionPlan({
        ...scenario,
        availableProfileKeys: SUPPORTED_PROFILE_KEYS,
        criticalApproved: false,
      }),
      (error) => errorCodes(error).includes("CRITICAL_CONFIRMATION_REQUIRED"),
    );
  });

  it("rejects unknown actions, nonexistent targets, and duplicate targets", async () => {
    const scenario = await createScenario();
    const plans = [
      { ...scenario.plan, actions: [{ action: "upload", target: "FIELD_1" }] },
      {
        ...scenario.plan,
        actions: [{ action: ACTION_TYPES.FOCUS, target: "FIELD_999" }],
      },
      {
        ...scenario.plan,
        actions: [
          { action: ACTION_TYPES.FOCUS, target: "FIELD_1" },
          { action: ACTION_TYPES.FILL_PRIVATE, target: "FIELD_1", profileKey: PROFILE_KEYS.NAME },
        ],
      },
    ];

    for (const plan of plans) {
      assert.throws(() => validateActionPlan({
        plan,
        request: scenario.request,
        scan: scenario.scan,
        availableProfileKeys: SUPPORTED_PROFILE_KEYS,
        criticalApproved: true,
      }), ActionValidationError);
    }
  });

  it("rejects stale snapshots after material DOM changes", async () => {
    const scenario = await createScenario();
    scenario.document.querySelector("label[for='scholarship-name']").textContent = "Changed legal name";
    const freshScan = scanDocument(scenario.document);

    assert.throws(
      () => validateActionPlan({
        plan: scenario.plan,
        request: scenario.request,
        scan: freshScan,
        availableProfileKeys: SUPPORTED_PROFILE_KEYS,
        criticalApproved: true,
      }),
      (error) => errorCodes(error).includes("LIVE_SNAPSHOT_CHANGED"),
    );
  });

  it("rejects incompatible profile keys and unapproved select literals", async () => {
    const scenario = await createScenario();
    const mismatch = {
      ...scenario.plan,
      actions: [{
        action: ACTION_TYPES.FILL_PRIVATE,
        target: "FIELD_1",
        profileKey: PROFILE_KEYS.EMAIL,
      }],
    };
    assert.throws(
      () => validateActionPlan({
        plan: mismatch,
        request: scenario.request,
        scan: scenario.scan,
        availableProfileKeys: SUPPORTED_PROFILE_KEYS,
        criticalApproved: true,
      }),
      (error) => errorCodes(error).includes("PROFILE_KEY_MISMATCH"),
    );

    const course = scenario.request.fields.find((field) => field.label === "Programme of study");
    const unsafeSelect = {
      ...scenario.plan,
      actions: [{ action: ACTION_TYPES.SELECT, target: course.fieldId, value: "Injected option" }],
    };
    assert.throws(
      () => validateActionPlan({
        plan: unsafeSelect,
        request: scenario.request,
        scan: scenario.scan,
        availableProfileKeys: SUPPORTED_PROFILE_KEYS,
        criticalApproved: true,
      }),
      (error) => errorCodes(error).includes("SELECT_OPTION_NOT_ALLOWED"),
    );
  });
});
