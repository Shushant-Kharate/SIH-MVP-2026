import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { ensureContentScript } from "./core/content-injector.js";
import { getPageEligibility } from "./core/page-eligibility.js";
import { redactCapture } from "./privacy/visual-redactor.js";
import { EphemeralCaptureStore } from "./vision/ephemeral-capture-store.js";
import { ScreenCaptureError, captureSelectedTab } from "./vision/screen-capture.js";
import {
  createCompatibilityView,
  createPageAccessView,
  createSafeFailureView,
  createWorkflowAvailability,
} from "./ui/popup-view-model.js";

const title = document.querySelector("#profile-status-title");
const copy = document.querySelector("#profile-status-copy");
const dot = document.querySelector("#profile-status-dot");
const count = document.querySelector("#available-count");
const openProfileButton = document.querySelector("#open-profile");
const clearProfileButton = document.querySelector("#clear-profile");
const pageAccess = document.querySelector("#page-access");
const pageAccessTitle = document.querySelector("#page-access-title");
const pageAccessCopy = document.querySelector("#page-access-copy");
const scanButton = document.querySelector("#scan-form");
const scanResult = document.querySelector("#scan-result");
const compatibilityPanel = document.querySelector("#compatibility-panel");
const compatibilityTitle = document.querySelector("#compatibility-title");
const compatibilityCopy = document.querySelector("#compatibility-copy");
const compatibilityBadge = document.querySelector("#compatibility-badge");
const detectedFieldCount = document.querySelector("#detected-field-count");
const mappedFieldCount = document.querySelector("#mapped-field-count");
const blockedFieldCount = document.querySelector("#blocked-field-count");
const unsupportedFieldCount = document.querySelector("#unsupported-field-count");
const inspectPayloadButton = document.querySelector("#inspect-payload");
const planFillButton = document.querySelector("#plan-fill");
const viewAuditButton = document.querySelector("#view-audit");
const payloadPanel = document.querySelector("#payload-panel");
const payloadCheck = document.querySelector("#payload-check");
const payloadJson = document.querySelector("#payload-json");
const backendStatus = document.querySelector("#backend-status");
const auditPanel = document.querySelector("#audit-panel");
const auditSummary = document.querySelector("#audit-summary");
const auditList = document.querySelector("#audit-list");
const clearAuditButton = document.querySelector("#clear-audit");
const analyzeScreenButton = document.querySelector("#analyze-screen");
const visualCapturePanel = document.querySelector("#visual-capture-panel");
const visualCaptureSummary = document.querySelector("#visual-capture-summary");
const clearVisualCaptureButton = document.querySelector("#clear-visual-capture");

let latestScanResult = null;
let latestScanTab = null;
let profileReady = false;
let pageScanEnabled = false;
let scanInProgress = false;
let latestScanCanInspect = false;
let payloadReady = false;
let captureInProgress = false;
let latestVisualTab = null;
let visualCaptureGeneration = 0;
let latestVisualSessionId = null;

const visualCaptureStore = new EphemeralCaptureStore({
  onExpire() {
    visualCaptureGeneration += 1;
    latestVisualTab = null;
    visualCapturePanel.hidden = true;
    renderScanResult("Visible-screen capture expired and was cleared from memory.", "neutral");
    updateWorkflowButtons();
  },
});

async function sendMessage(type, payload = undefined) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return {
      ok: false,
      data: null,
      error: { code: "EXTENSION_RUNTIME_UNAVAILABLE", message: "Open this page from the installed extension." },
    };
  }
  try {
    return await chrome.runtime.sendMessage({ type, ...(payload ? { payload } : {}) });
  } catch {
    return {
      ok: false,
      data: null,
      error: { code: "EXTENSION_RUNTIME_UNAVAILABLE", message: "Reload the extension and try again." },
    };
  }
}

function renderProfileStatus(status) {
  const available = status?.availableProfileKeys?.length ?? 0;
  const hasProfile = status?.hasProfile === true;
  profileReady = hasProfile;

  title.textContent = hasProfile ? "Local profile ready" : "Local profile required";
  copy.textContent = hasProfile
    ? `${available} private categories are available for local resolution.`
    : "You can scan now, but create a session profile before inspecting or filling.";
  dot.dataset.state = hasProfile ? "ready" : "missing";
  count.textContent = `${available} profile ${available === 1 ? "category" : "categories"} available`;
  openProfileButton.textContent = hasProfile ? "Replace profile" : "Set up profile";
  clearProfileButton.disabled = !hasProfile;
  updateWorkflowButtons();
}

