import { SUPPORTED_PROFILE_KEYS } from "../../../shared/pii-taxonomy.js";
import { createStoredProfile, PROFILE_VERSION } from "./profile-validation.js";

const STORAGE_KEY = "privacyfill.profile";

function requireSessionStorage() {
  if (!globalThis.chrome?.storage?.session) {
    const error = new Error("Chrome session storage is unavailable.");
    error.code = "SESSION_STORAGE_UNAVAILABLE";
    throw error;
  }
  return chrome.storage.session;
}

export async function restrictSessionStorageAccess() {
  const storage = requireSessionStorage();
  if (typeof storage.setAccessLevel === "function") {
    await storage.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
}

export async function saveSessionProfile(values) {
  const profile = createStoredProfile(values);
  await requireSessionStorage().set({ [STORAGE_KEY]: profile });
  return getSafeProfileStatus(profile);
}

export async function getSessionProfile() {
  const stored = await requireSessionStorage().get(STORAGE_KEY);
  const profile = stored[STORAGE_KEY];

  if (!profile || profile.version !== PROFILE_VERSION || typeof profile.values !== "object") {
    return null;
  }
  return profile;
}

export async function clearSessionProfile() {
  await requireSessionStorage().remove(STORAGE_KEY);
  return getSafeProfileStatus(null);
}

export async function getSessionProfileStatus() {
  return getSafeProfileStatus(await getSessionProfile());
}

export function getSafeProfileStatus(profile) {
  if (!profile) {
    return {
      hasProfile: false,
      profileVersion: PROFILE_VERSION,
      availableProfileKeys: [],
      savedAt: null,
    };
  }

  return {
    hasProfile: true,
    profileVersion: profile.version,
    availableProfileKeys: SUPPORTED_PROFILE_KEYS.filter((key) => (
      typeof profile.values[key] === "string" && profile.values[key].length > 0
    )),
    savedAt: profile.savedAt,
  };
}

export { STORAGE_KEY as PROFILE_STORAGE_KEY };
