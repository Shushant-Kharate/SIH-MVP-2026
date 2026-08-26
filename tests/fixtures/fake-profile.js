import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";

export const FAKE_PROFILE = Object.freeze({
  [PROFILE_KEYS.NAME]: "Aarav Demo Sharma",
  [PROFILE_KEYS.EMAIL]: "aarav.privacy@example.test",
  [PROFILE_KEYS.PHONE]: "9876543210",
  [PROFILE_KEYS.ADDRESS]: "42 Privacy Test Road, Pune",
  [PROFILE_KEYS.DOB]: "2002-04-18",
  [PROFILE_KEYS.AADHAAR]: "234567890123",
  [PROFILE_KEYS.PAN]: "ABCDE1234F",
});
