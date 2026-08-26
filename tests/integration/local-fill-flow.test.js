import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { SUPPORTED_PROFILE_KEYS, UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";
import { executeValidatedActions } from "../../extension/src/core/action-executor.js";
import { validateActionPlan } from "../../extension/src/core/action-validator.js";
import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { createFallbackPlan } from "../../server/planners/fallback-planner.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

async function runLocalFlow(name, requestId) {
  const html = await readFile(new URL(`../../demo/${name}`, import.meta.url), "utf8");
  const document = parseHTML(html).document;
  const scan = scanDocument(document);
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
  const execution = executeValidatedActions({
    actions: validated.actions,
    scan,
    profileValues: FAKE_PROFILE,
  });
  return { document, scan, request, plan, execution };
}

describe("scan-to-local-fill integration", () => {
  it("fills all intended private fields on the scholarship form", async () => {
    const result = await runLocalFlow("scholarship.html", "request-scholarship-fill");
    assert.equal(result.execution.ok, true);
    assert.equal(result.execution.filledCount, 6);

    for (const action of result.plan.actions.filter((entry) => entry.action === "fill_private")) {
      assert.equal(result.scan.elementByFieldId.get(action.target).value, FAKE_PROFILE[action.profileKey]);
    }
  });

  it("fills the supported service fields while leaving OTP untouched", async () => {
    const result = await runLocalFlow("service-registration.html", "request-service-fill");
    const blocked = result.scan.fields.find((field) => field.classification.category === UNKNOWN_SENSITIVE);

    assert.equal(result.execution.ok, true);
    assert.equal(result.execution.filledCount, 5);
    assert.equal(result.scan.elementByFieldId.get(blocked.fieldId).value, "");
    assert.equal(result.plan.actions.some((action) => action.target === blocked.fieldId), false);
  });

  it("keeps every executor audit entry free of seeded profile values", async () => {
    const result = await runLocalFlow("scholarship.html", "request-audit-fill");
    const serialized = JSON.stringify(result.execution.auditEntries);
    for (const rawValue of Object.values(FAKE_PROFILE)) assert.equal(serialized.includes(rawValue), false);
  });
});
