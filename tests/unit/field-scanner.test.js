import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import {
  createSafeScanResult,
  deriveFieldLabel,
  scanDocument,
} from "../../extension/src/core/field-scanner.js";
import { PROFILE_KEYS, UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

async function loadDemoDocument(name) {
  const html = await readFile(new URL(`../../demo/${name}`, import.meta.url), "utf8");
  return parseHTML(html).document;
}

function fieldByName(scan, name) {
  return scan.fields.find((field) => field.name === name);
}

describe("DOM field scanner", () => {
  it("extracts explicit, wrapping, ARIA and placeholder labels", () => {
    const { document } = parseHTML(`
      <form>
        <label for="explicit">Explicit label</label><input id="explicit">
        <label>Wrapping label <input id="wrapped"></label>
        <span id="aria-text">ARIA referenced label</span><input id="aria" aria-labelledby="aria-text">
        <input id="placeholder" placeholder="Placeholder label">
      </form>
    `);

    assert.equal(deriveFieldLabel(document.querySelector("#explicit")), "Explicit label");
    assert.equal(deriveFieldLabel(document.querySelector("#wrapped")), "Wrapping label");
    assert.equal(deriveFieldLabel(document.querySelector("#aria")), "ARIA referenced label");
    assert.equal(deriveFieldLabel(document.querySelector("#placeholder")), "Placeholder label");
  });

  it("scans and classifies the scholarship form", async () => {
    const scan = scanDocument(await loadDemoDocument("scholarship.html"));

    assert.equal(scan.fields.length, 9);
    assert.equal(scan.elementByFieldId.size, scan.fields.length);
    assert.equal(fieldByName(scan, "applicantName").classification.category, PROFILE_KEYS.NAME);
    assert.equal(fieldByName(scan, "email").classification.category, PROFILE_KEYS.EMAIL);
    assert.equal(fieldByName(scan, "mobileNumber").classification.category, PROFILE_KEYS.PHONE);
    assert.equal(fieldByName(scan, "dateOfBirth").classification.category, PROFILE_KEYS.DOB);
    assert.equal(fieldByName(scan, "aadhaarNumber").classification.category, PROFILE_KEYS.AADHAAR);
    assert.equal(fieldByName(scan, "permanentAddress").classification.category, PROFILE_KEYS.ADDRESS);
    assert.equal(fieldByName(scan, "course").classification.category, null);
  });

  it("handles mixed metadata and blocks OTP on the service form", async () => {
    const scan = scanDocument(await loadDemoDocument("service-registration.html"));

    assert.equal(scan.fields.length, 12);
    assert.equal(fieldByName(scan, "citizenFullName").label, "Citizen full name");
    assert.equal(fieldByName(scan, "primaryMobile").label, "Primary mobile number");
    assert.equal(fieldByName(scan, "taxIdentifier").label, "PAN identifier");
    assert.equal(fieldByName(scan, "citizenFullName").classification.category, PROFILE_KEYS.NAME);
    assert.equal(fieldByName(scan, "primaryMobile").classification.category, PROFILE_KEYS.PHONE);
    assert.equal(fieldByName(scan, "taxIdentifier").classification.category, PROFILE_KEYS.PAN);
    assert.equal(fieldByName(scan, "birthDate").classification.category, PROFILE_KEYS.DOB);
    assert.equal(fieldByName(scan, "postalAddress").classification.category, PROFILE_KEYS.ADDRESS);
    assert.equal(fieldByName(scan, "verificationCode").classification.category, UNKNOWN_SENSITIVE);
    assert.equal(fieldByName(scan, "preferredAppointmentDate").classification.category, null);
  });

  it("ignores hidden, disabled, file, submit and extension-owned controls", () => {
    const { document } = parseHTML(`
      <form>
        <input name="visibleName" aria-label="Full name">
        <input name="hiddenValue" type="hidden">
        <input name="disabledValue" disabled>
        <input name="fileValue" type="file">
        <input name="submitValue" type="submit">
        <div hidden><input name="hiddenAncestor"></div>
        <div data-privacyfill-owned><input name="extensionControl"></div>
      </form>
    `);

    const scan = scanDocument(document);
    assert.deepEqual(scan.fields.map((field) => field.name), ["visibleName"]);
  });

  it("never copies current input values into the safe registry", async () => {
    const document = await loadDemoDocument("scholarship.html");
    const seededValues = Object.values(FAKE_PROFILE);
    const controls = Array.from(document.querySelectorAll("input, textarea"));
    controls.forEach((control, index) => {
      control.value = seededValues[index % seededValues.length];
    });

    const scan = scanDocument(document);
    const serialized = JSON.stringify(createSafeScanResult(scan));

    assert.equal(scan.fields.some((field) => Object.hasOwn(field, "value")), false);
    for (const rawValue of seededValues) assert.equal(serialized.includes(rawValue), false, rawValue);
  });

  it("creates stable snapshots and ignores value-only changes", async () => {
    const document = await loadDemoDocument("scholarship.html");
    const first = scanDocument(document);
    const second = scanDocument(document);
    assert.equal(first.snapshotId, second.snapshotId);

    document.querySelector("#scholarship-name").value = "Value must not affect snapshot";
    assert.equal(scanDocument(document).snapshotId, first.snapshotId);

    document.querySelector("label[for='scholarship-name']").textContent = "Legal applicant name";
    assert.notEqual(scanDocument(document).snapshotId, first.snapshotId);
  });

  it("returns a safe scan summary with counts and no live elements", async () => {
    const safe = createSafeScanResult(scanDocument(await loadDemoDocument("service-registration.html")));

    assert.equal(safe.fieldCount, 12);
    assert.equal(safe.privateFieldCount, 5);
    assert.equal(safe.blockedFieldCount, 1);
    assert.equal(Object.hasOwn(safe, "elementByFieldId"), false);
    assert.match(safe.snapshotId, /^snapshot-v1-[a-f0-9]{8}$/);
  });

  it("minimizes external labels before creating a snapshot", () => {
    const { document } = parseHTML(`
      <form>
        <label>Email address private@example.test <input name="email" type="email"></label>
        <label>Reference 9876543210 <input name="reference" type="text"></label>
        <label>Region <select name="region"><option>Call 9876543210</option></select></label>
      </form>
    `);
    const scan = scanDocument(document, { externalPage: true });
    const safe = createSafeScanResult(scan);
    const serialized = JSON.stringify(safe);

    assert.equal(safe.privacyMode, "external");
    assert.equal(scan.fields[0].label, "Email address");
    assert.match(scan.fields[1].label, /\[redacted-number\]/);
    assert.deepEqual(scan.fields[2].options, []);
    assert.equal(serialized.includes("private@example.test"), false);
    assert.equal(serialized.includes("9876543210"), false);
  });
});
