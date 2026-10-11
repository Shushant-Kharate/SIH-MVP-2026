import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRIVACY_LEVELS } from "../../shared/privacy-levels.js";
import {
  detectFaceRegions,
  detectTextRegionCandidates,
  runLocalVisualDetection,
} from "../../extension/src/vision/local-vision-detector.js";

function rgba(width, height, color = [250, 250, 250, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set(color, index * 4);
  return { data, width, height };
}

function fill(image, bounds, color) {
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      image.data.set(color, ((y * image.width) + x) * 4);
    }
  }
}

describe("packaged classical visual detection", () => {
  it("finds a face-like skin component and returns an opaque local region", () => {
    const image = rgba(80, 60);
    fill(image, { x: 25, y: 15, width: 18, height: 22 }, [210, 145, 105, 255]);
    const regions = detectFaceRegions(image, { sourceWidth: 800, sourceHeight: 600 });
    assert.equal(regions.length, 1);
    assert.equal(regions[0].kind, "face");
    assert.equal(regions[0].privacyLevel, PRIVACY_LEVELS.BLOCKED);
    assert.deepEqual(regions[0].pixelBounds, { x: 250, y: 150, width: 180, height: 220 });
  });

  it("finds bounded dark text bands without returning any pixel or text content", () => {
    const image = rgba(100, 50);
    for (let x = 15; x < 75; x += 4) fill(image, { x, y: 20, width: 2, height: 4 }, [20, 20, 20, 255]);
    const regions = detectTextRegionCandidates(image);
    assert.ok(regions.length >= 1);
    assert.equal(regions[0].kind, "text-candidate");
    assert.equal(JSON.stringify(regions).includes("data"), false);
  });

  it("reports only count, duration and execution-mode metrics", () => {
    const result = runLocalVisualDetection(rgba(40, 30));
    assert.deepEqual(Object.keys(result.metrics).sort(), ["durationMs", "faceRegionCount", "mode", "textCandidateCount"]);
    assert.equal(JSON.stringify(result).includes("Uint8"), false);
  });
});
