import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { executeValidatedActions } from "../../extension/src/core/action-executor.js";
import { ActionValidationError, validateActionPlan } from "../../extension/src/core/action-validator.js";
import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { createFallbackPlan } from "../../server/planners/fallback-planner.js";
import { SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

async function frameworkScenario(requestId) {
  const html = await readFile(
    new URL("../fixtures/framework-controlled-form.html", import.meta.url),
    "utf8",
  );
  const { document } = parseHTML(html);
  const scan = scanDocument(document, { externalPage: true });
  const request = createPlanningRequest({
    scanResult: createSafeScanResult(scan),
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    requestId,
  });
  const plan = createFallbackPlan(request);
  const validated = validateActionPlan({
    plan,
    request,
    scan,
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    criticalApproved: true,
  });
  return { document, scan, request, plan, validated };
}

describe("framework-controlled native form execution", () => {
  it("uses native values and bubbling input/change events for every private field", async () => {
    const scenario = await frameworkScenario("request-framework-events");
    const frameworkState = new Map();
    let inputEvents = 0;
    let changeEvents = 0;

    for (const action of scenario.validated.actions) {
      const element = scenario.scan.elementByFieldId.get(action.target);
      element.addEventListener("input", () => {
        inputEvents += 1;
        frameworkState.set(action.target, element.value);
      });
      element.addEventListener("change", () => { changeEvents += 1; });
    }

    const result = await executeValidatedActions({
      actions: scenario.validated.actions,
      scan: scenario.scan,
      profileValues: FAKE_PROFILE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.filledCount, 7);
    assert.equal(inputEvents, 7);
    assert.equal(changeEvents, 7);
    for (const action of scenario.validated.actions) {
      assert.equal(frameworkState.get(action.target), FAKE_PROFILE[action.profileKey]);
      assert.equal(
        scenario.scan.elementByFieldId.get(action.target).value,
        FAKE_PROFILE[action.profileKey],
      );
    }
  });

  it("fails when an input handler replaces the target during a framework rerender", async () => {
    const scenario = await frameworkScenario("request-framework-replaced");
    const action = scenario.validated.actions[0];
    const original = scenario.scan.elementByFieldId.get(action.target);
    let replacement;
    original.addEventListener("input", () => {
      queueMicrotask(() => {
        replacement = scenario.document.createElement("input");
        replacement.setAttribute("name", "fullName");
        original.replaceWith(replacement);
      });
    });

    const result = await executeValidatedActions({
      actions: [action],
      scan: scenario.scan,
      profileValues: FAKE_PROFILE,
    });

    assert.equal(result.ok, false);
    assert.equal(result.filledCount, 0);
    assert.equal(result.auditEntries[0].code, "TARGET_REPLACED");
    assert.equal(original.isConnected, false);
    assert.equal(replacement.value, "");
    for (const rawValue of Object.values(FAKE_PROFILE)) {
      assert.equal(JSON.stringify(result.auditEntries).includes(rawValue), false);
    }
  });

  it("fails when controlled state reverts the value in a microtask", async () => {
    const scenario = await frameworkScenario("request-framework-reverted");
    const action = scenario.validated.actions[0];
    const element = scenario.scan.elementByFieldId.get(action.target);
    element.addEventListener("input", () => {
      queueMicrotask(() => { element.value = ""; });
    });

    const result = await executeValidatedActions({
      actions: [action],
      scan: scenario.scan,
      profileValues: FAKE_PROFILE,
    });

    assert.equal(result.ok, false);
    assert.equal(result.auditEntries[0].code, "VALUE_VERIFICATION_FAILED");
  });

  it("rejects a registry target replaced before local action validation", async () => {
    const scenario = await frameworkScenario("request-framework-pre-validation");
    const action = scenario.validated.actions[0];
    const original = scenario.scan.elementByFieldId.get(action.target);
    original.replaceWith(scenario.document.createElement("input"));

    assert.throws(
      () => validateActionPlan({
        plan: scenario.plan,
        request: scenario.request,
        scan: scenario.scan,
        availableProfileKeys: SUPPORTED_PROFILE_KEYS,
        criticalApproved: true,
      }),
      (error) => error instanceof ActionValidationError
        && error.errors.some((entry) => entry.code === "TARGET_REPLACED"),
    );
  });
});