async function refreshProfileStatus() {
  const response = await sendMessage(MESSAGE_TYPES.PROFILE_GET_STATUS);
  if (!response?.ok) {
    title.textContent = "Profile status unavailable";
    copy.textContent = response?.error?.message ?? "Reload the extension and try again.";
    dot.dataset.state = "missing";
    clearProfileButton.disabled = true;
    profileReady = false;
    updateWorkflowButtons();
    return;
  }
  renderProfileStatus(response.data);
}

function renderScanResult(text, tone) {
  scanResult.hidden = false;
  scanResult.dataset.tone = tone;
  scanResult.textContent = text;
}

function updateWorkflowButtons() {
  const availability = createWorkflowAvailability({
    profileReady,
    pageScanEnabled,
    scanAvailable: latestScanResult !== null,
    scanCanInspect: latestScanCanInspect,
    payloadReady,
    scanInProgress: scanInProgress || captureInProgress,
  });
  scanButton.disabled = !availability.canScan;
  inspectPayloadButton.disabled = !availability.canInspect;
  planFillButton.disabled = !availability.canPlanAndFill;
  analyzeScreenButton.disabled = captureInProgress || scanInProgress || !pageScanEnabled;
}

function renderPageAccess(view) {
  pageAccess.dataset.state = view.state;
  pageAccessTitle.textContent = view.title;
  pageAccessCopy.textContent = view.copy;
  pageScanEnabled = view.scanEnabled;
  updateWorkflowButtons();
}

function renderCompatibility(scan) {
  const view = createCompatibilityView(scan);
  compatibilityPanel.hidden = false;
  compatibilityPanel.dataset.state = view.state;
  compatibilityTitle.textContent = view.title;
  compatibilityCopy.textContent = view.copy;
  compatibilityBadge.textContent = view.state === "experimental"
    ? "Experimental subset"
    : view.state === "supported"
      ? "Supported subset"
      : "Manual completion";
  detectedFieldCount.textContent = String(view.counts.detected);
  mappedFieldCount.textContent = String(view.counts.mapped);
  blockedFieldCount.textContent = String(view.counts.blocked);
  unsupportedFieldCount.textContent = String(view.counts.unsupported);
  latestScanCanInspect = view.canInspect;
  updateWorkflowButtons();
  return view;
}

function renderSafeFailure(code, fallbackMessage, tone = "error") {
  const view = createSafeFailureView(code, fallbackMessage);
  renderScanResult(`${view.title}. ${view.copy}`, tone);
  return view;
}

async function getActiveTab() {
  if (!globalThis.chrome?.tabs?.query) throw new Error("ACTIVE_TAB_MISSING");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) throw new Error("ACTIVE_TAB_MISSING");
  return tab;
}

async function refreshPageAccessStatus() {
  if (!globalThis.chrome?.tabs?.query) {
    renderPageAccess(createPageAccessView({ ok: false, code: "ACTIVE_TAB_MISSING" }));
    return;
  }

  try {
    const tab = await getActiveTab();
    renderPageAccess(createPageAccessView(getPageEligibility(tab.url)));
  } catch {
    renderPageAccess(createPageAccessView({ ok: false, code: "ACTIVE_TAB_MISSING" }));
  }
}

function clearLatestScan() {
  latestScanResult = null;
  latestScanTab = null;
  latestScanCanInspect = false;
  payloadReady = false;
  payloadPanel.hidden = true;
  compatibilityPanel.hidden = true;
  updateWorkflowButtons();
}

function clearVisualCapture({ announce = false } = {}) {
  const hadCapture = visualCaptureStore.hasCapture()
    || latestVisualSessionId !== null
    || latestVisualTab !== null;
  visualCaptureGeneration += 1;
  visualCaptureStore.clear();
  if (latestVisualSessionId) {
    void sendMessage(MESSAGE_TYPES.VISUAL_SESSION_CANCEL, { sessionId: latestVisualSessionId });
  }
  latestVisualSessionId = null;
  latestVisualTab = null;
  visualCapturePanel.hidden = true;
  if (announce && hadCapture) {
    renderScanResult("Visible-screen capture cancelled and cleared from memory.", "neutral");
  }
  updateWorkflowButtons();
}

