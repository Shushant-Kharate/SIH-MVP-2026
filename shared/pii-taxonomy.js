export const PROFILE_KEYS = Object.freeze({
  NAME: "PROFILE.NAME",
  EMAIL: "PROFILE.EMAIL",
  PHONE: "PROFILE.PHONE",
  ADDRESS: "PROFILE.ADDRESS",
  DOB: "PROFILE.DOB",
  AADHAAR: "PROFILE.AADHAAR",
  PAN: "PROFILE.PAN",
});

export const UNKNOWN_SENSITIVE = "UNKNOWN_SENSITIVE";
export const SUPPORTED_PROFILE_KEYS = Object.freeze(Object.values(PROFILE_KEYS));

export const RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);

export const PII_TAXONOMY = Object.freeze({
  [PROFILE_KEYS.NAME]: Object.freeze({
    risk: "medium",
    compatibleTypes: Object.freeze(["text"]),
    keywords: Object.freeze(["full name", "applicant name", "candidate name", "name"]),
  }),
  [PROFILE_KEYS.EMAIL]: Object.freeze({
    risk: "medium",
    compatibleTypes: Object.freeze(["email", "text"]),
    keywords: Object.freeze(["email address", "e-mail", "email"]),
  }),
  [PROFILE_KEYS.PHONE]: Object.freeze({
    risk: "medium",
    compatibleTypes: Object.freeze(["tel", "text", "number"]),
    keywords: Object.freeze(["mobile number", "phone number", "contact number", "mobile", "phone"]),
  }),
  [PROFILE_KEYS.ADDRESS]: Object.freeze({
    risk: "high",
    compatibleTypes: Object.freeze(["text", "textarea"]),
    keywords: Object.freeze(["residential address", "permanent address", "postal address", "address"]),
  }),
  [PROFILE_KEYS.DOB]: Object.freeze({
    risk: "high",
    compatibleTypes: Object.freeze(["date", "text"]),
    keywords: Object.freeze(["date of birth", "birth date", "dob"]),
  }),
  [PROFILE_KEYS.AADHAAR]: Object.freeze({
    risk: "critical",
    compatibleTypes: Object.freeze(["text", "number"]),
    keywords: Object.freeze(["aadhaar number", "aadhaar", "aadhar", "uidai", "uid number"]),
  }),
  [PROFILE_KEYS.PAN]: Object.freeze({
    risk: "critical",
    compatibleTypes: Object.freeze(["text"]),
    keywords: Object.freeze(["pan number", "permanent account number", "pan"]),
  }),
  [UNKNOWN_SENSITIVE]: Object.freeze({
    risk: "critical",
    compatibleTypes: Object.freeze([]),
    keywords: Object.freeze([
      "password", "passcode", "otp", "one time password", "cvv", "card number",
      "bank account", "account number", "upi pin",
    ]),
  }),
});

export function isSupportedProfileKey(value) {
  return SUPPORTED_PROFILE_KEYS.includes(value);
}

export function isRiskLevel(value) {
  return RISK_LEVELS.includes(value);
}
