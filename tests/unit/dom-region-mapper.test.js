import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { createLocalVisualSnapshot } from "../../extension/src/vision/dom-region-mapper.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";
import { SUPPORTED_PROFILE_KEYS, UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";
import {
  derivePrivacyLevel,
  isPrivacyLevel,
  PRIVACY_LEVELS,
} from "../../shared/privacy-levels.js";

function elementWithRect(rect, { display = "block", visibility = "visible", opacity = "1" } = {}) {
  return {
    hidden: false,
    isConnected: true,
    getAttribute() { return null; },
    getBoundingClientRect() { return rect; },
    computedStyle: { display, visibility, opacity },
  };
}

function field(fieldId, classification, { tag = "input", type = "text" } = {}) {
  return {
    fieldId,
    tag,
    type,
    classification,
  };
}

function testWindow(overrides = {}) {
  return {
    innerWidth: 800,
    innerHeight: 600,
    scrollX: 100,
    scrollY: 200,
    devicePixelRatio: 2,
    visualViewport: { width: 800, height: 600, offsetLeft: 0, offsetTop: 0, scale: 1.25 },
    getComputedStyle(element) { return element.computedStyle; },
    ...overrides,
  };
}

describe("visual privacy levels", () => {
  it("maps safe, private, critical and blocked classifications to explicit execution policy", () => {
    assert.equal(derivePrivacyLevel({ category: null, risk: "low" }), PRIVACY_LEVELS.VISIBLE);
    assert.equal(derivePrivacyLevel({ category: "PROFILE.EMAIL", risk: "medium" }), PRIVACY_LEVELS.PLACEHOLDER);
    assert.equal(derivePrivacyLevel({ category: "PROFILE.AADHAAR", risk: "critical" }), PRIVACY_LEVELS.LOCAL_APPROVAL);
    assert.equal(derivePrivacyLevel({ category: UNKNOWN_SENSITIVE, risk: "critical" }), PRIVACY_LEVELS.BLOCKED);
    assert.equal(isPrivacyLevel("LOCAL_APPROVAL"), true);
    assert.equal(isPrivacyLevel("PRIVATE"), false);
  });
});

describe("local DOM-to-screen region mapping", () => {
  it("clips visible controls and scales CSS bounds for DPR and visual zoom", () => {
    const fields = [
      field("FIELD_1", { category: "PROFILE.PHONE", confidence: 0.97, risk: "medium" }),
      field("FIELD_2", { category: UNKNOWN_SENSITIVE, confidence: 0.99, risk: "critical" }),
      field("FIELD_3", { category: null, confidence: 0.2, risk: "low" }),
    ];
    const snapshot = createLocalVisualSnapshot({
      snapshotId: "snapshot-v1-coordinate-test",
      fields,
      elementByFieldId: new Map([
        ["FIELD_1", elementWithRect({ left: 100, top: 50, width: 200, height: 40 })],
        ["FIELD_2", elementWithRect({ left: -10, top: 580, width: 30, height: 40 })],
        ["FIELD_3", elementWithRect({ left: 20, top: 700, width: 100, height: 20 })],
      ]),
    }, { windowLike: testWindow() });

    assert.equal(snapshot.screenId, "SCREEN_snapshot-v1-coordinate-test");
    assert.equal(snapshot.regionCount, 2);
    assert.deepEqual(snapshot.viewport, {
      width: 800,
      height: 600,
      scrollX: 100,
      scrollY: 200,
      devicePixelRatio: 2,
      visualScale: 1.25,
      pixelWidth: 2000,
      pixelHeight: 1500,
    });
    assert.deepEqual(snapshot.regions[0].cssBounds, { x: 100, y: 50, width: 200, height: 40 });
    assert.deepEqual(snapshot.regions[0].pixelBounds, { x: 250, y: 125, width: 500, height: 100 });
    assert.deepEqual(snapshot.regions[1].cssBounds, { x: 0, y: 580, width: 20, height: 20 });
    assert.deepEqual(snapshot.regions[1].pixelBounds, { x: 0, y: 1450, width: 50, height: 50 });
    assert.equal(snapshot.regions[0].privacyLevel, PRIVACY_LEVELS.PLACEHOLDER);
    assert.equal(snapshot.regions[1].privacyLevel, PRIVACY_LEVELS.BLOCKED);
  });

  it("uses decoded screenshot dimensions as the authoritative pixel scale", () => {
    const snapshot = createLocalVisualSnapshot({
      snapshotId: "snapshot-v1-image-scale",
      fields: [field("FIELD_1", { category: "PROFILE.AADHAAR", confidence: 0.98, risk: "critical" })],
      elementByFieldId: new Map([
        ["FIELD_1", elementWithRect({ left: 10, top: 20, width: 30, height: 40 })],
      ]),
    }, {
      windowLike: testWindow({ devicePixelRatio: 3 }),
      screenshotSize: { width: 1600, height: 1200 },
    });

    assert.deepEqual(snapshot.regions[0].pixelBounds, { x: 20, y: 40, width: 60, height: 80 });
    assert.equal(snapshot.regions[0].privacyLevel, PRIVACY_LEVELS.LOCAL_APPROVAL);
  });

  it("excludes hidden, transparent, disconnected and off-screen elements", () => {
    const fields = [1, 2, 3, 4, 5].map((index) => field(
      `FIELD_${index}`,
      { category: null, confidence: 0.1, risk: "low" },
    ));
    const disconnected = elementWithRect({ left: 10, top: 10, width: 20, height: 20 });
    disconnected.isConnected = false;
    const snapshot = createLocalVisualSnapshot({
      snapshotId: "snapshot-v1-hidden-test",
      fields,
      elementByFieldId: new Map([
        ["FIELD_1", elementWithRect({ left: 10, top: 10, width: 20, height: 20 })],
        ["FIELD_2", elementWithRect({ left: 10, top: 10, width: 20, height: 20 }, { display: "none" })],
        ["FIELD_3", elementWithRect({ left: 10, top: 10, width: 20, height: 20 }, { opacity: "0" })],
        ["FIELD_4", disconnected],
        ["FIELD_5", elementWithRect({ left: 900, top: 10, width: 20, height: 20 })],
      ]),
    }, { windowLike: testWindow() });

    assert.deepEqual(snapshot.regions.map((region) => region.fieldId), ["FIELD_1"]);
  });

  it("keeps local regions and coordinates out of the version-1 planning request", async () => {
    const html = await readFile(new URL("../../demo/scholarship.html", import.meta.url), "utf8");
    const { document, window } = parseHTML(html);
    Object.assign(window, {
      innerWidth: 1200,
      innerHeight: 800,
      devicePixelRatio: 1.5,
      scrollX: 0,
      scrollY: 0,
    });
    const scan = scanDocument(document);
    let offset = 20;
    for (const element of scan.elementByFieldId.values()) {
      const top = offset;
      element.getBoundingClientRect = () => ({ left: 30, top, width: 300, height: 36 });
      offset += 50;
    }
    const visualSnapshot = createLocalVisualSnapshot(scan, { windowLike: window });
    const request = createPlanningRequest({
      scanResult: createSafeScanResult(scan),
      availableProfileKeys: SUPPORTED_PROFILE_KEYS,
      requestId: "request-visual-isolation",
    });
    const serializedRequest = JSON.stringify(request);

    assert.ok(visualSnapshot.regionCount > 0);
    for (const forbiddenKey of ["screenId", "viewport", "cssBounds", "pixelBounds", "privacyLevel"] ) {
      assert.equal(serializedRequest.includes(forbiddenKey), false);
    }
    for (const rawValue of Object.values(FAKE_PROFILE)) {
      assert.equal(JSON.stringify(visualSnapshot).includes(rawValue), false);
      assert.equal(serializedRequest.includes(rawValue), false);
    }
  });
});
