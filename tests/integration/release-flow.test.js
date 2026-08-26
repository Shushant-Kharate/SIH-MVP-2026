import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { createApp } from "../../server/index.js";
import { SUPPORTED_PROFILE_KEYS, UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";
import { executeValidatedActions } from "../../extension/src/core/action-executor.js";
import { validateActionPlan } from "../../extension/src/core/action-validator.js";
import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { assertNoProfileLeak } from "../../extension/src/core/leak-checker.js";
import { requestPlannerPlan } from "../../extension/src/core/planner-client.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { armSubmissionGuard } from "../../extension/src/ui/confirmation-overlay.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

let server;
let baseUrl;

before(async () => {
  server = createApp({ logWriter: () => {} }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
});

async function runReleaseFlow(name, requestId) {
  const html = await readFile(new URL(`../../demo/${name}`, import.meta.url), "utf8");
  const { document, window } = parseHTML(html);
  const scan = scanDocument(document);
  const request = createPlanningRequest({
    scanResult: createSafeScanResult(scan),
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    requestId,
  });
  assertNoProfileLeak(request, FAKE_PROFILE);

  const plan = await requestPlannerPlan({
    request,
    profileValues: FAKE_PROFILE,
    endpoint: `${baseUrl}/api/plan`,
  });
  assertNoProfileLeak(plan, FAKE_PROFILE);

  const validated = validateActionPlan({
    plan,
    request,
    scan,
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    criticalApproved: true,
  });
  const execution = await executeValidatedActions({
    actions: validated.actions,
    scan,
    profileValues: FAKE_PROFILE,
  });
  assert.equal(execution.ok, true);

  const form = scan.elementByFieldId.get(validated.actions[0].target).closest("form");
  const requestFields = new Map(request.fields.map((field) => [field.fieldId, field]));
  const criticalCategories = validated.actions
    .filter((action) => requestFields.get(action.target)?.risk === "critical")
    .map((action) => action.profileKey);
  const guardAudit = [];
  armSubmissionGuard({
    scan,
    actions: validated.actions,
    filledCount: execution.filledCount,
    criticalCategories,
    onAudit: (entry) => guardAudit.push(entry),
  });
  // Linkedom invokes same-target listeners in registration order and does not model
  // the browser's capture-before-bubble ordering, so register the page listener second.
  let submitted = 0;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitted += 1;
  });

  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(submitted, 0);
  const overlay = document.querySelector("[data-privacyfill-owned='confirmation-overlay']");
  assert.ok(overlay);
  const overlayText = Array.from(overlay.shadowRoot.querySelectorAll("p, h2, span, strong, button"))
    .map((element) => element.textContent)
    .join(" ");
  for (const rawValue of Object.values(FAKE_PROFILE)) assert.equal(overlayText.includes(rawValue), false);

  overlay.shadowRoot.querySelector("[data-action='submit-once']").click();
  assert.equal(submitted, 1);

  const safeArtifacts = JSON.stringify({ request, plan, audit: [...execution.auditEntries, ...guardAudit] });
  for (const rawValue of Object.values(FAKE_PROFILE)) assert.equal(safeArtifacts.includes(rawValue), false);

  const blockedField = scan.fields.find((field) => field.classification.category === UNKNOWN_SENSITIVE);
  if (blockedField) assert.equal(scan.elementByFieldId.get(blockedField.fieldId).value, "");
  return { filledCount: execution.filledCount, planner: plan.planner };
}

describe("release-candidate fallback flow", () => {
  it("completes two consecutive scholarship demonstrations", async () => {
    for (let run = 1; run <= 2; run += 1) {
      const result = await runReleaseFlow("scholarship.html", `request-release-scholarship-${run}`);
      assert.deepEqual(result, { filledCount: 6, planner: "fallback" });
    }
  });

  it("completes two consecutive service demonstrations with OTP blocked", async () => {
    for (let run = 1; run <= 2; run += 1) {
      const result = await runReleaseFlow("service-registration.html", `request-release-service-${run}`);
      assert.deepEqual(result, { filledCount: 5, planner: "fallback" });
    }
  });
});
