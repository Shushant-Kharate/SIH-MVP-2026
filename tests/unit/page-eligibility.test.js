import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPageEligibility } from "../../extension/src/core/page-eligibility.js";

describe("current-page eligibility", () => {
  it("accepts normal HTTP and HTTPS pages without retaining their path", () => {
    const googleForm = getPageEligibility("https://docs.google.com/forms/d/e/example/viewform?usp=sharing");
    const localDemo = getPageEligibility("http://localhost:8787/demo/scholarship.html");

    assert.deepEqual(googleForm, {
      ok: true,
      protocol: "https:",
      origin: "https://docs.google.com",
    });
    assert.deepEqual(localDemo, {
      ok: true,
      protocol: "http:",
      origin: "http://localhost:8787",
    });
    assert.equal(Object.hasOwn(googleForm, "url"), false);
  });

  it("rejects browser pages, local files, data URLs and invalid addresses", () => {
    for (const url of [
      "chrome://extensions",
      "chrome-extension://abcdefghijklmnop/options.html",
      "file:///C:/example/form.html",
      "data:text/html,<input>",
      "not a URL",
      "",
    ]) {
      assert.equal(getPageEligibility(url).ok, false, url);
    }
  });

  it("rejects protected browser extension stores even though they use HTTPS", () => {
    for (const url of [
      "https://chromewebstore.google.com/detail/example/id",
      "https://chrome.google.com/webstore/detail/example/id",
      "https://microsoftedge.microsoft.com/addons/detail/example/id",
    ]) {
      const result = getPageEligibility(url);
      assert.equal(result.ok, false, url);
      assert.equal(result.code, "PAGE_NOT_SUPPORTED");
    }
  });
});
