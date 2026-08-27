import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { assertVisualInspectorPreview } from "../../shared/visual-inspector-contract.js";
import {
  assertValidPlanningRequest,
  assertValidPlanningResponse,
  ContractValidationError,
} from "../../shared/contracts.js";
import {
  appendAuditEntries,
  clearAuditEntries,
  getAuditEntries,
} from "./core/audit-log.js";
import {
  clearSessionProfile,
  getSessionProfile,
  getSessionProfileStatus,
  restrictSessionStorageAccess,
  saveSessionProfile,
} from "./core/profile-store.js";
import { assertNoProfileLeak, ProfileLeakError } from "./core/leak-checker.js";
import { PlannerClientError, requestPlannerPlan } from "./core/planner-client.js";
import { VisualSessionBroker } from "./vision/visual-session-broker.js";
import {
  createPlanningRequest,
  createRequestId,
  DEFAULT_PLANNING_TASK,
} from "./core/sanitizer.js";

const visualSessionBroker = new VisualSessionBroker();

function success(data) {
  return { ok: true, data, error: null };
}

function failure(code, message, details = undefined) {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function createSafeRequest(scanResult, profile, task) {
  const request = createPlanningRequest({
    scanResult,
    availableProfileKeys: Object.keys(profile.values),
    requestId: createRequestId(),
    task: task ?? DEFAULT_PLANNING_TASK,
  });
  const privacyCheck = assertNoProfileLeak(request, profile.values);
  return { request, privacyCheck };
}

function privacySummary(privacyCheck) {
  return {
    passed: true,
    protectedCategoryCount: privacyCheck.protectedCategoryCount,
    checkedStringCount: privacyCheck.checkedStringCount,
    matchCount: 0,
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    const error = new Error("No active tab");
    error.code = "ACTIVE_TAB_MISSING";
    throw error;
  }
  return tab;
}

function isTrustedExtensionPage(sender, pageName) {
  const expected = chrome.runtime.getURL(`pages/${pageName}`);
  return typeof sender?.url === "string" && sender.url.startsWith(expected);
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== "object") {
    return failure("INVALID_MESSAGE", "The extension received an invalid message.");
  }

  switch (message.type) {
    case MESSAGE_TYPES.VISUAL_SESSION_CREATE:
      try {
        if (!isTrustedExtensionPage(sender, "popup.html")) {
          return failure("VISUAL_SESSION_FORBIDDEN", "The visual handoff request was rejected.");
        }
        return success(visualSessionBroker.create(message.payload?.session));
      } catch {
        visualSessionBroker.clear();
        return failure("VISUAL_SESSION_INVALID", "The temporary visual session was rejected.");
      }

    case MESSAGE_TYPES.VISUAL_SESSION_TAKE:
      if (!isTrustedExtensionPage(sender, "inspector.html")) {
        return failure("VISUAL_SESSION_FORBIDDEN", "The visual handoff request was rejected.");
      }
      {
        const session = visualSessionBroker.take(message.payload?.sessionId);
        return session
          ? success(session)
          : failure("VISUAL_SESSION_EXPIRED", "The temporary visual session is unavailable or expired.");
      }

    case MESSAGE_TYPES.VISUAL_SESSION_CANCEL:
      if (!isTrustedExtensionPage(sender, "popup.html")
        && !isTrustedExtensionPage(sender, "inspector.html")) {
        return failure("VISUAL_SESSION_FORBIDDEN", "The visual cancellation request was rejected.");
      }
      visualSessionBroker.clear(message.payload?.sessionId);
      return success({ cleared: true });

    case MESSAGE_TYPES.VISUAL_PRIVACY_CHECK:
      try {
        if (!isTrustedExtensionPage(sender, "inspector.html")) {
          return failure("VISUAL_SESSION_FORBIDDEN", "The visual privacy check was rejected.");
        }
        const profile = await getSessionProfile();
        if (!profile) return failure("PROFILE_MISSING", "Create a session profile before visual approval.");
        const safePreview = assertVisualInspectorPreview(message.payload?.safePreview);
        const privacyCheck = assertNoProfileLeak(safePreview, profile.values);
        return success({ privacyCheck: privacySummary(privacyCheck) });
      } catch (error) {
        if (error instanceof ProfileLeakError) {
          return failure("PRIVACY_LEAK_BLOCKED", "Visual approval was blocked by the profile leak checker.");
        }
        return failure("VISUAL_PRIVACY_CHECK_FAILED", "The local visual privacy check failed.");
      }

    case MESSAGE_TYPES.PROFILE_SAVE:
      try {
        return success(await saveSessionProfile(message.payload?.values));
      } catch (error) {
        if (error.code === "PROFILE_INVALID") {
          return failure("PROFILE_INVALID", "Review the highlighted profile fields.", error.validationErrors);
        }
        return failure("PROFILE_SAVE_FAILED", "The session profile could not be saved.");
      }

    case MESSAGE_TYPES.PROFILE_GET_STATUS:
      try {
        return success(await getSessionProfileStatus());
      } catch {
        return failure("PROFILE_STATUS_FAILED", "Profile status is currently unavailable.");
      }

    case MESSAGE_TYPES.PROFILE_CLEAR:
      try {
        return success(await clearSessionProfile());
      } catch {
        return failure("PROFILE_CLEAR_FAILED", "The session profile could not be cleared.");
      }

    case MESSAGE_TYPES.GET_AUDIT_LOG:
      try {
        const entries = await getAuditEntries();
        return success({ entries, entryCount: entries.length });
      } catch {
        return failure("AUDIT_READ_FAILED", "The local audit history could not be read.");
      }

    case MESSAGE_TYPES.CLEAR_AUDIT_LOG:
      try {
        await clearAuditEntries();
        return success({ entries: [], entryCount: 0 });
      } catch {
        return failure("AUDIT_CLEAR_FAILED", "The local audit history could not be cleared.");
      }

    case MESSAGE_TYPES.APPEND_AUDIT_EVENTS:
      try {
        const entries = message.payload?.entries;
        if (!Array.isArray(entries) || entries.length === 0 || entries.length > 20) {
          return failure("AUDIT_EVENTS_INVALID", "Audit metadata was rejected.");
        }
        const entryCount = await appendAuditEntries(entries);
        return success({ entryCount });
      } catch {
        return failure("AUDIT_WRITE_FAILED", "Audit metadata could not be recorded.");
      }

    case MESSAGE_TYPES.GET_SANITIZED_PAYLOAD:
      try {
        const profile = await getSessionProfile();
        if (!profile) return failure("PROFILE_MISSING", "Create a session profile before inspecting the safe payload.");

        const { request, privacyCheck } = createSafeRequest(
          message.payload?.scanResult,
          profile,
          message.payload?.task,
        );

        return success({
          request,
          privacyCheck: privacySummary(privacyCheck),
        });
      } catch (error) {
        if (error instanceof ProfileLeakError) {
          return failure(
            "PRIVACY_LEAK_BLOCKED",
            "The outgoing payload was blocked because it contained a protected profile value.",
            { matches: error.matches },
          );
        }
        if (error.code === "SCAN_REQUIRED" || error.code === "CONTRACT_VALIDATION_FAILED") {
          return failure("INVALID_SCAN", "Rescan the form before building the safe payload.");
        }
        return failure("SANITIZATION_FAILED", "The privacy-safe payload could not be created.");
      }

    case MESSAGE_TYPES.PLAN_REQUEST:
      try {
        const profile = await getSessionProfile();
        if (!profile) return failure("PROFILE_MISSING", "Create a session profile before requesting a plan.");

        const { request, privacyCheck } = createSafeRequest(
          message.payload?.scanResult,
          profile,
          message.payload?.task,
        );
        const plan = await requestPlannerPlan({ request, profileValues: profile.values });

        return success({
          request,
          plan,
          privacyCheck: privacySummary(privacyCheck),
        });
      } catch (error) {
        if (error instanceof ProfileLeakError || error instanceof PlannerClientError) {
          return failure(error.code, error.message);
        }
        if (error.code === "SCAN_REQUIRED" || error.code === "CONTRACT_VALIDATION_FAILED") {
          return failure("INVALID_SCAN", "Rescan the form before requesting a plan.");
        }
        return failure("PLAN_REQUEST_FAILED", "The local planner could not create a safe plan.");
      }

    case MESSAGE_TYPES.VALIDATE_AND_EXECUTE:
      try {
        const profile = await getSessionProfile();
        if (!profile) return failure("PROFILE_MISSING", "The session profile is no longer available.");

        const request = assertValidPlanningRequest(message.payload?.request);
        const plan = assertValidPlanningResponse(message.payload?.plan);
        if (plan.requestId !== request.requestId || plan.snapshotId !== request.snapshotId) {
          return failure("PLAN_CORRELATION_FAILED", "The plan no longer matches this safe request.");
        }
        assertNoProfileLeak(request, profile.values);
        assertNoProfileLeak(plan, profile.values);

        const tab = await getActiveTab();
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: MESSAGE_TYPES.VALIDATE_AND_EXECUTE,
          payload: {
            request,
            plan,
            criticalApproved: message.payload?.criticalApproved === true,
            profileValues: profile.values,
          },
        });

        const auditEntries = result?.ok
          ? result.data?.auditEntries
          : result?.error?.details?.auditEntries;
        let auditRecorded = false;
        if (Array.isArray(auditEntries) && auditEntries.length > 0) {
          try {
            await appendAuditEntries(auditEntries);
            auditRecorded = true;
          } catch {
            auditRecorded = false;
          }
        }

        if (!result?.ok) {
          return failure(
            result?.error?.code ?? "EXECUTION_FAILED",
            result?.error?.message ?? "The form could not be filled safely.",
            result?.error?.details,
          );
        }
        return success({
          planner: plan.planner,
          filledCount: result.data.filledCount,
          actionCount: result.data.actionCount,
          auditRecorded,
          submissionGuardArmed: result.data.submissionGuardArmed === true,
          guardedForm: result.data.guardedForm,
        });
      } catch (error) {
        if (error instanceof ProfileLeakError) {
          return failure("PRIVACY_LEAK_BLOCKED", "Execution was blocked by the privacy checker.");
        }
        if (error instanceof ContractValidationError) {
          return failure("ACTION_PLAN_REJECTED", "The action plan failed contract validation.");
        }
        return failure("EXECUTION_FAILED", "The form could not be filled safely.");
      }

    default:
      return failure("UNSUPPORTED_MESSAGE", "This extension action is not available yet.");
  }
}

restrictSessionStorageAccess().catch(() => {
  // Message handlers return user-safe storage errors if initialization is unavailable.
});

chrome.runtime.onInstalled.addListener(() => {
  restrictSessionStorageAccess().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});
