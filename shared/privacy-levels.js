import { isSupportedProfileKey, UNKNOWN_SENSITIVE } from "./pii-taxonomy.js";

export const PRIVACY_LEVELS = Object.freeze({
  VISIBLE: "VISIBLE",
  PLACEHOLDER: "PLACEHOLDER",
  LOCAL_APPROVAL: "LOCAL_APPROVAL",
  BLOCKED: "BLOCKED",
});

export const PRIVACY_LEVEL_VALUES = Object.freeze(Object.values(PRIVACY_LEVELS));

export function isPrivacyLevel(value) {
  return PRIVACY_LEVEL_VALUES.includes(value);
}

export function derivePrivacyLevel(classification) {
  const category = classification?.category;
  if (category === UNKNOWN_SENSITIVE) return PRIVACY_LEVELS.BLOCKED;
  if (isSupportedProfileKey(category)) {
    return classification?.risk === "critical"
      ? PRIVACY_LEVELS.LOCAL_APPROVAL
      : PRIVACY_LEVELS.PLACEHOLDER;
  }
  return PRIVACY_LEVELS.VISIBLE;
}