function tabStillMatches(expected, actual) {
  return expected?.id === actual?.id
    && expected?.windowId === actual?.windowId
    && expected?.url === actual?.url;
}

async function scanStillMatchesActiveTab() {
  if (!latestScanResult || !latestScanTab) return false;
  const tab = await getActiveTab();
  const matches = tab.id === latestScanTab.id && tab.url === latestScanTab.url;
  if (!matches) clearLatestScan();
  return matches;
}

async function handlePageContextChange() {
  const hadScan = latestScanResult !== null;
  const hadCapture = visualCaptureStore.hasCapture()
    || latestVisualSessionId !== null
    || latestVisualTab !== null
    || captureInProgress;
  if (hadScan) {
    clearLatestScan();
  }
  if (hadCapture) clearVisualCapture();
  if (hadScan || hadCapture) renderSafeFailure("PAGE_NAVIGATED", "", "warning");
  await refreshPageAccessStatus();
}

async function analyzeVisibleScreen() {
  if (
    !globalThis.chrome?.tabs?.query
    || !globalThis.chrome?.tabs?.sendMessage
    || !globalThis.chrome?.tabs?.captureVisibleTab
    || !globalThis.chrome?.scripting?.executeScript
  ) {
    renderSafeFailure(
      "EXTENSION_API_UNAVAILABLE",
      "Open the popup from the installed Chrome extension on a normal webpage.",
    );
    return;
  }

  captureInProgress = true;
  clearVisualCapture();
  const generation = visualCaptureGeneration;
  updateWorkflowButtons();
  renderScanResult("Capturing only the visible area of the selected tab in memory…", "neutral");

  let capture = null;
  try {
    const tab = await getActiveTab();
    latestVisualTab = { id: tab.id, windowId: tab.windowId, url: tab.url };
    await ensureContentScript({ tab });
    if (generation !== visualCaptureGeneration) {
      throw new ScreenCaptureError("SCREEN_CAPTURE_CANCELLED", "Screen analysis was cancelled.");
    }

    const beforeCaptureTab = await getActiveTab();
    if (!tabStillMatches(tab, beforeCaptureTab)) {
      throw new ScreenCaptureError("PAGE_NAVIGATED", "The selected page changed before screen analysis.");
    }
    capture = await captureSelectedTab({ tab });
    if (generation !== visualCaptureGeneration) {
      throw new ScreenCaptureError("SCREEN_CAPTURE_CANCELLED", "Screen analysis was cancelled.");
    }

    const afterCaptureTab = await getActiveTab();
    if (!tabStillMatches(tab, afterCaptureTab)) {
      throw new ScreenCaptureError("PAGE_NAVIGATED", "The selected page changed during screen analysis.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.ANALYZE_SCREEN_REGIONS,
      payload: { screenshotSize: { width: capture.width, height: capture.height } },
    });
    if (!response?.ok) {
      throw new ScreenCaptureError(
        response?.error?.code ?? "SCREEN_REGION_MAPPING_FAILED",
        response?.error?.message ?? "Visible form regions could not be mapped.",
      );
    }

    const afterMappingTab = await getActiveTab();
    if (generation !== visualCaptureGeneration || !tabStillMatches(tab, afterMappingTab)) {
      throw new ScreenCaptureError("PAGE_NAVIGATED", "The selected page changed during screen analysis.");
    }

    const captureMetadata = visualCaptureStore.replace({
      ...capture,
      visualSnapshot: response.data,
    });
    capture.originalDataUrl = null;
    capture = null;
    const originalSession = visualCaptureStore.consume(captureMetadata.captureId);
    if (!originalSession) {
      throw new ScreenCaptureError("SCREEN_CAPTURE_EXPIRED", "The temporary capture expired before redaction.");
    }
    let redaction;
    try {
      redaction = await redactCapture(originalSession);
      const afterRedactionTab = await getActiveTab();
      if (generation !== visualCaptureGeneration || !tabStillMatches(tab, afterRedactionTab)) {
        throw new ScreenCaptureError("PAGE_NAVIGATED", "The selected page changed during local redaction.");
      }
      const handoff = await sendMessage(MESSAGE_TYPES.VISUAL_SESSION_CREATE, {
        session: {
          originalDataUrl: originalSession.originalDataUrl,
          width: originalSession.width,
          height: originalSession.height,
          tabId: tab.id,
          windowId: tab.windowId,
          pageToken: String(tab.url),
          visualSnapshot: response.data,
          redaction,
        },
      });
      if (!handoff?.ok) {
        throw new ScreenCaptureError(
          handoff?.error?.code ?? "VISUAL_SESSION_INVALID",
          handoff?.error?.message ?? "The private inspector handoff failed.",
        );
      }
      latestVisualSessionId = handoff.data.sessionId;
      const handedOffSessionId = latestVisualSessionId;
      const inspectorUrl = chrome.runtime.getURL(`pages/inspector.html#${encodeURIComponent(handedOffSessionId)}`);
      if (!globalThis.chrome?.tabs?.create) {
        throw new ScreenCaptureError("INSPECTOR_UNAVAILABLE", "The Privacy Inspector could not be opened.");
      }
      latestVisualSessionId = null;
      try {
        await chrome.tabs.create({ url: inspectorUrl, active: true });
      } catch {
        await sendMessage(MESSAGE_TYPES.VISUAL_SESSION_CANCEL, { sessionId: handedOffSessionId });
        throw new ScreenCaptureError("INSPECTOR_UNAVAILABLE", "The Privacy Inspector could not be opened.");
      }
      const regionCount = response.data?.regions?.length ?? 0;
      visualCaptureSummary.textContent = `${redaction.width}×${redaction.height} sanitized PNG · ${redaction.coverage.coveredCount}/${redaction.coverage.requiredCount} sensitive regions covered · ${regionCount} visible field ${regionCount === 1 ? "region" : "regions"}.`;
      visualCapturePanel.hidden = false;
      renderScanResult("Privacy Inspector opened with a one-time memory-only visual session.", "success");
    } finally {
      originalSession.originalDataUrl = null;
      redaction = null;
    }
  } catch (error) {
    if (capture) capture.originalDataUrl = null;
    clearVisualCapture();
    renderSafeFailure(error?.code, error?.message ?? "Visible-screen analysis was stopped safely.");
  } finally {
    captureInProgress = false;
    updateWorkflowButtons();
  }
}

