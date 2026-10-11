import {
  PROFILE_KEYS,
  UNKNOWN_SENSITIVE,
} from "../../../shared/pii-taxonomy.js";

const MAX_SAFE_LABEL_LENGTH = 200;

const CANONICAL_LABELS = Object.freeze({
  [PROFILE_KEYS.NAME]: "Full name",
  [PROFILE_KEYS.EMAIL]: "Email address",
  [PROFILE_KEYS.PHONE]: "Phone number",
  [PROFILE_KEYS.ADDRESS]: "Address",
  [PROFILE_KEYS.DOB]: "Date of birth",
  [PROFILE_KEYS.AADHAAR]: "Aadhaar identifier",
  [PROFILE_KEYS.PAN]: "PAN identifier",
  [UNKNOWN_SENSITIVE]: "Sensitive field",
});

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const PAN_PATTERN = /\b[A-Z]{5}[\s-]*[0-9]{4}[\s-]*[A-Z]\b/giu;
const DATE_PATTERN = /\b(?:19|20)[0-9]{2}[\s./-](?:0?[1-9]|1[0-2])[\s./-](?:0?[1-9]|[12][0-9]|3[01])\b/gu;
const LONG_NUMBER_CANDIDATE = /\+?[0-9](?:[0-9\s().-]{5,})[0-9]/gu;

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function redactSensitivePatterns(value) {
  return normalizeText(value)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PAN_PATTERN, "[redacted-identifier]")
    .replace(DATE_PATTERN, "[redacted-date]")
    .replace(LONG_NUMBER_CANDIDATE, (candidate) => (
      candidate.replace(/\D/g, "").length >= 7 ? "[redacted-number]" : candidate
    ))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SAFE_LABEL_LENGTH);
}

export function minimizeExternalLabel(value, category = null) {
  if (Object.hasOwn(CANONICAL_LABELS, category)) return CANONICAL_LABELS[category];
  return redactSensitivePatterns(value) || "Unlabelled field";
}

export function minimizeExternalOptions() {
  // Arbitrary option text may contain names, account references or other third-party data that a
  // pattern-only scrubber cannot identify. External select choices remain user-completed for now.
  return [];
}

export function isExternalPageLocation(locationLike) {
  if (!locationLike) return true;
  const protocol = String(locationLike.protocol ?? "").toLowerCase();
  const hostname = String(locationLike.hostname ?? "").toLowerCase();
  const port = String(locationLike.port ?? "");
  const pathname = String(locationLike.pathname ?? "");
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1";
  return !(
    protocol === "http:"
    && isLoopback
    && port === "8787"
    && pathname.startsWith("/demo/")
  );
}
