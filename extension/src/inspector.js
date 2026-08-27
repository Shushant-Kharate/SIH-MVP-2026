import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { PRIVACY_LEVELS } from "../../shared/privacy-levels.js";
import { createVisualInspectorPreview } from "../../shared/visual-inspector-contract.js";
import { redactCapture } from "./privacy/visual-redactor.js";

const originalPreview = document.querySelector("#original-preview");
const sanitizedPreview = document.querySelector("#sanitized-preview");
const regionOverlay = document.querySelector("#region-overlay");
const regionList = document.querySelector("#region-list");
const regionCount = document.querySelector("#region-count");
const maskCount = document.querySelector("#mask-count");
const coverageGate = document.querySelector("#coverage-gate");
const coverageStatus = document.querySelector("#coverage-status");
const profileGate = document.querySelector("#profile-gate");
const profileStatus = document.querySelector("#profile-status");
const safePreviewJson = document.querySelector("#safe-preview-json");
const manualMaskButton = document.querySelector("#manual-mask-mode");
const approveButton = document.querySelector("#approve-review");
const cancelButton = document.querySelector("#cancel-review");
const expiryTimer = document.querySelector("#expiry-timer");
const notice = document.querySelector("#notice");

let session = null;
let redaction = null;
let safePreview = null;
let profileCheckPassed = false;
let manualMaskMode = false;
let manualRegions = [];
let regionLevels = new Map();
let expiryInterval = null;
let disposed = false;
let approved = false;
let redrawGeneration = 0;
let draft = null;

function setNotice(text, tone = "neutral") {
  notice.textContent = text;
  notice.dataset.tone = tone;
}

async function sendMessage(type, payload) {
  try {
    return await chrome.runtime.sendMessage({ type, payload });
  } catch {
    return { ok: false, error: { code: "EXTENSION_RUNTIME_UNAVAILABLE" } };
  }
}

function clearPixels({ keepSanitized = false } = {}) {
  originalPreview.removeAttribute("src");
  if (!keepSanitized) sanitizedPreview.removeAttribute("src");
  if (session) session.originalDataUrl = null;
  if (!keepSanitized && redaction) redaction = null;
}

function disableReview(reason) {
  disposed = true;
  approveButton.disabled = true;
  manualMaskButton.disabled = true;
  for (const control of regionList.querySelectorAll("select, button")) control.disabled = true;
  if (expiryInterval !== null) clearInterval(expiryInterval);
  expiryInterval = null;
  clearPixels();
  setNotice(reason, "error");
}

function privacyLabel(level) {
  return {
    [PRIVACY_LEVELS.VISIBLE]: "Visible / safe",
    [PRIVACY_LEVELS.PLACEHOLDER]: "Private — mask",
    [PRIVACY_LEVELS.LOCAL_APPROVAL]: "Critical — approval",
    [PRIVACY_LEVELS.BLOCKED]: "Blocked — opaque",
  }[level] ?? level;
}

function currentRegions() {
  if (!session) return [];
  const automatic = session.visualSnapshot.regions.map((region) => ({
    ...region,
    privacyLevel: regionLevels.get(region.regionId) ?? region.privacyLevel,
  }));
  return [...automatic, ...manualRegions];
}

function allowedLevels(region) {
  if (region.manual === true || region.privacyLevel === PRIVACY_LEVELS.BLOCKED) {
    return [PRIVACY_LEVELS.BLOCKED];
  }
  if (region.privacyLevel === PRIVACY_LEVELS.LOCAL_APPROVAL) {
    return [PRIVACY_LEVELS.LOCAL_APPROVAL, PRIVACY_LEVELS.BLOCKED];
  }
  if (region.privacyLevel === PRIVACY_LEVELS.PLACEHOLDER) {
    return [PRIVACY_LEVELS.PLACEHOLDER, PRIVACY_LEVELS.LOCAL_APPROVAL, PRIVACY_LEVELS.BLOCKED];
  }
  return Object.values(PRIVACY_LEVELS);
}

function renderOverlay() {
  regionOverlay.replaceChildren();
  if (!session) return;
  for (const region of currentRegions()) {
    const bounds = region.pixelBounds;
    const box = document.createElement("div");
    box.className = "region-box";
    box.dataset.level = region.privacyLevel;
    if (region.manual) box.dataset.manual = "true";
    box.style.left = `${(bounds.x / session.width) * 100}%`;
    box.style.top = `${(bounds.y / session.height) * 100}%`;
    box.style.width = `${(bounds.width / session.width) * 100}%`;
    box.style.height = `${(bounds.height / session.height) * 100}%`;
    regionOverlay.append(box);
  }
}