function renderAudit(entries) {
  auditList.replaceChildren();
  const recentEntries = entries.slice(-30).reverse();
  auditSummary.textContent = entries.length === 0
    ? "No events recorded."
    : `${entries.length} metadata-only ${entries.length === 1 ? "event" : "events"} in this session.`;

  for (const entry of recentEntries) {
    const item = document.createElement("li");
    item.dataset.status = entry.status;
    const category = entry.profileKey ?? "no private category";
    item.textContent = `${entry.fieldId} · ${entry.action} · ${category} · ${entry.status} · ${entry.code}`;
    auditList.append(item);
  }
}

async function refreshAudit() {
  const response = await sendMessage(MESSAGE_TYPES.GET_AUDIT_LOG);
  if (!response?.ok) {
    auditSummary.textContent = response?.error?.message ?? "Audit history unavailable.";
    auditList.replaceChildren();
    return;
  }
  renderAudit(response.data.entries);
}

async function toggleAudit() {
  auditPanel.hidden = !auditPanel.hidden;
  if (!auditPanel.hidden) await refreshAudit();
}

async function scanActiveTab() {
  if (
    !globalThis.chrome?.tabs?.query
    || !globalThis.chrome?.tabs?.sendMessage
    || !globalThis.chrome?.scripting?.executeScript
  ) {
    renderSafeFailure(
      "EXTENSION_API_UNAVAILABLE",
      "Open the popup from the installed Chrome extension on a normal webpage.",
    );
    return;
  }

  scanInProgress = true;
  clearLatestScan();
  updateWorkflowButtons();
  renderScanResult("Scanning safe field metadata…", "neutral");

  try {
    const tab = await getActiveTab();
    await ensureContentScript({ tab });

    const response = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SCAN_FORM });
    if (!response?.ok) {
      if (response?.error?.code === "NO_SUPPORTED_FIELDS") {
        renderCompatibility({ fieldCount: 0 });
        renderSafeFailure(response.error.code, response.error.message, "warning");
      } else {
        renderSafeFailure(response?.error?.code, response?.error?.message ?? "This page could not be scanned.");
      }
      return;
    }

    const result = response.data;
    latestScanResult = result;
    latestScanTab = { id: tab.id, url: tab.url };
    payloadReady = false;
    const compatibility = renderCompatibility(result);
    renderScanResult(
      compatibility.canInspect
        ? "Scan complete. Inspect the exact privacy-checked payload before planning and filling."
        : "Scan complete, but no private categories can be filled automatically. Complete these fields manually.",
      compatibility.canInspect ? "success" : "warning",
    );
  } catch (error) {
    const view = renderSafeFailure(
      error?.code,
      error?.message ?? "PrivacyFill could not access this selected webpage.",
    );
    if (view.title === "Unsupported browser page") {
      renderPageAccess(createPageAccessView({ ok: false, code: "PAGE_NOT_SUPPORTED" }));
    }
  } finally {
    scanInProgress = false;
    updateWorkflowButtons();
  }
}

