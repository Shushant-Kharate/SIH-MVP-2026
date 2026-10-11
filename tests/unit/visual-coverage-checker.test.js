import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyVisualCoverage } from "../../extension/src/privacy/visual-coverage-checker.js";

describe("visual sensitive-region coverage", () => {
  it("passes only when every required region has a matching opaque covering mask", () => {
    const coverage = verifyVisualCoverage({
      width: 200,
      height: 100,
      requiredRegions: [
        { regionId: "PII_1", bounds: { x: 20, y: 20, width: 40, height: 20 } },
        { regionId: "FACE_1", bounds: { x: 100, y: 10, width: 30, height: 50 } },
      ],
      appliedMasks: [
        { regionId: "PII_1", mode: "opaque", applied: true, bounds: { x: 15, y: 15, width: 50, height: 30 } },
        { regionId: "FACE_1", mode: "opaque", applied: true, bounds: { x: 95, y: 5, width: 40, height: 60 } },
      ],
    });

    assert.deepEqual(coverage, {
      ok: true,
      requiredCount: 2,
      coveredCount: 2,
      uncoveredRegionIds: [],
    });
  });

  it("fails for a missing, partial, blurred, unapplied or mismatched mask", () => {
    const requiredRegions = [
      { regionId: "PII_1", bounds: { x: 20, y: 20, width: 40, height: 20 } },
    ];
    for (const mask of [
      undefined,
      { regionId: "PII_1", mode: "opaque", applied: true, bounds: { x: 20, y: 20, width: 39, height: 20 } },
      { regionId: "PII_1", mode: "blur", applied: true, bounds: { x: 10, y: 10, width: 100, height: 80 } },
      { regionId: "PII_1", mode: "opaque", applied: false, bounds: { x: 10, y: 10, width: 100, height: 80 } },
      { regionId: "OTHER", mode: "opaque", applied: true, bounds: { x: 10, y: 10, width: 100, height: 80 } },
    ]) {
      const coverage = verifyVisualCoverage({
        width: 200,
        height: 100,
        requiredRegions,
        appliedMasks: mask ? [mask] : [],
      });
      assert.equal(coverage.ok, false);
      assert.deepEqual(coverage.uncoveredRegionIds, ["PII_1"]);
    }
  });

  it("clips masks to output dimensions without accepting edge overflow as coverage", () => {
    const coverage = verifyVisualCoverage({
      width: 100,
      height: 80,
      requiredRegions: [{ regionId: "EDGE", bounds: { x: 90, y: 70, width: 10, height: 10 } }],
      appliedMasks: [{
        regionId: "EDGE",
        mode: "opaque",
        applied: true,
        bounds: { x: 88, y: 68, width: 20, height: 20 },
      }],
    });
    assert.equal(coverage.ok, true);
  });
});
