import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { ActionValidationError, validateActionPlan } from "./core/action-validator.js";
import { executeValidatedActions } from "./core/action-executor.js";
import { createSafeScanResult, scanDocument } from "./core/field-scanner.js";

let currentScan = null;

function success(data) {
  return { ok: true, data, error: null };
}

function failure(code, message, details = undefined) {
  return {
    ok: false,
    data: null,
    error: { code, message, ...(details ? { details } : {}) },
  };
}

async function handleContentMessage(message) {
  switch (message?.type) {
    case MESSAGE_TYPES.SCAN_FORM:
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

    case MESSAGE_TYPES.VALIDATE_AND_EXECUTE:
      try {
        const freshScan = scanDocument(document);
        const validated = validateActionPlan({
          plan: message.payload?.plan,
          request: message.payload?.request,
          scan: freshScan,
          availableProfileKeys: Object.keys(message.payload?.profileValues ?? {}),
          criticalApproved: message.payload?.criticalApproved === true,
        });
        const result = executeValidatedActions({
          actions: validated.actions,
          scan: freshScan,
          profileValues: message.payload?.profileValues ?? {},
        });
        currentScan = freshScan;

        if (!result.ok) {
          return failure("EXECUTION_FAILED", "A field rejected its local fill action.", {
            filledCount: result.filledCount,
            auditEntries: result.auditEntries,
          });
        }
        return success(result);
      } catch (error) {
        if (error instanceof ActionValidationError) {
          return failure(
            "ACTION_PLAN_REJECTED",
            "The plan was blocked by local safety validation. Rescan and try again.",
            { errors: error.errors },
          );
        }
        return failure("EXECUTION_FAILED", "The form could not be filled safely.");
      }

    default:
      return failure("UNSUPPORTED_MESSAGE", "This page action is not available yet.");
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleContentMessage(message).then(sendResponse);
  return true;
});
