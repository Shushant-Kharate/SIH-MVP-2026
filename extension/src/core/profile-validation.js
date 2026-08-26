import { PROFILE_KEYS, SUPPORTED_PROFILE_KEYS } from "../../../shared/pii-taxonomy.js";

export const PROFILE_VERSION = 1;
export const REQUIRED_PROFILE_KEYS = Object.freeze([...SUPPORTED_PROFILE_KEYS]);

const FIELD_RULES = Object.freeze({
  [PROFILE_KEYS.NAME]: {
    label: "Full name",
    normalize: normalizeWhitespace,
    validate: (value) => value.length >= 2 && value.length <= 100,
    message: "Enter a name between 2 and 100 characters.",
  },
  [PROFILE_KEYS.EMAIL]: {
    label: "Email address",
    normalize: (value) => value.trim().toLowerCase(),
    validate: (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: "Enter a valid email address.",
  },
  [PROFILE_KEYS.PHONE]: {
    label: "Mobile number",
    normalize: normalizeIndianPhone,
    validate: (value) => /^[6-9][0-9]{9}$/.test(value),
    message: "Enter a 10-digit Indian mobile number beginning with 6–9.",
  },
  [PROFILE_KEYS.ADDRESS]: {
    label: "Address",
    normalize: normalizeWhitespace,
    validate: (value) => value.length >= 5 && value.length <= 250,
    message: "Enter an address between 5 and 250 characters.",
  },
  [PROFILE_KEYS.DOB]: {
    label: "Date of birth",
    normalize: (value) => value.trim(),
    validate: isValidPastIsoDate,
    message: "Enter a valid date of birth that is not in the future.",
  },
  [PROFILE_KEYS.AADHAAR]: {
    label: "Aadhaar number",
    normalize: digitsOnly,
    validate: (value) => /^[2-9][0-9]{11}$/.test(value),
    message: "Use a fictional 12-digit Aadhaar-shaped value beginning with 2–9.",
  },
  [PROFILE_KEYS.PAN]: {
    label: "PAN number",
    normalize: (value) => value.trim().toUpperCase(),
    validate: (value) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value),
    message: "Enter a PAN-shaped value such as ABCDE1234F.",
  },
});

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

function normalizeIndianPhone(value) {
  const digits = digitsOnly(value);
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function isValidPastIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  const isRealDate = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
  if (!isRealDate) return false;

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return date.getTime() <= todayUtc && year >= 1900;
}

export function createEmptyProfileValues() {
  return Object.fromEntries(SUPPORTED_PROFILE_KEYS.map((key) => [key, ""]));
}

export function validateProfileValues(input) {
  const errors = {};
  const values = createEmptyProfileValues();

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      values,
      errors: { _form: "Profile values must be provided as an object." },
    };
  }

  const unknownKeys = Object.keys(input).filter((key) => !SUPPORTED_PROFILE_KEYS.includes(key));
  if (unknownKeys.length > 0) errors._form = "Profile contains unsupported fields.";

  for (const key of SUPPORTED_PROFILE_KEYS) {
    const rawValue = input[key];
    const rule = FIELD_RULES[key];

    if (typeof rawValue !== "string") {
      errors[key] = `${rule.label} is required.`;
      continue;
    }

    const normalizedValue = rule.normalize(rawValue);
    values[key] = normalizedValue;
    if (!rule.validate(normalizedValue)) errors[key] = rule.message;
  }

  return Object.keys(errors).length === 0
    ? { ok: true, values, errors: {} }
    : { ok: false, values, errors };
}

export function createStoredProfile(values, now = new Date()) {
  const result = validateProfileValues(values);
  if (!result.ok) {
    const error = new Error("Profile validation failed.");
    error.code = "PROFILE_INVALID";
    error.validationErrors = result.errors;
    throw error;
  }

  return {
    version: PROFILE_VERSION,
    savedAt: now.toISOString(),
    values: result.values,
  };
}