async function planAndFill() {
  if (!latestScanResult) {
    renderScanResult("Scan the current form before requesting a plan.", "error");
    return;
  }
  if (!payloadReady) {
    renderScanResult("Inspect the exact checked JSON and confirm zero profile matches before planning.", "warning");
    return;
  }
  try {
    if (!await scanStillMatchesActiveTab()) {
      renderSafeFailure("PAGE_NAVIGATED");
      return;
    }
  } catch {
    clearLatestScan();
    renderSafeFailure("PAGE_NAVIGATED");
    return;
  }

  planFillButton.disabled = true;
  renderScanResult("Sending only the privacy-checked field map to the local planner…", "neutral");
  const planning = await sendMessage(MESSAGE_TYPES.PLAN_REQUEST, {
    scanResult: latestScanResult,
    task: "Fill this application form using my saved profile",
  });

  if (!planning?.ok) {
    backendStatus.textContent = "Backend: unavailable";
    renderSafeFailure(planning?.error?.code, planning?.error?.message ?? "The local planner is unavailable.");
    updateWorkflowButtons();
    return;
  }

  try {
    if (!await scanStillMatchesActiveTab()) {
      renderSafeFailure("PAGE_NAVIGATED");
      return;
    }
  } catch {
    clearLatestScan();
    renderSafeFailure("PAGE_NAVIGATED");
    return;
  }

  const { request, plan, privacyCheck } = planning.data;
  backendStatus.textContent = `Backend: ${plan.planner} planner`;
  const fieldsById = new Map(request.fields.map((field) => [field.fieldId, field]));
  const criticalCount = plan.actions.filter((action) => (
    action.action === "fill_private" && fieldsById.get(action.target)?.risk === "critical"
  )).length;

  let criticalApproved = true;
  if (criticalCount > 0) {
    criticalApproved = window.confirm(
      `This locally validated plan will fill ${criticalCount} critical identifier ${criticalCount === 1 ? "field" : "fields"}. The values remain local and will not be sent to the planner. Continue?`,
    );
  }
  if (!criticalApproved) {
    renderScanResult("Fill cancelled before any critical value was resolved.", "neutral");
    updateWorkflowButtons();
    return;
  }

  renderScanResult(`Plan validated by the backend · ${privacyCheck.matchCount} profile matches outbound · checking the live form…`, "neutral");
  const execution = await sendMessage(MESSAGE_TYPES.VALIDATE_AND_EXECUTE, {
    request,
    plan,
    criticalApproved,
  });

  if (!execution?.ok) {
    if (["ACTION_PLAN_REJECTED", "PLAN_CORRELATION_FAILED"].includes(execution?.error?.code)) {
      clearLatestScan();
    }
    renderSafeFailure(execution?.error?.code, execution?.error?.message ?? "The plan was blocked before execution.");
    updateWorkflowButtons();
    return;
  }

  renderScanResult(
    `Filled ${execution.data.filledCount} fields locally · ${execution.data.planner} planner · submission confirmation armed for ${execution.data.guardedForm}.`,
    "success",
  );
  if (!auditPanel.hidden) await refreshAudit();
  updateWorkflowButtons();
}

