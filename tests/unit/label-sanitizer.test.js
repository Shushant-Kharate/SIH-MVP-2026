import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isExternalPageLocation,
  minimizeExternalLabel,
  minimizeExternalOptions,
  redactSensitivePatterns,
} from "../../extension/src/core/label-sanitizer.js";
import { PROFILE_KEYS, UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";

describe("external-page label minimizer", () => {
  it("replaces classified page text with fixed semantic labels", () => {
    assert.equal(minimizeExternalLabel("Email for person@example.test", PROFILE_KEYS.EMAIL), "Email address");
    assert.equal(minimizeExternalLabel("PAN ABCDE1234F", PROFILE_KEYS.PAN), "PAN identifier");
    assert.equal(minimizeExternalLabel("One-time password 123456", UNKNOWN_SENSITIVE), "Sensitive field");
  });

  it("redacts common private patterns from unclassified labels", () => {
    const redacted = redactSensitivePatterns(
      "Recovery person@example.test / ABCDE1234F / +91 98765 43210 / 2002-04-18",
    );

    assert.equal(redacted.includes("person@example.test"), false);
    assert.equal(redacted.includes("ABCDE1234F"), false);
    assert.equal(redacted.includes("98765 43210"), false);
    assert.equal(redacted.includes("2002-04-18"), false);
    assert.match(redacted, /\[redacted-email\]/);
    assert.match(redacted, /\[redacted-identifier\]/);
    assert.match(redacted, /\[redacted-number\]/);
    assert.match(redacted, /\[redacted-date\]/);
  });

  it("preserves harmless short semantic text and omits arbitrary options", () => {
    assert.equal(minimizeExternalLabel("Programme of study", null), "Programme of study");
    assert.deepEqual(minimizeExternalOptions(["Public", "Private"]), []);
  });

  it("treats only the controlled loopback demo path as non-external", () => {
    assert.equal(isExternalPageLocation({
      protocol: "http:", hostname: "localhost", port: "8787", pathname: "/demo/scholarship.html",
    }), false);
    assert.equal(isExternalPageLocation({
      protocol: "http:", hostname: "127.0.0.1", port: "8787", pathname: "/demo/demo.html",
    }), false);
    assert.equal(isExternalPageLocation({
      protocol: "http:", hostname: "localhost", port: "3000", pathname: "/demo/form.html",
    }), true);
    assert.equal(isExternalPageLocation({
      protocol: "https:", hostname: "docs.google.com", pathname: "/forms/example",
    }), true);
    assert.equal(isExternalPageLocation(null), true);
  });
});
