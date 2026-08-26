function safeCount(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function createWorkflowAvailability({
  profileReady = false,
  pageScanEnabled = false,
  scanAvailable = false,
  scanCanInspect = false,
  payloadReady = false,
  scanInProgress = false,
} = {}) {
  return Object.freeze({
    canScan: pageScanEnabled && !scanInProgress,
    canInspect: profileReady && scanAvailable && scanCanInspect,
    canPlanAndFill: profileReady && scanAvailable && scanCanInspect && payloadReady,
  });
}

export function createPageAccessView(eligibility) {
  if (eligibility?.ok === true) {
    return Object.freeze({
      state: "ready",
      title: "Ready to scan this tab",
      copy: "Scanning starts only after your click and applies only to this selected tab. Other tabs are not accessed.",
      scanEnabled: true,
    });
  }

  if (eligibility?.code === "PAGE_NOT_SUPPORTED") {
    return Object.freeze({
      state: "unsupported",
      title: "Unsupported browser page",
      copy: "Open a normal HTTP or HTTPS form, then reopen PrivacyFill. Browser pages, extension stores and local files cannot be scanned.",
      scanEnabled: false,
    });
  }

  return Object.freeze({
    state: "unavailable",
    title: "Selected tab unavailable",
    copy: "Open the form in the active tab, then reopen PrivacyFill and try again.",
    scanEnabled: false,
  });
}

export function createCompatibilityView(scan) {
  const counts = Object.freeze({
    detected: safeCount(scan?.fieldCount),
    mapped: safeCount(scan?.privateFieldCount),
    blocked: safeCount(scan?.blockedFieldCount),
    unsupported: safeCount(scan?.unsupportedControlCount),
  });

  if (counts.detected === 0) {
    return Object.freeze({
      state: "empty",
      title: "No supported fields",
      copy: "Nothing was changed. Complete this page manually, or move to a section with standard fields and scan again.",
      counts,
      canInspect: false,
    });
  }

  if (scan?.adapterId === "google-forms-experimental") {
    return Object.freeze({
      state: "experimental",
      title: "Google Forms experimental",
      copy: counts.unsupported > 0
        ? "Only compatible native questions can be filled. Complete unsupported questions manually, move between sections yourself, then scan again."
        : "Compatible native questions were detected. Move between sections yourself and scan again after each section change.",
      counts,
      canInspect: counts.mapped > 0,
    });
  }

  return Object.freeze({
    state: counts.mapped > 0 ? "supported" : "manual",
    title: counts.mapped > 0 ? "Standard form detected" : "No private categories mapped",
    copy: counts.mapped > 0
      ? "Compatibility depends on accessible labels and supported native controls. Review blocked fields and complete anything unrecognized manually."
      : "The controls were detected, but none matched the saved private categories. Nothing will be filled automatically.",
    counts,
    canInspect: counts.mapped > 0,
  });
}

const RESCAN_ERROR_CODES = new Set([
  "ACTION_PLAN_REJECTED",
  "INVALID_SCAN",
  "LIVE_SNAPSHOT_CHANGED",
  "PAGE_NAVIGATED",
  "PLAN_CORRELATION_FAILED",
  "PLAN_SNAPSHOT_MISMATCH",
  "SNAPSHOT_ID_MISMATCH",
  "TARGET_REPLACED",
]);

export function createSafeFailureView(code, fallbackMessage = "") {
  if (code === "PAGE_NOT_SUPPORTED") {
    return Object.freeze({
      title: "Unsupported browser page",
      copy: "Open a normal HTTP or HTTPS form and try again. This page was not scanned.",
      recovery: "open-page",
    });
  }

  if (code === "NO_SUPPORTED_FIELDS") {
    return Object.freeze({
      title: "No supported fields",
      copy: "Nothing was changed. Complete this page manually, or move to another form section and scan again.",
      recovery: "manual-or-rescan",
    });
  }

  if (RESCAN_ERROR_CODES.has(code)) {
    return Object.freeze({
      title: "Page changed—rescan required",
      copy: "The previous scan is no longer valid. Review the current page and scan it again before filling.",
      recovery: "rescan",
    });
  }

  if (["PAGE_ACCESS_DENIED", "SCANNER_INJECTION_FAILED", "CONTENT_SCRIPT_UNAVAILABLE"].includes(code)) {
    return Object.freeze({
      title: "Temporary page access unavailable",
      copy: "Reload the form, reopen PrivacyFill and click Scan again. You can complete the form manually if access remains unavailable.",
      recovery: "reload-or-manual",
    });
  }

  const safeFallback = typeof fallbackMessage === "string" && fallbackMessage.trim().length > 0
    ? fallbackMessage.trim()
    : "PrivacyFill could not complete this step safely.";
  return Object.freeze({
    title: "Action safely stopped",
    copy: `${safeFallback} Review the page and scan again, or complete the remaining fields manually.`,
    recovery: "manual-or-rescan",
  });
}
