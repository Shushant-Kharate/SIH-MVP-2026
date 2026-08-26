import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { ensureContentScript } from "./core/content-injector.js";

const title = document.querySelector("#profile-status-title");
const copy = document.querySelector("#profile-status-copy");
const dot = document.querySelector("#profile-status-dot");
const count = document.querySelector("#available-count");
const openProfileButton = document.querySelector("#open-profile");
const clearProfileButton = document.querySelector("#clear-profile");
const scanButton = document.querySelector("#scan-form");
const scanResult = document.querySelector("#scan-result");
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

let latestScanResult = null;
let latestScanTab = null;
let profileReady = false;

async function sendMessage(type, payload = undefined) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return {
      ok: false,
      data: null,
      error: { code: "EXTENSION_RUNTIME_UNAVAILABLE", message: "Open this page from the installed extension." },
    };
  }
  return chrome.runtime.sendMessage({ type, ...(payload ? { payload } : {}) });
}

function renderProfileStatus(status) {
  const available = status?.availableProfileKeys?.length ?? 0;
  const hasProfile = status?.hasProfile === true;
  profileReady = hasProfile;

  title.textContent = hasProfile ? "Local profile ready" : "Local profile required";
  copy.textContent = hasProfile
    ? `${available} private categories are available for local resolution.`
    : "Create a session profile before scanning a form.";
  dot.dataset.state = hasProfile ? "ready" : "missing";
  count.textContent = `${available} profile ${available === 1 ? "category" : "categories"} available`;
  openProfileButton.textContent = hasProfile ? "Replace profile" : "Set up profile";
  clearProfileButton.disabled = !hasProfile;
  inspectPayloadButton.disabled = !(profileReady && latestScanResult);
  planFillButton.disabled = !(profileReady && latestScanResult);
}

async function refreshProfileStatus() {
  const response = await sendMessage(MESSAGE_TYPES.PROFILE_GET_STATUS);
  if (!response?.ok) {
    title.textContent = "Profile status unavailable";
    copy.textContent = response?.error?.message ?? "Reload the extension and try again.";
    dot.dataset.state = "missing";
    clearProfileButton.disabled = true;
    profileReady = false;
    inspectPayloadButton.disabled = true;
    planFillButton.disabled = true;
    return;
  }
  renderProfileStatus(response.data);
}

function renderScanResult(text, tone) {
  scanResult.hidden = false;
  scanResult.dataset.tone = tone;
  scanResult.textContent = text;
}

async function getActiveTab() {
  if (!globalThis.chrome?.tabs?.query) throw new Error("ACTIVE_TAB_MISSING");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) throw new Error("ACTIVE_TAB_MISSING");
  return tab;
}

function clearLatestScan() {
  latestScanResult = null;
  latestScanTab = null;
  inspectPayloadButton.disabled = true;
  planFillButton.disabled = true;
  payloadPanel.hidden = true;
}

async function scanStillMatchesActiveTab() {
  if (!latestScanResult || !latestScanTab) return false;
  const tab = await getActiveTab();
  const matches = tab.id === latestScanTab.id && tab.url === latestScanTab.url;
  if (!matches) clearLatestScan();
  return matches;
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
    renderScanResult("Open the popup from the installed Chrome extension on a webpage.", "error");
    return;
  }

  scanButton.disabled = true;
  clearLatestScan();
  renderScanResult("Scanning safe field metadata…", "neutral");

  try {
    const tab = await getActiveTab();
    await ensureContentScript({ tab });

    const response = await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.SCAN_FORM });
    if (!response?.ok) {
      renderScanResult(response?.error?.message ?? "This page could not be scanned.", "error");
      return;
    }

    const result = response.data;
    latestScanResult = result;
    latestScanTab = { id: tab.id, url: tab.url };
    inspectPayloadButton.disabled = !profileReady;
    planFillButton.disabled = !profileReady;
    renderScanResult(
      `Detected ${result.fieldCount} fields · ${result.privateFieldCount} private · ${result.blockedFieldCount} blocked · ${result.unsupportedControlCount ?? 0} unsupported · ${result.adapterId ?? "generic"} · ${result.snapshotId}`,
      "success",
    );
  } catch (error) {
    renderScanResult(
      error?.message ?? "PrivacyFill could not access this selected webpage. Reload it and try again.",
      "error",
    );
  } finally {
    scanButton.disabled = false;
  }
}

async function planAndFill() {
  if (!latestScanResult) {
    renderScanResult("Scan the current form before requesting a plan.", "error");
    return;
  }
  try {
    if (!await scanStillMatchesActiveTab()) {
      renderScanResult("The selected tab changed after scanning. Scan the current page again.", "error");
      return;
    }
  } catch {
    clearLatestScan();
    renderScanResult("The selected tab is no longer available. Open the form and scan again.", "error");
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
    renderScanResult(planning?.error?.message ?? "The local planner is unavailable.", "error");
    planFillButton.disabled = !profileReady;
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
    planFillButton.disabled = false;
    return;
  }

  renderScanResult(`Plan validated by the backend · ${privacyCheck.matchCount} profile matches outbound · checking the live form…`, "neutral");
  const execution = await sendMessage(MESSAGE_TYPES.VALIDATE_AND_EXECUTE, {
    request,
    plan,
    criticalApproved,
  });

  if (!execution?.ok) {
    renderScanResult(execution?.error?.message ?? "The plan was blocked before execution.", "error");
    planFillButton.disabled = false;
    return;
  }

  renderScanResult(
    `Filled ${execution.data.filledCount} fields locally · ${execution.data.planner} planner · submission confirmation armed for ${execution.data.guardedForm}.`,
    "success",
  );
  if (!auditPanel.hidden) await refreshAudit();
  planFillButton.disabled = false;
}

async function inspectSafePayload() {
  if (!latestScanResult) {
    renderScanResult("Scan the current form before building a safe payload.", "error");
    return;
  }
  try {
    if (!await scanStillMatchesActiveTab()) {
      renderScanResult("The selected tab changed after scanning. Scan the current page again.", "error");
      return;
    }
  } catch {
    clearLatestScan();
    renderScanResult("The selected tab is no longer available. Open the form and scan again.", "error");
    return;
  }

  inspectPayloadButton.disabled = true;
  payloadPanel.hidden = true;
  const response = await sendMessage(MESSAGE_TYPES.GET_SANITIZED_PAYLOAD, {
    scanResult: latestScanResult,
    task: "Fill this application form using my saved profile",
  });

  if (!response?.ok) {
    renderScanResult(response?.error?.message ?? "The safe payload could not be created.", "error");
    inspectPayloadButton.disabled = !profileReady;
    return;
  }

  payloadCheck.textContent = `Privacy check passed · ${response.data.privacyCheck.matchCount} raw profile matches · ${response.data.privacyCheck.protectedCategoryCount} protected categories`;
  payloadJson.textContent = JSON.stringify(response.data.request, null, 2);
  payloadPanel.hidden = false;
  inspectPayloadButton.disabled = false;
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
inspectPayloadButton.addEventListener("click", inspectSafePayload);
planFillButton.addEventListener("click", planAndFill);
viewAuditButton.addEventListener("click", toggleAudit);

await refreshProfileStatus();
