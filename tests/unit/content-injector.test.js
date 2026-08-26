import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MESSAGE_TYPES } from "../../shared/message-types.js";
import {
  ContentInjectionError,
  ensureContentScript,
} from "../../extension/src/core/content-injector.js";

const ELIGIBLE_TAB = Object.freeze({ id: 42, url: "https://example.test/application" });
const READY = Object.freeze({ ok: true, data: { ready: true, version: 1 }, error: null });

describe("on-demand content-script injection", () => {
  it("reuses an existing ready scanner without injecting a duplicate", async () => {
    const messages = [];
    let injectionCount = 0;
    const result = await ensureContentScript({
      tab: ELIGIBLE_TAB,
      tabsApi: {
        async sendMessage(tabId, message) {
          messages.push({ tabId, message });
          return READY;
        },
      },
      scriptingApi: {
        async executeScript() { injectionCount += 1; },
      },
    });

    assert.deepEqual(result, { ready: true, injected: false });
    assert.equal(injectionCount, 0);
    assert.deepEqual(messages, [{
      tabId: 42,
      message: { type: MESSAGE_TYPES.PING_CONTENT_SCRIPT },
    }]);
  });

  it("injects the packaged top-frame scanner after a failed first ping", async () => {
    let pingCount = 0;
    const injections = [];
    const result = await ensureContentScript({
      tab: ELIGIBLE_TAB,
      tabsApi: {
        async sendMessage() {
          pingCount += 1;
          if (pingCount === 1) throw new Error("Receiving end does not exist");
          return READY;
        },
      },
      scriptingApi: {
        async executeScript(details) { injections.push(details); },
      },
    });

    assert.deepEqual(result, { ready: true, injected: true });
    assert.equal(pingCount, 2);
    assert.deepEqual(injections, [{
      target: { tabId: 42, allFrames: false },
      files: ["content.js"],
    }]);
  });

  it("fails safely when Chrome denies scanner injection", async () => {
    await assert.rejects(
      ensureContentScript({
        tab: ELIGIBLE_TAB,
        tabsApi: { async sendMessage() { throw new Error("No receiver"); } },
        scriptingApi: { async executeScript() { throw new Error("Cannot access page"); } },
      }),
      (error) => error instanceof ContentInjectionError
        && error.code === "SCANNER_INJECTION_FAILED"
        && !error.message.includes("Cannot access page"),
    );
  });

  it("fails safely when the scanner is still unavailable after injection", async () => {
    await assert.rejects(
      ensureContentScript({
        tab: ELIGIBLE_TAB,
        tabsApi: { async sendMessage() { return undefined; } },
        scriptingApi: { async executeScript() {} },
      }),
      (error) => error.code === "CONTENT_SCRIPT_UNAVAILABLE",
    );
  });

  it("rejects an ineligible page before calling Chrome injection APIs", async () => {
    let apiCallCount = 0;
    await assert.rejects(
      ensureContentScript({
        tab: { id: 7, url: "chrome://settings" },
        tabsApi: { async sendMessage() { apiCallCount += 1; } },
        scriptingApi: { async executeScript() { apiCallCount += 1; } },
      }),
      (error) => error.code === "PAGE_NOT_SUPPORTED",
    );
    assert.equal(apiCallCount, 0);
  });

  it("rejects a missing tab or unavailable extension APIs", async () => {
    await assert.rejects(
      ensureContentScript({ tab: { url: ELIGIBLE_TAB.url } }),
      (error) => error.code === "ACTIVE_TAB_MISSING",
    );
    await assert.rejects(
      ensureContentScript({ tab: ELIGIBLE_TAB, tabsApi: {}, scriptingApi: {} }),
      (error) => error.code === "EXTENSION_API_UNAVAILABLE",
    );
  });
});
