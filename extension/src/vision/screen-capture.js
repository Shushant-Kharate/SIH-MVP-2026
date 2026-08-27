import { getPageEligibility } from "../core/page-eligibility.js";

const MAX_CAPTURE_DATA_URL_LENGTH = 48 * 1024 * 1024;

export class ScreenCaptureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ScreenCaptureError";
    this.code = code;
  }
}

async function decodeWithImageBitmap(dataUrl) {
  if (!globalThis.fetch || !globalThis.createImageBitmap) {
    throw new ScreenCaptureError("SCREEN_DECODER_UNAVAILABLE", "Chrome could not decode the visible-tab capture.");
  }
  const response = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close?.();
  }
}

function validateDimensions(dimensions) {
  const width = Number(dimensions?.width);
  const height = Number(dimensions?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 32768 || height > 32768) {
    throw new ScreenCaptureError("SCREEN_SIZE_INVALID", "Chrome returned invalid capture dimensions.");
  }
  return Object.freeze({ width, height });
}

export async function captureSelectedTab({
  tab,
  tabsApi = globalThis.chrome?.tabs,
  decodeImageDimensions = decodeWithImageBitmap,
} = {}) {
  const eligibility = getPageEligibility(tab?.url);
  if (!eligibility.ok) throw new ScreenCaptureError(eligibility.code, eligibility.message);
  if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) {
    throw new ScreenCaptureError("ACTIVE_TAB_MISSING", "No selected browser tab is available for capture.");
  }
  if (!tabsApi?.captureVisibleTab) {
    throw new ScreenCaptureError("SCREEN_CAPTURE_UNAVAILABLE", "Chrome did not provide visible-tab capture access.");
  }

  let originalDataUrl;
  try {
    originalDataUrl = await tabsApi.captureVisibleTab(tab.windowId, { format: "png" });
  } catch {
    throw new ScreenCaptureError(
      "SCREEN_CAPTURE_DENIED",
      "Chrome could not capture this selected tab. Reload the page and try again.",
    );
  }

  if (typeof originalDataUrl !== "string"
    || !originalDataUrl.startsWith("data:image/png;base64,")
    || originalDataUrl.length > MAX_CAPTURE_DATA_URL_LENGTH) {
    originalDataUrl = null;
    throw new ScreenCaptureError("SCREEN_CAPTURE_INVALID", "Chrome returned an invalid visible-tab capture.");
  }

  let dimensions;
  try {
    dimensions = validateDimensions(await decodeImageDimensions(originalDataUrl));
  } catch (error) {
    originalDataUrl = null;
    if (error instanceof ScreenCaptureError) throw error;
    throw new ScreenCaptureError("SCREEN_DECODE_FAILED", "The visible-tab capture could not be decoded locally.");
  }

  return {
    originalDataUrl,
    ...dimensions,
    tabId: tab.id,
    windowId: tab.windowId,
    pageToken: String(tab.url),
  };
}
