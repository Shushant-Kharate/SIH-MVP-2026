import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { ACTION_TYPES } from "../../shared/action-types.js";
import { SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { executeValidatedActions } from "../../extension/src/core/action-executor.js";
import { validateActionPlan } from "../../extension/src/core/action-validator.js";
import { scanDocument } from "../../extension/src/core/field-scanner.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { createFallbackPlan } from "../../server/planners/fallback-planner.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

async function scholarshipScenario() {
  const html = await readFile(new URL("../../demo/scholarship.html", import.meta.url), "utf8");
  const document = parseHTML(html).document;
  const scan = scanDocument(document);
  const request = createPlanningRequest({
    scanResult: {
      snapshotId: scan.snapshotId,
      fields: scan.fields.map((field) => ({
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
      })),
    },
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    requestId: "request-executor",
  });
  return { document, scan, request };
}

describe("local action executor", () => {
  it("fills every supported scholarship profile field and dispatches edit events", async () => {
    const scenario = await scholarshipScenario();
    const plan = createFallbackPlan(scenario.request);
    const validated = validateActionPlan({
      plan,
      request: scenario.request,
      scan: scenario.scan,
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      criticalApproved: true,
    });
    let inputEvents = 0;
    scenario.document.querySelector("form").addEventListener("input", () => { inputEvents += 1; });

    const result = await executeValidatedActions({
      actions: validated.actions,
      scan: scenario.scan,
      profileValues: FAKE_PROFILE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.filledCount, 6);
    assert.equal(inputEvents, 6);
    for (const action of validated.actions) {
      const element = scenario.scan.elementByFieldId.get(action.target);
      assert.equal(element.value, FAKE_PROFILE[action.profileKey]);
      assert.equal(element.dataset.privacyfillState, "success");
    }
  });

  it("executes allowlisted select and checkbox actions", async () => {
    const scenario = await scholarshipScenario();
    const courseField = scenario.request.fields.find((field) => field.type === "select");
    const checkboxField = scenario.request.fields.find((field) => field.type === "checkbox");
    const plan = {
      contractVersion: 1,
      requestId: scenario.request.requestId,
      snapshotId: scenario.request.snapshotId,
      planner: "fallback",
      actions: [
        { action: ACTION_TYPES.SELECT, target: courseField.fieldId, value: "Engineering" },
        { action: ACTION_TYPES.CHECK, target: checkboxField.fieldId, checked: true },
      ],
      requiresConfirmation: true,
    };
    const validated = validateActionPlan({
      plan,
      request: scenario.request,
      scan: scenario.scan,
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      criticalApproved: true,
    });

    const result = await executeValidatedActions({
      actions: validated.actions,
      scan: scenario.scan,
      profileValues: FAKE_PROFILE,
    });
    assert.equal(result.ok, true);
    const selectedCourse = Array.from(
      scenario.scan.elementByFieldId.get(courseField.fieldId).options,
    ).find((option) => option.selected);
    assert.equal(selectedCourse.textContent.trim(), "Engineering");
    assert.equal(scenario.scan.elementByFieldId.get(checkboxField.fieldId).checked, true);
  });

  it("stops after a failed write and keeps audit records value-free", async () => {
    const scenario = await scholarshipScenario();
    const action = {
      action: ACTION_TYPES.FILL_PRIVATE,
      target: "FIELD_1",
      profileKey: scenario.request.fields[0].suggestedProfileKey,
    };
    const result = await executeValidatedActions({
      actions: [action],
      scan: scenario.scan,
      profileValues: {},
    });
    const serializedAudit = JSON.stringify(result.auditEntries);

    assert.equal(result.ok, false);
    assert.equal(result.filledCount, 0);
    assert.equal(result.auditEntries[0].status, "failed");
    for (const rawValue of Object.values(FAKE_PROFILE)) {
      assert.equal(serializedAudit.includes(rawValue), false);
    }
  });
});
