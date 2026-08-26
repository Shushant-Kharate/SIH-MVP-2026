import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createEmptyProfileValues,
  createStoredProfile,
  PROFILE_VERSION,
  validateProfileValues,
} from "../../extension/src/core/profile-validation.js";
import { getSafeProfileStatus } from "../../extension/src/core/profile-store.js";
import { PROFILE_KEYS, SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

describe("profile validation", () => {
  it("accepts and normalizes the fictional seven-field profile", () => {
    const result = validateProfileValues({
      ...FAKE_PROFILE,
      [PROFILE_KEYS.NAME]: "  Aarav   Demo Sharma  ",
      [PROFILE_KEYS.EMAIL]: "AARAV.PRIVACY@EXAMPLE.TEST",
      [PROFILE_KEYS.PHONE]: "+91 98765 43210",
      [PROFILE_KEYS.AADHAAR]: "2345 6789 0123",
      [PROFILE_KEYS.PAN]: "abcde1234f",
    });

    assert.equal(result.ok, true);
    assert.equal(result.values[PROFILE_KEYS.NAME], "Aarav Demo Sharma");
    assert.equal(result.values[PROFILE_KEYS.EMAIL], "aarav.privacy@example.test");
    assert.equal(result.values[PROFILE_KEYS.PHONE], "9876543210");
    assert.equal(result.values[PROFILE_KEYS.AADHAAR], "234567890123");
    assert.equal(result.values[PROFILE_KEYS.PAN], "ABCDE1234F");
  });

  it("requires every MVP profile category", () => {
    const result = validateProfileValues({});

    assert.equal(result.ok, false);
    for (const key of SUPPORTED_PROFILE_KEYS) assert.ok(result.errors[key], key);
  });

  it("rejects unsupported profile properties", () => {
    const result = validateProfileValues({
      ...FAKE_PROFILE,
      "PROFILE.PASSWORD": "not-allowed",
    });

    assert.equal(result.ok, false);
    assert.equal(result.errors._form, "Profile contains unsupported fields.");
  });

  it("rejects invalid phone, email, Aadhaar, PAN and date formats", () => {
    const result = validateProfileValues({
      ...FAKE_PROFILE,
      [PROFILE_KEYS.EMAIL]: "invalid-email",
      [PROFILE_KEYS.PHONE]: "12345",
      [PROFILE_KEYS.AADHAAR]: "123456789012",
      [PROFILE_KEYS.PAN]: "12345ABCDE",
      [PROFILE_KEYS.DOB]: "2023-02-29",
    });

    assert.equal(result.ok, false);
    for (const key of [
      PROFILE_KEYS.EMAIL,
      PROFILE_KEYS.PHONE,
      PROFILE_KEYS.AADHAAR,
      PROFILE_KEYS.PAN,
      PROFILE_KEYS.DOB,
    ]) assert.ok(result.errors[key], key);
  });

  it("creates a versioned session record only after validation", () => {
    const stored = createStoredProfile(FAKE_PROFILE, new Date("2026-08-26T05:00:00.000Z"));

    assert.equal(stored.version, PROFILE_VERSION);
    assert.equal(stored.savedAt, "2026-08-26T05:00:00.000Z");
    assert.deepEqual(stored.values, FAKE_PROFILE);
    assert.throws(
      () => createStoredProfile(createEmptyProfileValues()),
      (error) => error.code === "PROFILE_INVALID"
        && Boolean(error.validationErrors[PROFILE_KEYS.NAME]),
    );
  });

  it("returns a safe status without exposing profile values", () => {
    const profile = createStoredProfile(FAKE_PROFILE, new Date("2026-08-26T05:00:00.000Z"));
    const status = getSafeProfileStatus(profile);
    const serialized = JSON.stringify(status);

    assert.equal(status.hasProfile, true);
    assert.equal(status.availableProfileKeys.length, 7);
    assert.equal(Object.hasOwn(status, "values"), false);
    for (const rawValue of Object.values(FAKE_PROFILE)) {
      assert.equal(serialized.includes(rawValue), false);
    }
  });

  it("returns an empty safe status when no profile exists", () => {
    assert.deepEqual(getSafeProfileStatus(null), {
      hasProfile: false,
      profileVersion: PROFILE_VERSION,
      availableProfileKeys: [],
      savedAt: null,
    });
  });
});
