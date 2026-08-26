import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { selectFormAdapter } from "../../extension/src/adapters/adapter-registry.js";
import { analyzeGoogleForm } from "../../extension/src/adapters/google-forms-adapter.js";
import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";

const GOOGLE_LOCATION = Object.freeze({
  protocol: "https:",
  hostname: "docs.google.com",
  pathname: "/forms/d/e/example/viewform",
});

async function loadGoogleLikeDocument() {
  const html = await readFile(new URL("../fixtures/google-form-like.html", import.meta.url), "utf8");
  return parseHTML(html).document;
}

describe("form adapter registry", () => {
  it("selects the experimental adapter only for matching Google Forms pages", async () => {
    const document = await loadGoogleLikeDocument();

    assert.equal(selectFormAdapter(document, GOOGLE_LOCATION).id, "google-forms-experimental");
    assert.equal(selectFormAdapter(document, {
      protocol: "https:", hostname: "docs.google.com", pathname: "/document/d/example",
    }).id, "generic");
    assert.equal(selectFormAdapter(document, {
      protocol: "https:", hostname: "example.test", pathname: "/forms/example",
    }).id, "generic");
  });

  it("requires bounded question containers before selecting the Google adapter", () => {
    const { document } = parseHTML("<form><label>Name <input></label></form>");
    assert.equal(selectFormAdapter(document, GOOGLE_LOCATION).id, "generic");
  });

  it("allows only single native text-like questions and counts unsupported question types", async () => {
    const document = await loadGoogleLikeDocument();
    const analysis = analyzeGoogleForm(document);

    assert.deepEqual(
      analysis.supportedControls.map((element) => element.getAttribute("name")),
      ["entry.1001", "entry.1002", "entry.1003", "entry.1004"],
    );
    assert.equal(analysis.unsupportedControlCount, 3);
  });

  it("derives required state locally from the bounded question heading", async () => {
    const document = await loadGoogleLikeDocument();
    const adapter = selectFormAdapter(document, GOOGLE_LOCATION);
    const controls = adapter.findControls(document);

    assert.equal(controls.every((element) => adapter.deriveRequired(element, document)), true);
    assert.equal(adapter.deriveLabel(controls[1], document), "Primary mobile number");
  });

  it("keeps adapter identity, compatibility counts and page location out of the planner request", async () => {
    const document = await loadGoogleLikeDocument();
    const safeScan = createSafeScanResult(scanDocument(document, {
      externalPage: true,
      locationLike: GOOGLE_LOCATION,
    }));
    const request = createPlanningRequest({
      scanResult: safeScan,
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      requestId: "request-google-adapter-boundary",
    });
    const serialized = JSON.stringify(request);

    assert.equal(Object.hasOwn(request, "adapterId"), false);
    assert.equal(Object.hasOwn(request, "unsupportedControlCount"), false);
    assert.equal(serialized.includes("google-forms"), false);
    assert.equal(serialized.includes("docs.google.com"), false);
  });
});
