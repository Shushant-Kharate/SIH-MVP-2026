import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { assertNoProfileLeak } from "../../extension/src/core/leak-checker.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { createSnapshotMaterial } from "../../extension/src/core/snapshot.js";
import { SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

async function externalScenario() {
  const html = await readFile(
    new URL("../fixtures/external-sensitive-form.html", import.meta.url),
    "utf8",
  );
  const scan = scanDocument(parseHTML(html).document, { externalPage: true });
  const safeScan = createSafeScanResult(scan);
  const request = createPlanningRequest({
    scanResult: safeScan,
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    requestId: "request-external-sensitive",
  });
  return { scan, safeScan, request };
}

describe("external-page privacy minimization", () => {
  it("removes seeded values before snapshots and planning requests are created", async () => {
    const { scan, safeScan, request } = await externalScenario();
    const artifacts = [
      createSnapshotMaterial(scan.fields),
      JSON.stringify(safeScan),
      JSON.stringify(request),
    ];

    assert.equal(scan.privacyMode, "external");
    assert.equal(safeScan.privacyMode, "external");
    assert.equal(Object.hasOwn(request, "privacyMode"), false);
    assert.equal(Object.hasOwn(request, "url"), false);
    assert.equal(Object.hasOwn(request, "origin"), false);
    for (const artifact of artifacts) {
      for (const rawValue of Object.values(FAKE_PROFILE)) {
        assert.equal(artifact.includes(rawValue), false, rawValue);
      }
      assert.equal(artifact.includes("victim@example.test"), false);
    }
    assertNoProfileLeak(request, FAKE_PROFILE);
  });

  it("uses canonical category labels and withholds arbitrary select options", async () => {
    const { request } = await externalScenario();
    const labels = request.fields.map((field) => field.label);
    const select = request.fields.find((field) => field.type === "select");

    for (const expected of [
      "Full name", "Email address", "Phone number", "Address", "Date of birth",
      "Aadhaar identifier", "PAN identifier",
    ]) {
      assert.ok(labels.includes(expected), expected);
    }
    assert.ok(labels.some((label) => label.includes("[redacted-email]")));
    assert.deepEqual(select.options, []);
  });

  it("keeps the external snapshot stable when only a raw classified value changes", async () => {
    const html = `
      <form><label>Email address first@example.test <input type="email" name="email"></label></form>
    `;
    const firstDocument = parseHTML(html).document;
    const secondDocument = parseHTML(html.replace("first@example.test", "second@example.test")).document;
    const first = scanDocument(firstDocument, { externalPage: true });
    const second = scanDocument(secondDocument, { externalPage: true });

    assert.equal(first.fields[0].label, "Email address");
    assert.equal(second.fields[0].label, "Email address");
    assert.equal(first.snapshotId, second.snapshotId);
  });

  it("still fails closed for unrecognized prose containing a saved name or address", () => {
    const scanResult = {
      privacyMode: "external",
      snapshotId: "snapshot-external-forged",
      fields: [{
        fieldId: "FIELD_1",
        formId: "FORM_1",
        tag: "input",
        type: "text",
        label: `Emergency contact for ${FAKE_PROFILE["PROFILE.NAME"]}`,
        required: false,
        readonly: false,
        options: [],
        suggestedProfileKey: null,
        risk: "low",
      }],
    };
    const request = createPlanningRequest({
      scanResult,
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      requestId: "request-external-fail-closed",
    });

    assert.throws(
      () => assertNoProfileLeak(request, FAKE_PROFILE),
      (error) => error.code === "PRIVACY_LEAK_BLOCKED",
    );
  });
});
