import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRIVACY_LEVELS } from "../../shared/privacy-levels.js";
import { UNKNOWN_SENSITIVE } from "../../shared/pii-taxonomy.js";
import { runSelectiveOcr, selectOcrCandidates } from "../../extension/src/vision/selective-ocr.js";

const SOURCE = "data:image/png;base64,c291cmNl";

function candidate(regionId, bounds, overrides = {}) {
  return {
    regionId,
    kind: "text-candidate",
    semanticType: null,
    confidence: 0.4,
    pixelBounds: bounds,
    ...overrides,
  };
}

describe("bounded OCR candidate selection", () => {
  it("selects only ambiguous small crops and rejects full-screen or already classified regions", () => {
    const selected = selectOcrCandidates({
      width: 1000,
      height: 800,
      regions: [
        candidate("REGION_SMALL", { x: 10, y: 10, width: 200, height: 50 }),
        candidate("REGION_FULL", { x: 0, y: 0, width: 1000, height: 800 }),
        candidate("REGION_KNOWN", { x: 10, y: 100, width: 200, height: 50 }, { semanticType: "PROFILE.EMAIL", confidence: 0.99, kind: "field" }),
        candidate("REGION_AMBIGUOUS", { x: 10, y: 160, width: 200, height: 50 }, { kind: "field", confidence: 0.2 }),
      ],
    });
    assert.deepEqual(selected.map((item) => item.regionId), ["REGION_SMALL", "REGION_AMBIGUOUS"]);
    assert.ok(selected.every((item) => item.bounds.width < 1000 && item.bounds.height < 800));
  });

  it("caps OCR at six crops and forty percent total image area", () => {
    const selected = selectOcrCandidates({
      width: 100,
      height: 100,
      regions: Array.from({ length: 12 }, (_, index) => candidate(
        `REGION_${index}`,
        { x: (index % 4) * 20, y: Math.floor(index / 4) * 20, width: 18, height: 18 },
      )),
    });
    assert.ok(selected.length <= 6);
    assert.ok(selected.reduce((sum, item) => sum + item.bounds.width * item.bounds.height, 0) <= 4000);
  });
});

describe("raw-text-free selective OCR", () => {
  it("classifies raw OCR locally, returns only canonical semantics, and terminates resources", async () => {
    let recognition = 0;
    let terminated = false;
    let cropDisposed = false;
    const result = await runSelectiveOcr({
      sourceDataUrl: SOURCE,
      width: 500,
      height: 300,
      regions: [
        candidate("REGION_EMAIL", { x: 10, y: 10, width: 180, height: 40 }),
        candidate("REGION_VALUE", { x: 10, y: 70, width: 180, height: 40 }),
      ],
      cropperFactory: async () => ({
        crop: () => "data:image/png;base64,Y3JvcA==",
        dispose() { cropDisposed = true; },
      }),
      workerFactory: async () => ({
        async recognize() {
          recognition += 1;
          return recognition === 1
            ? { data: { text: "Email address: secret.person@example.com", confidence: 91 } }
            : { data: { text: "98765 43210", confidence: 74 } };
        },
        async terminate() { terminated = true; },
      }),
    });

    assert.equal(result.detections[0].semanticType, "PROFILE.EMAIL");
    assert.equal(result.detections[0].safeLabel, "Email address");
    assert.equal(result.detections[1].semanticType, UNKNOWN_SENSITIVE);
    assert.equal(result.detections[1].privacyLevel, PRIVACY_LEVELS.BLOCKED);
    assert.ok(result.detections.every((item) => item.rawTextRetained === false));
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("secret.person"), false);
    assert.equal(serialized.includes("98765"), false);
    assert.equal(terminated, true);
    assert.equal(cropDisposed, true);
  });

  it("does not initialize OCR when there are no bounded candidates", async () => {
    let initialized = false;
    const result = await runSelectiveOcr({
      sourceDataUrl: SOURCE,
      width: 100,
      height: 100,
      regions: [],
      workerFactory: async () => { initialized = true; },
    });
    assert.equal(result.candidateCount, 0);
    assert.equal(initialized, false);
  });

  it("disposes decoded pixels when worker initialization fails", async () => {
    let cropDisposed = false;
    await assert.rejects(runSelectiveOcr({
      sourceDataUrl: SOURCE,
      width: 100,
      height: 100,
      regions: [candidate("REGION_TEXT", { x: 5, y: 5, width: 40, height: 20 })],
      cropperFactory: async () => ({
        crop: () => "data:image/png;base64,Y3JvcA==",
        dispose() { cropDisposed = true; },
      }),
      workerFactory: async () => { throw new Error("worker unavailable"); },
    }), /worker unavailable/);
    assert.equal(cropDisposed, true);
  });
});