function renderRegionList() {
  regionList.replaceChildren();
  const regions = currentRegions();
  regionCount.textContent = `${regions.length} ${regions.length === 1 ? "region" : "regions"}`;
  for (const region of regions) {
    const row = document.createElement("div");
    row.className = "region-row";
    const description = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = region.manual
      ? "Manual privacy mask"
      : (region.semanticType ?? region.role ?? "Detected region");
    const detail = document.createElement("small");
    detail.textContent = `${region.regionId} · ${region.pixelBounds.width}×${region.pixelBounds.height}px`;
    description.append(name, detail);

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Privacy level for ${region.regionId}`);
    for (const level of allowedLevels(region)) {
      const option = document.createElement("option");
      option.value = level;
      option.textContent = privacyLabel(level);
      option.selected = level === region.privacyLevel;
      select.append(option);
    }
    select.disabled = disposed || approved || region.manual === true;
    select.addEventListener("change", () => {
      regionLevels.set(region.regionId, select.value);
      void rerunRedaction("Classification updated; redaction and both gates were recalculated.");
    });
    row.append(description, select);

    if (region.manual) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.disabled = disposed || approved;
      remove.addEventListener("click", () => {
        manualRegions = manualRegions.filter((item) => item.regionId !== region.regionId);
        void rerunRedaction("Manual mask removed; coverage was recalculated.");
      });
      row.append(remove);
    }
    regionList.append(row);
  }
}

function updateApprovalState() {
  const coveragePassed = redaction?.coverage?.ok === true;
  coverageGate.dataset.state = coveragePassed ? "safe" : "unsafe";
  coverageStatus.textContent = coveragePassed
    ? `${redaction.coverage.coveredCount}/${redaction.coverage.requiredCount} sensitive regions covered`
    : "Coverage incomplete — approval blocked";
  maskCount.textContent = `${redaction?.maskCount ?? 0} ${(redaction?.maskCount ?? 0) === 1 ? "mask" : "masks"}`;
  profileGate.dataset.state = profileCheckPassed ? "safe" : "unsafe";
  approveButton.disabled = disposed || approved || !coveragePassed || !profileCheckPassed;
}

async function refreshSafePreview(generation = redrawGeneration) {
  safePreview = createVisualInspectorPreview({
    visualSnapshot: session.visualSnapshot,
    redaction,
    regions: currentRegions(),
  });
  safePreviewJson.textContent = JSON.stringify(safePreview, null, 2);
  profileCheckPassed = false;
  profileGate.dataset.state = "pending";
  profileStatus.textContent = "Checking locally…";
  updateApprovalState();
  const response = await sendMessage(MESSAGE_TYPES.VISUAL_PRIVACY_CHECK, { safePreview });
  if (disposed || approved || generation !== redrawGeneration) return;
  profileCheckPassed = response?.ok === true && response.data?.privacyCheck?.matchCount === 0;
  profileStatus.textContent = profileCheckPassed
    ? `Passed · 0 profile matches · ${response.data.privacyCheck.protectedCategoryCount} protected categories`
    : "Failed or unavailable — approval blocked";
  updateApprovalState();
}

async function rerunRedaction(message) {
  if (disposed || approved || !session?.originalDataUrl) return;
  const generation = ++redrawGeneration;
  approveButton.disabled = true;
  profileCheckPassed = false;
  setNotice("Rebuilding the sanitized image locally…", "neutral");
  try {
    const visualSnapshot = {
      ...session.visualSnapshot,
      regions: session.visualSnapshot.regions.map((region) => ({
        ...region,
        privacyLevel: regionLevels.get(region.regionId) ?? region.privacyLevel,
      })),
    };
    const result = await redactCapture({
      originalDataUrl: session.originalDataUrl,
      width: session.width,
      height: session.height,
      visualSnapshot,
    }, { additionalRegions: manualRegions });
    if (disposed || approved || generation !== redrawGeneration) return;
    redaction = result;
    sanitizedPreview.src = redaction.sanitizedDataUrl;
    renderOverlay();
    renderRegionList();
    await refreshSafePreview(generation);
    if (!disposed && !approved) setNotice(message, "success");
  } catch {
    if (generation !== redrawGeneration) return;
    redaction = null;
    sanitizedPreview.removeAttribute("src");
    profileCheckPassed = false;
    updateApprovalState();
    setNotice("Redaction or coverage verification failed. The candidate was discarded and approval is blocked.", "error");
  }
}

function pixelPoint(event) {
  const rect = regionOverlay.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(session.width, Math.round(((event.clientX - rect.left) / rect.width) * session.width))),
    y: Math.max(0, Math.min(session.height, Math.round(((event.clientY - rect.top) / rect.height) * session.height))),
  };
}

manualMaskButton.addEventListener("click", () => {
  if (disposed || approved) return;
  manualMaskMode = !manualMaskMode;
  manualMaskButton.dataset.active = String(manualMaskMode);
  manualMaskButton.textContent = manualMaskMode ? "Drawing enabled" : "Draw manual mask";
  regionOverlay.dataset.drawing = String(manualMaskMode);
});

regionOverlay.addEventListener("pointerdown", (event) => {
  if (!manualMaskMode || disposed || approved || !session) return;
  event.preventDefault();
  regionOverlay.setPointerCapture(event.pointerId);
  draft = { start: pixelPoint(event), box: document.createElement("div") };
  draft.box.className = "region-box";
  draft.box.dataset.manual = "true";
  regionOverlay.append(draft.box);
});

regionOverlay.addEventListener("pointermove", (event) => {
  if (!draft || !session) return;
  const end = pixelPoint(event);
  const bounds = {
    x: Math.min(draft.start.x, end.x),
    y: Math.min(draft.start.y, end.y),
    width: Math.abs(end.x - draft.start.x),
    height: Math.abs(end.y - draft.start.y),
  };
  draft.bounds = bounds;
  draft.box.style.left = `${(bounds.x / session.width) * 100}%`;
  draft.box.style.top = `${(bounds.y / session.height) * 100}%`;
  draft.box.style.width = `${(bounds.width / session.width) * 100}%`;
  draft.box.style.height = `${(bounds.height / session.height) * 100}%`;
});

regionOverlay.addEventListener("pointerup", (event) => {
  if (!draft) return;
  regionOverlay.releasePointerCapture(event.pointerId);
  const completed = draft;
  draft = null;
  completed.box.remove();
  if (!completed.bounds || completed.bounds.width < 4 || completed.bounds.height < 4) return;
  const suffix = crypto.randomUUID().replaceAll("-", "").toUpperCase();
  manualRegions.push({
    regionId: `MANUAL_${suffix}`,
    role: "manual-mask",
    semanticType: null,
    privacyLevel: PRIVACY_LEVELS.BLOCKED,
    risk: "critical",
    kind: "manual",
    manual: true,
    pixelBounds: completed.bounds,
  });
  void rerunRedaction("Manual mask added; coverage verification passed for the new candidate.");
});

regionOverlay.addEventListener("pointercancel", () => {
  draft?.box?.remove();
  draft = null;
});

approveButton.addEventListener("click", () => {
  if (approveButton.disabled || !safePreview) return;
  approved = true;
  redrawGeneration += 1;
  originalPreview.removeAttribute("src");
  session.originalDataUrl = null;
  manualMaskButton.disabled = true;
  approveButton.disabled = true;
  cancelButton.textContent = "Close inspector";
  if (expiryInterval !== null) clearInterval(expiryInterval);
  expiryInterval = null;
  for (const control of regionList.querySelectorAll("select, button")) control.disabled = true;
  setNotice("Sanitized context approved locally. Original pixels were cleared. Network use remains disabled until the versioned visual contract is implemented.", "success");
});

cancelButton.addEventListener("click", () => {
  if (!approved) disableReview("Review cancelled. Original and sanitized pixels were cleared; nothing was sent.");
  else clearPixels();
  window.close();
});

function startExpiry(expiresAt) {
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    disableReview("Visual session expired. Original and sanitized pixels were cleared.");
    return;
  }
  const update = () => {
    const remainingMs = Math.max(0, expiresAt - Date.now());
    expiryTimer.textContent = `Expires in ${Math.ceil(remainingMs / 1000)}s`;
    if (remainingMs <= 0) disableReview("Visual session expired. Original and sanitized pixels were cleared.");
  };
  update();
  expiryInterval = setInterval(update, 250);
}

async function initialize() {
  const sessionId = decodeURIComponent(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);
  if (!/^VISUAL_[A-Za-z0-9-]{8,160}$/.test(sessionId)) {
    disableReview("This inspector link is invalid or incomplete.");
    return;
  }
  const response = await sendMessage(MESSAGE_TYPES.VISUAL_SESSION_TAKE, { sessionId });
  if (!response?.ok) {
    disableReview("The one-time visual session is unavailable or expired. Analyze the selected tab again.");
    return;
  }
  session = response.data;
  if (!session.originalDataUrl || !session.redaction?.sanitizedDataUrl) {
    disableReview("The visual session failed local validation.");
    return;
  }
  redaction = session.redaction;
  for (const region of session.visualSnapshot.regions) {
    regionLevels.set(region.regionId, region.privacyLevel);
  }
  originalPreview.src = session.originalDataUrl;
  sanitizedPreview.src = redaction.sanitizedDataUrl;
  renderOverlay();
  renderRegionList();
  startExpiry(Number(session.expiresAt));
  await refreshSafePreview();
  if (!disposed) setNotice("One-time handoff complete. Review classifications, add masks if needed, then approve or cancel.", "success");
}

if (globalThis.chrome?.tabs?.onUpdated?.addListener) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!disposed && session?.tabId === tabId
      && (changeInfo?.status === "loading" || typeof changeInfo?.url === "string")) {
      disableReview("The analyzed page changed. This visual session was invalidated and all pixels were cleared.");
    }
  });
}

if (globalThis.chrome?.tabs?.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (!disposed && session?.tabId === tabId) {
      disableReview("The analyzed tab was closed. This visual session was cleared.");
    }
  });
}

globalThis.addEventListener("pagehide", () => {
  redrawGeneration += 1;
  clearPixels();
  if (expiryInterval !== null) clearInterval(expiryInterval);
}, { once: true });

await initialize();
