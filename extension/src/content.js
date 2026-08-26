import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { createSafeScanResult, scanDocument } from "./core/field-scanner.js";

let currentScan = null;

function success(data) {
  return { ok: true, data, error: null };
}

function failure(code, message) {
  return {
    ok: false,
    data: null,
    error: { code, message },
  };
}

async function handleContentMessage(message) {
  if (message?.type !== MESSAGE_TYPES.SCAN_FORM) {
    return failure("UNSUPPORTED_MESSAGE", "This page action is not available yet.");
  }

  try {
    currentScan = scanDocument(document);
    if (currentScan.fields.length === 0) {
      return failure("NO_SUPPORTED_FIELDS", "No supported application fields were found on this page.");
    }
    return success(createSafeScanResult(currentScan));
  } catch {
    currentScan = null;
    return failure("SCAN_FAILED", "The form could not be scanned safely.");
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleContentMessage(message).then(sendResponse);
  return true;
});
