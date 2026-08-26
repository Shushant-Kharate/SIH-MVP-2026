import { isAllowedActionType } from "../../../shared/action-types.js";
import { isSupportedProfileKey } from "../../../shared/pii-taxonomy.js";

export const AUDIT_STORAGE_KEY = "privacyfill.audit";
export const MAX_AUDIT_ENTRIES = 200;
const ALLOWED_STATUSES = new Set(["success", "failed", "skipped"]);

function safeToken(value, fallback = "none") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 100);
  return normalized || fallback;
}

export function createAuditEntry({ timestamp, fieldId, profileKey, action, status, durationMs, code }) {
  return {
    timestamp: Number.isFinite(timestamp) ? Math.round(timestamp) : Date.now(),
    fieldId: safeToken(fieldId),
    profileKey: isSupportedProfileKey(profileKey) ? profileKey : null,
    action: isAllowedActionType(action) ? action : "unknown",
    status: ALLOWED_STATUSES.has(status) ? status : "failed",
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    code: safeToken(code, status === "success" ? "OK" : "UNKNOWN"),
  };
}

function requireSessionStorage() {
  if (!globalThis.chrome?.storage?.session) throw new Error("Session storage unavailable.");
  return chrome.storage.session;
}

export async function appendAuditEntries(entries) {
  const safeEntries = entries.map(createAuditEntry);
  const storage = requireSessionStorage();
  const stored = await storage.get(AUDIT_STORAGE_KEY);
  const current = Array.isArray(stored[AUDIT_STORAGE_KEY]) ? stored[AUDIT_STORAGE_KEY] : [];
  const next = [...current, ...safeEntries].slice(-MAX_AUDIT_ENTRIES);
  await storage.set({ [AUDIT_STORAGE_KEY]: next });
  return next.length;
}

export async function getAuditEntries() {
  const stored = await requireSessionStorage().get(AUDIT_STORAGE_KEY);
  return Array.isArray(stored[AUDIT_STORAGE_KEY]) ? stored[AUDIT_STORAGE_KEY] : [];
}

export async function clearAuditEntries() {
  await requireSessionStorage().remove(AUDIT_STORAGE_KEY);
  return [];
}
