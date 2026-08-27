import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRIVACY_LEVELS } from "../../shared/privacy-levels.js";
import {
  VisualRedactionError,
  createVisualRedactionPlan,
  redactCapture,
} from "../../extension/src/privacy/visual-redactor.js";

const ORIGINAL = "data:image/png;base64,b3JpZ2luYWw=";
const SANITIZED = "data:image/png;base64,c2FuaXRpemVk";

function region(regionId, privacyLevel, pixelBounds, overrides = {}) {
  return { regionId, privacyLevel, pixelBounds, ...overrides };
}

function snapshot(regions) {
  return { screenId: "SCREEN_TEST", regions };
}

function capture(regions) {
  return {
    originalDataUrl: ORIGINAL,
    width: 12,
    height: 8,
    visualSnapshot: snapshot(regions),
  };
}

describe("local visual redaction plan", () => {
  it("fully and opaquely masks private, critical, blocked and face regions with clipped padding", () => {
    const plan = createVisualRedactionPlan({
      width: 100,
      height: 80,
      visualSnapshot: snapshot([
        region("VISIBLE", PRIVACY_LEVELS.VISIBLE, { x: 1, y: 1, width: 10, height: 10 }),
        region("PRIVATE", PRIVACY_LEVELS.PLACEHOLDER, { x: 10, y: 10, width: 20, height: 10 }),
        region("CRITICAL", PRIVACY_LEVELS.LOCAL_APPROVAL, { x: 70, y: 60, width: 30, height: 20 }),
        region("BLOCKED", PRIVACY_LEVELS.BLOCKED, { x: 0, y: 0, width: 8, height: 8 }),
      ]),
      additionalRegions: [region(
        "FACE",
        PRIVACY_LEVELS.BLOCKED,
        { x: 40, y: 20, width: 15, height: 20 },
        { kind: "face" },
      ), {
        regionId: "CAPTCHA",
        kind: "captcha",
        pixelBounds: { x: 55, y: 15, width: 10, height: 10 },
      }],
      policy: { padding: 5 },
    });

    assert.deepEqual(plan.masks.map((mask) => mask.regionId), ["PRIVATE", "CRITICAL", "BLOCKED", "FACE", "CAPTCHA"]);
    assert.ok(plan.masks.every((mask) => mask.mode === "opaque"));
    assert.deepEqual(plan.masks[0].bounds, { x: 5, y: 5, width: 30, height: 20 });
    assert.deepEqual(plan.masks[1].bounds, { x: 65, y: 55, width: 35, height: 25 });
    assert.deepEqual(plan.masks[2].bounds, { x: 0, y: 0, width: 13, height: 13 });
  });

  it("crops irrelevant pixels and excludes sensitive regions outside the selected crop", () => {
    const plan = createVisualRedactionPlan({
      width: 200,
      height: 100,
      visualSnapshot: snapshot([
        region("IN", PRIVACY_LEVELS.PLACEHOLDER, { x: 60, y: 25, width: 20, height: 10 }),
        region("OUT", PRIVACY_LEVELS.BLOCKED, { x: 160, y: 20, width: 20, height: 20 }),
      ]),
      cropBounds: { x: 50, y: 20, width: 80, height: 50 },
      policy: { padding: 0 },
    });

    assert.deepEqual(plan.crop, { x: 50, y: 20, width: 80, height: 50 });
    assert.deepEqual(plan.requiredRegions, [{ regionId: "IN", bounds: { x: 10, y: 5, width: 20, height: 10 } }]);
    assert.equal(plan.excludedByCropCount, 1);
  });

  it("allows partial masking only after an explicit per-region safe-reveal decision", () => {
    const base = {
      width: 100,
      height: 40,
      policy: { padding: 0, privateMaskMode: "partial", partialRevealFraction: 0.25 },
    };
    const notApproved = createVisualRedactionPlan({
      ...base,
      visualSnapshot: snapshot([
        region("PHONE", PRIVACY_LEVELS.PLACEHOLDER, { x: 10, y: 10, width: 80, height: 20 }),
      ]),
    });
    const approved = createVisualRedactionPlan({
      ...base,
      visualSnapshot: snapshot([
        region("PHONE", PRIVACY_LEVELS.PLACEHOLDER, { x: 10, y: 10, width: 80, height: 20 }, { allowPartialReveal: true }),
      ]),
    });

    assert.equal(notApproved.masks[0].bounds.width, 80);
    assert.equal(approved.masks[0].bounds.width, 60);
  });
});

describe("coverage-gated pixel sanitization", () => {
  it("creates new pixels, changes every sensitive pixel, and preserves unrelated pixels", async () => {
    const sourcePixels = new Uint8Array(12 * 8).fill(7);
    let outputPixels;
    const result = await redactCapture(capture([
      region("PRIVATE", PRIVACY_LEVELS.PLACEHOLDER, { x: 2, y: 2, width: 4, height: 3 }),
    ]), {
      policy: { padding: 0 },
      rasterize: async ({ sourceDataUrl, plan }) => {
        assert.equal(sourceDataUrl, ORIGINAL);
        outputPixels = sourcePixels.slice();
        for (const mask of plan.masks) {
          for (let y = mask.bounds.y; y < mask.bounds.y + mask.bounds.height; y += 1) {
            for (let x = mask.bounds.x; x < mask.bounds.x + mask.bounds.width; x += 1) {
              outputPixels[(y * 12) + x] = 255;
            }
          }
        }
        return {
          sanitizedDataUrl: SANITIZED,
          appliedMasks: plan.masks.map((mask) => ({ ...mask, applied: true })),
        };
      },
    });

    assert.notEqual(outputPixels, sourcePixels);
    assert.equal(outputPixels[0], 7);
    for (let y = 2; y < 5; y += 1) {
      for (let x = 2; x < 6; x += 1) assert.equal(outputPixels[(y * 12) + x], 255);
    }
    assert.equal(result.sanitizedDataUrl, SANITIZED);
    assert.equal(result.coverage.ok, true);
  });

  it("destroys and blocks a candidate when any required mask is missing", async () => {
    let disposed = false;
    await assert.rejects(
      redactCapture(capture([
        region("PRIVATE", PRIVACY_LEVELS.PLACEHOLDER, { x: 2, y: 2, width: 4, height: 3 }),
        region("BLOCKED", PRIVACY_LEVELS.BLOCKED, { x: 8, y: 1, width: 2, height: 2 }),
      ]), {
        policy: { padding: 0 },
        rasterize: async ({ plan }) => ({
          sanitizedDataUrl: SANITIZED,
          appliedMasks: [{ ...plan.masks[0], applied: true }],
          dispose() { disposed = true; },
        }),
      }),
      (error) => error instanceof VisualRedactionError
        && error.code === "VISUAL_COVERAGE_FAILED"
        && error.coverage.uncoveredRegionIds.includes("BLOCKED"),
    );
    assert.equal(disposed, true);
  });

  it("rejects a rasterizer that reuses the original image", async () => {
    await assert.rejects(
      redactCapture(capture([]), {
        rasterize: async () => ({ sanitizedDataUrl: ORIGINAL, appliedMasks: [] }),
      }),
      (error) => error.code === "SANITIZED_IMAGE_INVALID",
    );
  });
});
