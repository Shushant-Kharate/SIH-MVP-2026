import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EphemeralRedactionStore } from "../../extension/src/vision/ephemeral-redaction-store.js";

function redaction(overrides = {}) {
  return {
    sanitizedDataUrl: "data:image/png;base64,c2FuaXRpemVk",
    width: 100,
    height: 80,
    maskCount: 2,
    coverage: { ok: true, requiredCount: 2, coveredCount: 2, uncoveredRegionIds: [] },
    redactionPlan: { masks: [] },
    ...overrides,
  };
}

describe("ephemeral sanitized-result lifecycle", () => {
  it("returns metadata without pixels and consumes the result once", () => {
    const store = new EphemeralRedactionStore({ schedule: () => "timer", cancelSchedule: () => {} });
    const metadata = store.replace(redaction());
    assert.deepEqual(metadata, {
      width: 100,
      height: 80,
      maskCount: 2,
      requiredCount: 2,
      coveredCount: 2,
      coveragePassed: true,
    });
    assert.equal(JSON.stringify(metadata).includes("c2FuaXRpemVk"), false);
    assert.match(store.consume().sanitizedDataUrl, /^data:image\/png;base64,/);
    assert.equal(store.consume(), null);
  });

  it("expires and clears sanitized pixels", () => {
    let expire;
    let notified = false;
    const store = new EphemeralRedactionStore({
      ttlMs: 1_000,
      schedule: (callback) => { expire = callback; return "timer"; },
      cancelSchedule: () => {},
      onExpire: () => { notified = true; },
    });
    store.replace(redaction());
    expire();
    assert.equal(store.hasResult(), false);
    assert.equal(notified, true);
  });

  it("rejects unverified results and any original-pixel property", () => {
    const store = new EphemeralRedactionStore();
    assert.throws(() => store.replace(redaction({ coverage: { ok: false } })), /coverage/);
    assert.throws(() => store.replace(redaction({ originalDataUrl: "data:image/png;base64,b3JpZ2luYWw=" })), /Original/);
  });
});
