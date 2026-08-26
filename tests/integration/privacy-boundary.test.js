import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { assertNoProfileLeak, checkPayloadForLeaks } from "../../extension/src/core/leak-checker.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { createFallbackPlan } from "../../server/planners/fallback-planner.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

async function createRequestForDemo(name, requestId) {
  const html = await readFile(new URL(`../../demo/${name}`, import.meta.url), "utf8");
  const scan = createSafeScanResult(scanDocument(parseHTML(html).document));
  return createPlanningRequest({
    scanResult: scan,
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    requestId,
  });
}

describe("extension-to-planner privacy boundary", () => {
  it("produces zero seeded-value matches for both controlled forms", async () => {
    for (const [name, requestId] of [
      ["scholarship.html", "request-privacy-scholarship"],
      ["service-registration.html", "request-privacy-service"],
    ]) {
      const request = await createRequestForDemo(name, requestId);
      const result = assertNoProfileLeak(request, FAKE_PROFILE);
      const serialized = JSON.stringify(request);

      assert.equal(result.ok, true, name);
      for (const rawValue of Object.values(FAKE_PROFILE)) {
        assert.equal(serialized.includes(rawValue), false, `${name}: ${rawValue}`);
      }
    }
  });

  it("fails closed after deliberate post-sanitization value injection", async () => {
    const request = await createRequestForDemo("scholarship.html", "request-privacy-injection");
    request.fields[0].label = FAKE_PROFILE["PROFILE.AADHAAR"];

    const result = checkPayloadForLeaks(request, FAKE_PROFILE);
    assert.equal(result.ok, false);
    assert.throws(() => assertNoProfileLeak(request, FAKE_PROFILE), /blocked by privacy policy/i);
  });

  it("keeps fallback responses limited to symbolic references and safe literals", async () => {
    const request = await createRequestForDemo("scholarship.html", "request-response-privacy");
    const plan = createFallbackPlan(request);
    const topLevelKeys = Object.keys(plan).sort();

    assert.deepEqual(topLevelKeys, [
      "actions", "contractVersion", "planner", "requestId", "requiresConfirmation", "snapshotId",
    ]);
    for (const action of plan.actions) {
      assert.equal(Object.hasOwn(action, "profile"), false);
      if (action.action === "fill_private") {
        assert.deepEqual(Object.keys(action).sort(), ["action", "profileKey", "target"]);
        assert.equal(Object.hasOwn(action, "value"), false);
      }
    }
    assertNoProfileLeak(plan, FAKE_PROFILE);
  });
});
