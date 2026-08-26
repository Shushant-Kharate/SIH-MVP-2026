import { SUPPORTED_PROFILE_KEYS } from "../../../shared/pii-taxonomy.js";

const MIN_TEXT_LENGTH = 6;
const MIN_ALPHANUMERIC_LENGTH = 8;
const MIN_DIGIT_LENGTH = 7;

function canonicalText(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function collapseWhitespace(value) {
  return canonicalText(value).replace(/\s+/g, " ");
}

function alphanumericOnly(value) {
  return canonicalText(value).replace(/[^\p{L}\p{N}]/gu, "");
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function addVariant(variants, seen, category, variantType, normalized, minimumLength) {
  if (normalized.length < minimumLength) return;
    const identity = `${category}:${variantType}:${normalized}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  variants.push({ category, variantType, normalized });
}

export function createProtectedVariants(profileValues) {
  const variants = [];
  const seen = new Set();
  if (!profileValues || typeof profileValues !== "object") return variants;

  for (const category of SUPPORTED_PROFILE_KEYS) {
    const rawValue = profileValues[category];
    if (typeof rawValue !== "string" || rawValue.trim() === "") continue;

    addVariant(variants, seen, category, "exact", canonicalText(rawValue), MIN_TEXT_LENGTH);
    addVariant(variants, seen, category, "whitespace", collapseWhitespace(rawValue), MIN_TEXT_LENGTH);
    addVariant(
      variants,
      seen,
      category,
      "alphanumeric",
      alphanumericOnly(rawValue),
      MIN_ALPHANUMERIC_LENGTH,
    );
    addVariant(variants, seen, category, "digits", digitsOnly(rawValue), MIN_DIGIT_LENGTH);
  }
  return variants;
}

function collectStrings(value, path = "payload", output = []) {
  if (typeof value === "string") {
    output.push({ path, value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, output));
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      output.push({ path: `${path}.[key]`, value: key });
      collectStrings(child, `${path}.${key}`, output);
    }
  }
  return output;
}

function candidateForVariant(value, variantType) {
  switch (variantType) {
    case "exact":
      return canonicalText(value);
    case "whitespace":
      return collapseWhitespace(value);
    case "alphanumeric":
      return alphanumericOnly(value);
    case "digits":
      return digitsOnly(value);
    default:
      return "";
  }
}

export function checkPayloadForLeaks(payload, profileValues) {
  const variants = createProtectedVariants(profileValues);
  const strings = collectStrings(payload);
  const matches = [];
  const seenMatches = new Set();

  for (const candidate of strings) {
    for (const variant of variants) {
      const normalizedCandidate = candidateForVariant(candidate.value, variant.variantType);
      if (!normalizedCandidate.includes(variant.normalized)) continue;

      const identity = `${candidate.path}:${variant.category}:${variant.variantType}`;
      if (seenMatches.has(identity)) continue;
      seenMatches.add(identity);
      matches.push({
        path: candidate.path,
        category: variant.category,
        variantType: variant.variantType,
      });
    }
  }

  return {
    ok: matches.length === 0,
    protectedCategoryCount: new Set(variants.map((variant) => variant.category)).size,
    checkedStringCount: strings.length,
    matches,
  };
}

export class ProfileLeakError extends Error {
  constructor(matches) {
    super("Outbound request blocked by privacy policy.");
    this.name = "ProfileLeakError";
    this.code = "PRIVACY_LEAK_BLOCKED";
    this.matches = matches;
  }
}

export function assertNoProfileLeak(payload, profileValues) {
  const result = checkPayloadForLeaks(payload, profileValues);
  if (!result.ok) throw new ProfileLeakError(result.matches);
  return result;
}
