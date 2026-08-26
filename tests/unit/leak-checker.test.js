import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertNoProfileLeak,
  checkPayloadForLeaks,
  createProtectedVariants,
  ProfileLeakError,
} from "../../extension/src/core/leak-checker.js";
import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";
import { createSanitizedPlanningRequest } from "../fixtures/sanitized-form.js";

describe("outbound profile-value leak checker", () => {
  it("passes a properly sanitized planning request", () => {
    const result = checkPayloadForLeaks(createSanitizedPlanningRequest(), FAKE_PROFILE);

    assert.equal(result.ok, true);
    assert.equal(result.protectedCategoryCount, 7);
    assert.equal(result.matches.length, 0);
    assert.ok(result.checkedStringCount > 0);
  });

  it("blocks every exact seeded profile value at any payload depth", () => {
    for (const [category, rawValue] of Object.entries(FAKE_PROFILE)) {
      const payload = createSanitizedPlanningRequest();
      payload.fields[0].options = ["safe", { nested: rawValue }];
      const result = checkPayloadForLeaks(payload, FAKE_PROFILE);

      assert.equal(result.ok, false, category);
      assert.equal(result.matches.some((match) => match.category === category), true, category);
    }
  });

  it("detects normalized phone, Aadhaar, PAN, email and address variants", () => {
    const variants = [
      [PROFILE_KEYS.PHONE, "98765-43210"],
      [PROFILE_KEYS.AADHAAR, "2345 6789 0123"],
      [PROFILE_KEYS.PAN, "ABCDE-1234-F"],
      [PROFILE_KEYS.EMAIL, "AARAV.PRIVACY@EXAMPLE.TEST"],
      [PROFILE_KEYS.ADDRESS, "42  Privacy Test Road,   Pune"],
    ];

    for (const [category, transformed] of variants) {
      const result = checkPayloadForLeaks({ task: transformed }, FAKE_PROFILE);
      assert.equal(result.ok, false, category);
      assert.equal(result.matches.some((match) => match.category === category), true, category);
    }
  });

  it("checks object property names as well as values", () => {
    const rawEmail = FAKE_PROFILE[PROFILE_KEYS.EMAIL];
    const result = checkPayloadForLeaks({ [rawEmail]: "unexpected key" }, FAKE_PROFILE);

    assert.equal(result.ok, false);
    assert.equal(result.matches.some((match) => match.path.endsWith(".[key]")), true);
  });

  it("returns safe match metadata without the protected value", () => {
    const rawPan = FAKE_PROFILE[PROFILE_KEYS.PAN];
    const result = checkPayloadForLeaks({ task: rawPan }, FAKE_PROFILE);
    const serializedMatches = JSON.stringify(result.matches);

    assert.equal(result.ok, false);
    assert.equal(serializedMatches.includes(rawPan), false);
    assert.deepEqual(Object.keys(result.matches[0]).sort(), ["category", "path", "variantType"]);
  });

  it("throws a safe, typed error when leakage is found", () => {
    const payload = { task: FAKE_PROFILE[PROFILE_KEYS.PHONE] };

    assert.throws(
      () => assertNoProfileLeak(payload, FAKE_PROFILE),
      (error) => error instanceof ProfileLeakError
        && error.code === "PRIVACY_LEAK_BLOCKED"
        && !JSON.stringify(error.matches).includes(FAKE_PROFILE[PROFILE_KEYS.PHONE]),
    );
  });

  it("ignores empty and dangerously short protected strings", () => {
    const profile = Object.fromEntries(Object.keys(FAKE_PROFILE).map((key) => [key, ""]));
    profile[PROFILE_KEYS.NAME] = "Al";

    assert.deepEqual(createProtectedVariants(profile), []);
    assert.equal(checkPayloadForLeaks({ task: "Call Alice" }, profile).ok, true);
  });
});
