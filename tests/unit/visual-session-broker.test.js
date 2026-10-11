import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VisualSessionBroker } from "../../extension/src/vision/visual-session-broker.js";

const ORIGINAL = "data:image/png;base64,b3JpZ2luYWw=";
const SANITIZED = "data:image/png;base64,c2FuaXRpemVk";

function session(overrides = {}) {
  return {
    originalDataUrl: ORIGINAL,
    width: 100,
    height: 80,
    tabId: 7,
    windowId: 2,
    pageToken: "https://example.test/form",
    visualSnapshot: { screenId: "SCREEN_test", regions: [] },
    redaction: {
      sanitizedDataUrl: SANITIZED,
      coverage: { ok: true, requiredCount: 0, coveredCount: 0 },
    },
    ...overrides,
  };
}

describe("one-time visual session broker", () => {
  it("hands pixels to the matching inspector session exactly once", () => {
    const cancelled = [];
    const broker = new VisualSessionBroker({
      now: () => 10_000,
      createId: () => "VISUAL_TEST",
      schedule: () => "timer",
      cancelSchedule: (timer) => cancelled.push(timer),
    });
    const metadata = broker.create(session());
    const taken = broker.take(metadata.sessionId);

    assert.deepEqual(metadata, { sessionId: "VISUAL_TEST", expiresAt: 70_000 });
    assert.equal(taken.originalDataUrl, ORIGINAL);
    assert.equal(taken.redaction.sanitizedDataUrl, SANITIZED);
    assert.equal(taken.expiresAt, 70_000);
    assert.equal(broker.take(metadata.sessionId), null);
    assert.equal(broker.hasSession(), false);
    assert.deepEqual(cancelled, ["timer"]);
  });

  it("replaces old sessions and clears pixels on timeout or cancellation", () => {
    const callbacks = [];
    const broker = new VisualSessionBroker({
      createId: (() => { let count = 0; return () => `VISUAL_${++count}`; })(),
      schedule: (callback) => { callbacks.push(callback); return callbacks.length; },
      cancelSchedule: () => {},
    });
    const first = broker.create(session());
    const second = broker.create(session());
    assert.equal(broker.take(first.sessionId), null);
    assert.equal(broker.clear("WRONG"), false);
    assert.equal(broker.clear(second.sessionId), true);
    assert.equal(broker.hasSession(), false);

    broker.create(session());
    callbacks.at(-1)();
    assert.equal(broker.hasSession(), false);
  });

  it("rejects reused pixels, failed coverage and invalid tab correlation", () => {
    const broker = new VisualSessionBroker({ createId: () => "VISUAL_TEST" });
    assert.throws(() => broker.create(session({
      redaction: { sanitizedDataUrl: ORIGINAL, coverage: { ok: true } },
    })), /Distinct/);
    assert.throws(() => broker.create(session({
      redaction: { sanitizedDataUrl: SANITIZED, coverage: { ok: false } },
    })), /coverage/);
    assert.throws(() => broker.create(session({ tabId: null })), /correlation/);
  });
});