async function inspectSafePayload() {
  if (!latestScanResult) {
    renderScanResult("Scan the current form before building a safe payload.", "error");
    return;
  }
  try {
    if (!await scanStillMatchesActiveTab()) {
      renderSafeFailure("PAGE_NAVIGATED");
      return;
    }
  } catch {
    clearLatestScan();
    renderSafeFailure("PAGE_NAVIGATED");
    return;
  }

  inspectPayloadButton.disabled = true;
  payloadPanel.hidden = true;
  const response = await sendMessage(MESSAGE_TYPES.GET_SANITIZED_PAYLOAD, {
    scanResult: latestScanResult,
    task: "Fill this application form using my saved profile",
  });

  if (!response?.ok) {
    payloadReady = false;
    renderSafeFailure(response?.error?.code, response?.error?.message ?? "The safe payload could not be created.");
    updateWorkflowButtons();
    return;
  }

  try {
    if (!await scanStillMatchesActiveTab()) {
      renderSafeFailure("PAGE_NAVIGATED");
      return;
    }
  } catch {
    clearLatestScan();
    renderSafeFailure("PAGE_NAVIGATED");
    return;
  }

  payloadCheck.textContent = `Privacy check passed · ${response.data.privacyCheck.matchCount} raw profile matches · ${response.data.privacyCheck.protectedCategoryCount} protected categories`;
  payloadJson.textContent = JSON.stringify(response.data.request, null, 2);
  payloadPanel.hidden = false;
  payloadReady = response.data.privacyCheck.matchCount === 0;
  renderScanResult(
    payloadReady
      ? "Privacy proof ready: exact minimized JSON displayed with zero raw profile matches. Planning is now available."
      : "Planning remains blocked because the privacy check did not return zero matches.",
    payloadReady ? "success" : "error",
  );
  updateWorkflowButtons();
}

openProfileButton.addEventListener("click", () => {
  if (globalThis.chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
});

clearProfileButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Delete all profile values stored in this browser session?");
  if (!confirmed) return;

  clearProfileButton.disabled = true;
  const response = await sendMessage(MESSAGE_TYPES.PROFILE_CLEAR);
  if (response?.ok) renderProfileStatus(response.data);
  else await refreshProfileStatus();
});

clearAuditButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Clear the metadata-only audit history for this browser session?");
  if (!confirmed) return;
  const response = await sendMessage(MESSAGE_TYPES.CLEAR_AUDIT_LOG);
  if (response?.ok) renderAudit([]);
  else auditSummary.textContent = response?.error?.message ?? "Audit history could not be cleared.";
});

scanButton.addEventListener("click", scanActiveTab);
analyzeScreenButton.addEventListener("click", analyzeVisibleScreen);
clearVisualCaptureButton.addEventListener("click", () => clearVisualCapture({ announce: true }));
inspectPayloadButton.addEventListener("click", inspectSafePayload);
planFillButton.addEventListener("click", planAndFill);
viewAuditButton.addEventListener("click", toggleAudit);

if (globalThis.chrome?.tabs?.onUpdated?.addListener) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const trackedTabChanged = (latestScanTab?.id === tabId || latestVisualTab?.id === tabId)
      && (typeof changeInfo?.url === "string" || changeInfo?.status === "loading");
    if (trackedTabChanged) void handlePageContextChange();
  });
}

if (globalThis.chrome?.tabs?.onActivated?.addListener) {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    if (
      (latestScanTab && latestScanTab.id !== tabId)
      || (latestVisualTab && latestVisualTab.id !== tabId)
    ) void handlePageContextChange();
    else void refreshPageAccessStatus();
  });
}

globalThis.addEventListener("pagehide", () => {
  visualCaptureGeneration += 1;
  visualCaptureStore.clear();
  if (latestVisualSessionId) {
    void sendMessage(MESSAGE_TYPES.VISUAL_SESSION_CANCEL, { sessionId: latestVisualSessionId });
  }
}, { once: true });

await Promise.all([
  refreshProfileStatus(),
  refreshPageAccessStatus(),
]);
