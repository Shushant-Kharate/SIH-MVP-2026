import { MESSAGE_TYPES } from "../../../shared/message-types.js";
import { getPageEligibility } from "./page-eligibility.js";

export class ContentInjectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ContentInjectionError";
    this.code = code;
  }
}

function isReadyResponse(response) {
  return response?.ok === true && response?.data?.ready === true;
}

async function pingContentScript(tabId, tabsApi) {
  try {
    const response = await tabsApi.sendMessage(tabId, {
      type: MESSAGE_TYPES.PING_CONTENT_SCRIPT,
    });
    return isReadyResponse(response);
  } catch {
    return false;
  }
}

export async function ensureContentScript({
  tab,
  tabsApi = globalThis.chrome?.tabs,
  scriptingApi = globalThis.chrome?.scripting,
} = {}) {
  const eligibility = getPageEligibility(tab?.url);
  if (!eligibility.ok) {
    throw new ContentInjectionError(eligibility.code, eligibility.message);
  }
  if (!Number.isInteger(tab?.id) || tab.id < 0) {
    throw new ContentInjectionError("ACTIVE_TAB_MISSING", "No active browser tab is available.");
  }
  if (!tabsApi?.sendMessage || !scriptingApi?.executeScript) {
    throw new ContentInjectionError(
      "EXTENSION_API_UNAVAILABLE",
      "Chrome did not provide the temporary current-tab access APIs.",
    );
  }

  if (await pingContentScript(tab.id, tabsApi)) {
    return Object.freeze({ ready: true, injected: false });
  }

  try {
    await scriptingApi.executeScript({
      target: { tabId: tab.id, allFrames: false },
      files: ["content.js"],
    });
  } catch {
    throw new ContentInjectionError(
      "SCANNER_INJECTION_FAILED",
      "Chrome could not start PrivacyFill on this page. Reload the page and try again.",
    );
  }

  if (!await pingContentScript(tab.id, tabsApi)) {
    throw new ContentInjectionError(
      "CONTENT_SCRIPT_UNAVAILABLE",
      "The PrivacyFill scanner did not become ready on this page.",
    );
  }

  return Object.freeze({ ready: true, injected: true });
}
