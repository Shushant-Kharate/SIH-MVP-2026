import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyFieldMetadata,
  isAutoFillableClassification,
  normalizeMetadataText,
} from "../../extension/src/core/pii-classifier.js";
import { PROFILE_KEYS, UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";

function classify(overrides) {
  return classifyFieldMetadata({
    label: "",
    placeholder: "",
    name: "",
    id: "",
    autocomplete: "",
    type: "text",
    ...overrides,
  });
}

describe("PII classifier", () => {
  it("normalizes camelCase and punctuation metadata", () => {
    assert.equal(normalizeMetadataText("citizenFullName"), "citizen full name");
    assert.equal(normalizeMetadataText("date_of-birth"), "date of birth");
  });

  it("classifies all seven supported profile categories", () => {
    const examples = [
      [{ label: "Applicant full name" }, PROFILE_KEYS.NAME],
      [{ label: "Email address", type: "email" }, PROFILE_KEYS.EMAIL],
      [{ ariaLabel: "unused", name: "primaryMobile", type: "tel" }, PROFILE_KEYS.PHONE],
      [{ label: "Current postal address", type: "textarea" }, PROFILE_KEYS.ADDRESS],
      [{ name: "dateOfBirth", type: "date" }, PROFILE_KEYS.DOB],
      [{ label: "Aadhaar number" }, PROFILE_KEYS.AADHAAR],
      [{ placeholder: "PAN number (ABCDE1234F)" }, PROFILE_KEYS.PAN],
    ];

    for (const [metadata, expected] of examples) {
      const result = classify(metadata);
      assert.equal(result.category, expected, JSON.stringify(metadata));
      assert.equal(isAutoFillableClassification(result), true);
      assert.ok(result.confidence > 0);
    }
  });

  it("uses control type only for unambiguous email and telephone fields", () => {
    assert.equal(classify({ type: "email" }).category, PROFILE_KEYS.EMAIL);
    assert.equal(classify({ type: "tel" }).category, PROFILE_KEYS.PHONE);
    assert.equal(classify({ type: "date", label: "Preferred appointment date" }).category, null);
  });

  it("prioritizes the specific email phrase over the generic address keyword", () => {
    assert.equal(classify({ label: "Email address" }).category, PROFILE_KEYS.EMAIL);
  });

  it("blocks OTP, password, CVV and bank-like controls", () => {
    for (const metadata of [
      { label: "One-time password OTP" },
      { type: "password" },
      { name: "cardCvv" },
      { label: "Bank account number" },
    ]) {
      const result = classify(metadata);
      assert.equal(result.category, UNKNOWN_SENSITIVE);
      assert.equal(result.risk, "critical");
      assert.equal(isAutoFillableClassification(result), false);
    }
  });

  it("does not treat unrelated controls as private profile fields", () => {
    for (const metadata of [
      { label: "Programme of study", type: "select" },
      { label: "Annual family income", type: "number" },
      { label: "District", type: "select" },
      { label: "Applicant category", type: "radio" },
    ]) assert.equal(classify(metadata).category, null);
  });
});
