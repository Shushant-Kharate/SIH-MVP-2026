import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRIVACY_LEVELS } from "../../shared/privacy-levels.js";
import {
  assertVisualInspectorPreview,
  createVisualInspectorPreview,
  VISUAL_INSPECTOR_PREVIEW_VERSION,
} from "../../shared/visual-inspector-contract.js";

function validPreview() {
  return createVisualInspectorPreview({
    visualSnapshot: { screenId: "SCREEN_snapshot-v1-test" },
    redaction: {
      width: 1200,
      height: 800,
      maskCount: 1,
      coverage: { ok: true, requiredCount: 1, coveredCount: 1 },
    },
    regions: [{
      regionId: "REGION_FIELD_1",
      role: "textbox",
      semanticType: "PROFILE.EMAIL",
      privacyLevel: PRIVACY_LEVELS.PLACEHOLDER,
      pixelBounds: { x: 20, y: 30, width: 200, height: 40 },
    }],
  });
}

describe("local visual inspector preview contract", () => {
  it("contains only anonymous geometry and coverage proof", () => {
    const preview = validPreview();
    assert.equal(preview.version, VISUAL_INSPECTOR_PREVIEW_VERSION);
    assert.equal(preview.networkEnabled, false);
    assert.equal(preview.redaction.allRegionsCovered, true);
    assert.equal(assertVisualInspectorPreview(preview).screenId, preview.screenId);
    const serialized = JSON.stringify(preview);
    for (const forbidden of ["data:image", "originalDataUrl", "sanitizedDataUrl", "rawOcr", "pageToken", "https://"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("rejects unknown properties, raw semantic strings and inconsistent coverage", () => {
    assert.throws(() => assertVisualInspectorPreview({ ...validPreview(), url: "https://example.test" }), /contract/);
    assert.throws(() => assertVisualInspectorPreview({
      ...validPreview(),
      regions: [{ ...validPreview().regions[0], rawText: "private" }],
    }), /unknown/);
    assert.throws(() => createVisualInspectorPreview({
      visualSnapshot: { screenId: "SCREEN_test" },
      redaction: { width: 10, height: 10, maskCount: 1, coverage: { ok: true, requiredCount: 1, coveredCount: 1 } },
      regions: [{
        regionId: "REGION_1",
        role: "textbox",
        semanticType: "My real email address",
        privacyLevel: PRIVACY_LEVELS.PLACEHOLDER,
        pixelBounds: { x: 0, y: 0, width: 5, height: 5 },
      }],
    }), /semantic/);
    assert.throws(() => createVisualInspectorPreview({
      visualSnapshot: { screenId: "SCREEN_test" },
      redaction: { width: 10, height: 10, maskCount: 0, coverage: { ok: true, requiredCount: 1, coveredCount: 0 } },
      regions: [],
    }), /coverage/);
  });
});
