import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { ActionValidationError, validateActionPlan } from "./core/action-validator.js";
import { executeValidatedActions } from "./core/action-executor.js";
import { createAuditEntry } from "./core/audit-log.js";
import { createSafeScanResult, scanDocument } from "./core/field-scanner.js";
import { isExternalPageLocation } from "./core/label-sanitizer.js";
import { armSubmissionGuard } from "./ui/confirmation-overlay.js";

let currentScan = null;
const INSTALLATION_MARKER = "__privacyFillContentScriptV1";

function scanCurrentPage() {
  return scanDocument(document, {
    externalPage: isExternalPageLocation(globalThis.location),
    locationLike: globalThis.location,
  });
}

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

function recordDeferredAudit(entry) {
  try {
    const pending = chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.APPEND_AUDIT_EVENTS,
      payload: { entries: [entry] },
    });
    pending?.catch?.(() => {});
  } catch {
    // Submission control must remain usable even if audit persistence is unavailable.
  }
}

async function handleContentMessage(message) {
  switch (message?.type) {
    case MESSAGE_TYPES.PING_CONTENT_SCRIPT:
      return success({ ready: true, version: 1 });

    case MESSAGE_TYPES.SCAN_FORM:
      try {
        currentScan = scanCurrentPage();
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
        const freshScan = scanCurrentPage();
        const validated = validateActionPlan({
          plan: message.payload?.plan,
          request: message.payload?.request,
          scan: freshScan,
          availableProfileKeys: Object.keys(message.payload?.profileValues ?? {}),
          criticalApproved: message.payload?.criticalApproved === true,
        });
        const requestFields = new Map(
          message.payload.request.fields.map((field) => [field.fieldId, field]),
        );
        const criticalCategories = validated.actions
          .filter((action) => requestFields.get(action.target)?.risk === "critical")
          .map((action) => action.profileKey)
          .filter(Boolean);
        const expectedFillCount = validated.actions.filter((action) => action.action !== "focus").length;
        const guard = armSubmissionGuard({
          scan: freshScan,
          actions: validated.actions,
          filledCount: expectedFillCount,
          criticalCategories,
          onAudit: recordDeferredAudit,
        });
        const result = await executeValidatedActions({
          actions: validated.actions,
          scan: freshScan,
          profileValues: message.payload?.profileValues ?? {},
        });
        currentScan = freshScan;

        if (!result.ok) {
          guard.disarm();
          return failure("EXECUTION_FAILED", "A field rejected its local fill action.", {
            filledCount: result.filledCount,
            auditEntries: result.auditEntries,
          });
        }
        result.auditEntries.push(createAuditEntry({
          fieldId: guard.formId,
          action: "request_confirmation",
          status: "success",
          durationMs: 0,
          code: "SUBMISSION_GUARD_ARMED",
        }));
        return success({ ...result, submissionGuardArmed: true, guardedForm: guard.formName });
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

if (!globalThis[INSTALLATION_MARKER]) {
  Object.defineProperty(globalThis, INSTALLATION_MARKER, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleContentMessage(message).then(sendResponse);
    return true;
  });
}
