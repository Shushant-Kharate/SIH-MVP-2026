import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ScreenCaptureError,
  captureSelectedTab,
} from "../../extension/src/vision/screen-capture.js";

const PNG = "data:image/png;base64,aGVsbG8=";

describe("explicit selected-tab screen capture", () => {
  it("captures only the selected window as PNG and returns local correlation data", async () => {
    const calls = [];
    const result = await captureSelectedTab({
      tab: { id: 7, windowId: 4, url: "https://forms.example.test/apply" },
      tabsApi: {
        async captureVisibleTab(...args) {
          calls.push(args);
          return PNG;
        },
      },
      decodeImageDimensions: async (dataUrl) => {
        assert.equal(dataUrl, PNG);
        return { width: 1440, height: 900 };
      },
    });

    assert.deepEqual(calls, [[4, { format: "png" }]]);
    assert.deepEqual(result, {
      originalDataUrl: PNG,
      width: 1440,
      height: 900,
      tabId: 7,
      windowId: 4,
      pageToken: "https://forms.example.test/apply",
    });
  });

  it("refuses protected browser pages before capture", async () => {
    let called = false;
    await assert.rejects(
      captureSelectedTab({
        tab: { id: 7, windowId: 4, url: "chrome://settings" },
        tabsApi: { async captureVisibleTab() { called = true; } },
      }),
      (error) => error instanceof ScreenCaptureError && error.code === "PAGE_NOT_SUPPORTED",
    );
    assert.equal(called, false);
  });

  it("normalizes denied, invalid and undecodable captures to safe error codes", async () => {
    await assert.rejects(
      captureSelectedTab({
        tab: { id: 1, windowId: 2, url: "https://example.test" },
        tabsApi: { async captureVisibleTab() { throw new Error("raw browser detail"); } },
      }),
      (error) => error.code === "SCREEN_CAPTURE_DENIED" && !error.message.includes("raw browser detail"),
    );
    await assert.rejects(
      captureSelectedTab({
        tab: { id: 1, windowId: 2, url: "https://example.test" },
        tabsApi: { async captureVisibleTab() { return "not-an-image"; } },
      }),
      (error) => error.code === "SCREEN_CAPTURE_INVALID",
    );
    await assert.rejects(
      captureSelectedTab({
        tab: { id: 1, windowId: 2, url: "https://example.test" },
        tabsApi: { async captureVisibleTab() { return PNG; } },
        decodeImageDimensions: async () => { throw new Error("decoder detail"); },
      }),
      (error) => error.code === "SCREEN_DECODE_FAILED" && !error.message.includes("decoder detail"),
    );
  });
});
