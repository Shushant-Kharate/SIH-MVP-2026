import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCompatibilityView,
  createPageAccessView,
  createSafeFailureView,
  createWorkflowAvailability,
} from "../../extension/src/ui/popup-view-model.js";

describe("popup permission and compatibility UX", () => {
  it("explains temporary selected-tab access before scanning", () => {
    const view = createPageAccessView({ ok: true });

    assert.equal(view.title, "Ready to scan this tab");
    assert.equal(view.scanEnabled, true);
    assert.match(view.copy, /only after your click/i);
    assert.match(view.copy, /selected tab/i);
    assert.match(view.copy, /other tabs are not accessed/i);
  });

  it("blocks scanning on unsupported browser pages with a recovery path", () => {
    const view = createPageAccessView({ ok: false, code: "PAGE_NOT_SUPPORTED" });

    assert.equal(view.title, "Unsupported browser page");
    assert.equal(view.scanEnabled, false);
    assert.match(view.copy, /normal HTTP or HTTPS form/i);
  });

  it("reports all four compatibility counts for a standard form", () => {
    const view = createCompatibilityView({
      adapterId: "generic",
      fieldCount: 9,
      privateFieldCount: 7,
      blockedFieldCount: 1,
      unsupportedControlCount: 2,
    });

    assert.equal(view.title, "Standard form detected");
    assert.deepEqual(view.counts, { detected: 9, mapped: 7, blocked: 1, unsupported: 2 });
    assert.equal(view.canInspect, true);
    assert.match(view.copy, /complete anything unrecognized manually/i);
  });

  it("labels Google Forms support as experimental and gives manual guidance", () => {
    const view = createCompatibilityView({
      adapterId: "google-forms-experimental",
      fieldCount: 4,
      privateFieldCount: 4,
      blockedFieldCount: 0,
      unsupportedControlCount: 3,
    });

    assert.equal(view.title, "Google Forms experimental");
    assert.equal(view.state, "experimental");
    assert.equal(view.counts.unsupported, 3);
    assert.match(view.copy, /unsupported questions manually/i);
    assert.match(view.copy, /move between sections yourself/i);
  });

  it("fails non-destructively when no supported fields are found", () => {
    const view = createCompatibilityView({ fieldCount: 0 });

    assert.equal(view.title, "No supported fields");
    assert.equal(view.canInspect, false);
    assert.equal(view.counts.detected, 0);
    assert.match(view.copy, /Nothing was changed/i);
    assert.match(view.copy, /scan again/i);
  });

  it("turns navigation and stale-plan failures into a rescan state", () => {
    for (const code of ["PAGE_NAVIGATED", "ACTION_PLAN_REJECTED", "SNAPSHOT_ID_MISMATCH"]) {
      const view = createSafeFailureView(code);
      assert.equal(view.title, "Page changed—rescan required");
      assert.equal(view.recovery, "rescan");
    }
  });

  it("provides reload or manual-completion recovery when temporary access fails", () => {
    const view = createSafeFailureView("SCANNER_INJECTION_FAILED");

    assert.equal(view.title, "Temporary page access unavailable");
    assert.equal(view.recovery, "reload-or-manual");
    assert.match(view.copy, /complete the form manually/i);
  });

  it("reports capture failures without claiming that screenshot data escaped", () => {
    assert.deepEqual(createSafeFailureView("SCREEN_CAPTURE_DENIED"), {
      title: "Screen analysis stopped",
      copy: "No screenshot was stored, logged or sent. Reload the form and try again, or continue with metadata-only scanning.",
      recovery: "retry-or-scan",
    });
  });

  it("unlocks planning only after a zero-match privacy payload is ready", () => {
    const beforeInspection = createWorkflowAvailability({
      profileReady: true,
      pageScanEnabled: true,
      scanAvailable: true,
      scanCanInspect: true,
      payloadReady: false,
    });
    const afterInspection = createWorkflowAvailability({
      profileReady: true,
      pageScanEnabled: true,
      scanAvailable: true,
      scanCanInspect: true,
      payloadReady: true,
    });

    assert.equal(beforeInspection.canInspect, true);
    assert.equal(beforeInspection.canPlanAndFill, false);
    assert.equal(afterInspection.canPlanAndFill, true);
  });
});
