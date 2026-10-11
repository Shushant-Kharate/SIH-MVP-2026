import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EphemeralCaptureStore } from "../../extension/src/vision/ephemeral-capture-store.js";

const PNG = "data:image/png;base64,aGVsbG8=";

function capture(overrides = {}) {
  return {
    originalDataUrl: PNG,
    width: 1200,
    height: 800,
    tabId: 9,
    windowId: 3,
    pageToken: "https://example.test/form",
    visualSnapshot: { regions: [{ fieldId: "FIELD_1" }] },
    ...overrides,
  };
}

describe("memory-only capture lifecycle", () => {
  it("exposes safe metadata while keeping pixels and page correlation private", () => {
    const store = new EphemeralCaptureStore({
      now: () => 10_000,
      schedule: () => "timer-1",
      cancelSchedule: () => {},
      createCaptureId: () => "CAPTURE_TEST",
    });
    const metadata = store.replace(capture());

    assert.deepEqual(metadata, {
      captureId: "CAPTURE_TEST",
      width: 1200,
      height: 800,
      regionCount: 1,
      createdAt: 10_000,
      expiresAt: 70_000,
    });
    assert.equal(JSON.stringify(metadata).includes(PNG), false);
    assert.equal(JSON.stringify(metadata).includes("example.test"), false);
    assert.equal(store.hasCapture(), true);
  });

  it("replaces older pixels, consumes once and clears its timer", () => {
    const cancelled = [];
    let timerNumber = 0;
    const store = new EphemeralCaptureStore({
      schedule: () => `timer-${++timerNumber}`,
      cancelSchedule: (timer) => cancelled.push(timer),
      createCaptureId: () => `CAPTURE_${timerNumber + 1}`,
    });
    store.replace(capture());
    const replacement = store.replace(capture({ originalDataUrl: `${PNG}replacement` }));
    const consumed = store.consume(replacement.captureId);

    assert.equal(consumed.originalDataUrl, `${PNG}replacement`);
    assert.equal(store.consume(replacement.captureId), null);
    assert.equal(store.hasCapture(), false);
    assert.deepEqual(cancelled, ["timer-1", "timer-2"]);
  });

  it("expires automatically and reports only the expired identifier", () => {
    let expiryCallback;
    const expired = [];
    const store = new EphemeralCaptureStore({
      ttlMs: 1_000,
      schedule: (callback) => { expiryCallback = callback; return "timer"; },
      cancelSchedule: () => {},
      createCaptureId: () => "CAPTURE_EXPIRING",
      onExpire: (captureId) => expired.push(captureId),
    });
    store.replace(capture());
    expiryCallback();

    assert.equal(store.hasCapture(), false);
    assert.deepEqual(expired, ["CAPTURE_EXPIRING"]);
  });

  it("rejects entries without PNG pixels and correlated regions", () => {
    const store = new EphemeralCaptureStore({ createCaptureId: () => "CAPTURE_TEST" });
    assert.throws(() => store.replace(capture({ originalDataUrl: "bad" })), /PNG capture/);
    assert.throws(() => store.replace(capture({ visualSnapshot: null })), /visual snapshot/);
  });
});
