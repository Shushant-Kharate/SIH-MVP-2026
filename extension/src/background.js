import { MESSAGE_TYPES } from "../../shared/message-types.js";
import {
  clearSessionProfile,
  getSessionProfile,
  getSessionProfileStatus,
  restrictSessionStorageAccess,
  saveSessionProfile,
} from "./core/profile-store.js";
import { assertNoProfileLeak, ProfileLeakError } from "./core/leak-checker.js";
import {
  createPlanningRequest,
  createRequestId,
  DEFAULT_PLANNING_TASK,
} from "./core/sanitizer.js";

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

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return failure("INVALID_MESSAGE", "The extension received an invalid message.");
  }

  switch (message.type) {
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

    case MESSAGE_TYPES.GET_SANITIZED_PAYLOAD:
      try {
        const profile = await getSessionProfile();
        if (!profile) return failure("PROFILE_MISSING", "Create a session profile before inspecting the safe payload.");

        const request = createPlanningRequest({
          scanResult: message.payload?.scanResult,
          availableProfileKeys: Object.keys(profile.values),
          requestId: createRequestId(),
          task: message.payload?.task ?? DEFAULT_PLANNING_TASK,
        });
        const privacyCheck = assertNoProfileLeak(request, profile.values);

        return success({
          request,
          privacyCheck: {
            passed: true,
            protectedCategoryCount: privacyCheck.protectedCategoryCount,
            checkedStringCount: privacyCheck.checkedStringCount,
            matchCount: 0,
          },
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
