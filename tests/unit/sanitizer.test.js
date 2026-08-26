import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { validatePlanningRequest } from "../../shared/contracts.js";
import { PROFILE_KEYS, SUPPORTED_PROFILE_KEYS, UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";
import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { createPlanningRequest, DEFAULT_PLANNING_TASK } from "../../extension/src/core/sanitizer.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

async function scanDemo(name) {
  const html = await readFile(new URL(`../../demo/${name}`, import.meta.url), "utf8");
  return createSafeScanResult(scanDocument(parseHTML(html).document));
}

describe("planning-request sanitizer", () => {
  it("builds a contract-valid request from the scholarship scan", async () => {
    const request = createPlanningRequest({
      scanResult: await scanDemo("scholarship.html"),
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      requestId: "request-scholarship-001",
    });

    assert.equal(validatePlanningRequest(request).ok, true);
    assert.equal(request.task, DEFAULT_PLANNING_TASK);
    assert.equal(request.fields.length, 9);
    assert.deepEqual(request.availableProfileKeys, SUPPORTED_PROFILE_KEYS);
  });

  it("excludes blocked OTP fields from the service-form request", async () => {
    const scan = await scanDemo("service-registration.html");
    const request = createPlanningRequest({
      scanResult: scan,
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      requestId: "request-service-001",
    });

    assert.equal(scan.fields.some((field) => field.suggestedProfileKey === UNKNOWN_SENSITIVE), true);
    assert.equal(request.fields.length, 11);
    assert.equal(request.fields.some((field) => field.suggestedProfileKey === UNKNOWN_SENSITIVE), false);
    assert.equal(request.fields.some((field) => field.label.includes("One-time password")), false);
  });

  it("copies only allowlisted field properties", async () => {
    const scan = await scanDemo("scholarship.html");
    scan.fields[0].value = FAKE_PROFILE[PROFILE_KEYS.NAME];
    scan.fields[0].outerHTML = `<input value="${FAKE_PROFILE[PROFILE_KEYS.NAME]}">`;
    scan.fields[0].pageText = FAKE_PROFILE[PROFILE_KEYS.ADDRESS];

    const request = createPlanningRequest({
      scanResult: scan,
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      requestId: "request-allowlist-001",
    });
    const serialized = JSON.stringify(request);

    for (const rawValue of Object.values(FAKE_PROFILE)) assert.equal(serialized.includes(rawValue), false);
    assert.deepEqual(Object.keys(request.fields[0]), [
      "fieldId",
      "formId",
      "tag",
      "type",
      "label",
      "required",
      "options",
      "suggestedProfileKey",
      "risk",
    ]);
  });

  it("filters unknown and duplicate available-profile keys", async () => {
    const request = createPlanningRequest({
      scanResult: await scanDemo("scholarship.html"),
      availableProfileKeys: [PROFILE_KEYS.NAME, PROFILE_KEYS.NAME, "PROFILE.PASSWORD"],
      requestId: "request-keys-001",
    });

    assert.deepEqual(request.availableProfileKeys, [PROFILE_KEYS.NAME]);
  });

  it("excludes readonly controls and normalizes safe search inputs", () => {
    const request = createPlanningRequest({
      scanResult: {
        snapshotId: "snapshot-test-001",
        fields: [
          {
            fieldId: "FIELD_1",
            formId: "FORM_1",
            tag: "input",
            type: "search",
            label: "Public search",
            required: false,
            readonly: false,
            options: [],
            suggestedProfileKey: null,
            risk: "low",
          },
          {
            fieldId: "FIELD_2",
            formId: "FORM_1",
            tag: "input",
            type: "text",
            label: "Readonly name",
            required: false,
            readonly: true,
            options: [],
            suggestedProfileKey: PROFILE_KEYS.NAME,
            risk: "medium",
          },
        ],
      },
      availableProfileKeys: [PROFILE_KEYS.NAME],
      requestId: "request-types-001",
    });

    assert.equal(request.fields.length, 1);
    assert.equal(request.fields[0].type, "text");
  });

  it("rejects a missing scan or request identifier", async () => {
    const scan = await scanDemo("scholarship.html");

    assert.throws(
      () => createPlanningRequest({
        scanResult: null,
        availableProfileKeys: [],
        requestId: "request-missing-scan",
      }),
      (error) => error.code === "SCAN_REQUIRED",
    );

    assert.throws(
      () => createPlanningRequest({
        scanResult: scan,
        availableProfileKeys: [],
        requestId: "",
      }),
      (error) => error.code === "CONTRACT_VALIDATION_FAILED",
    );
  });
});
