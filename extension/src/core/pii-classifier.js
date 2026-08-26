import {
  PII_TAXONOMY,
  PROFILE_KEYS,
  SUPPORTED_PROFILE_KEYS,
  UNKNOWN_SENSITIVE,
} from "../../../shared/pii-taxonomy.js";

const SOURCE_WEIGHTS = Object.freeze({
  label: 0.96,
  placeholder: 0.91,
  name: 0.86,
  id: 0.83,
  autocomplete: 0.99,
  type: 0.77,
});

const CATEGORY_ORDER = Object.freeze([
  UNKNOWN_SENSITIVE,
  PROFILE_KEYS.AADHAAR,
  PROFILE_KEYS.PAN,
  PROFILE_KEYS.DOB,
  PROFILE_KEYS.EMAIL,
  PROFILE_KEYS.PHONE,
  PROFILE_KEYS.ADDRESS,
  PROFILE_KEYS.NAME,
]);

const AUTOCOMPLETE_CATEGORIES = Object.freeze({
  name: PROFILE_KEYS.NAME,
  email: PROFILE_KEYS.EMAIL,
  tel: PROFILE_KEYS.PHONE,
  "tel-national": PROFILE_KEYS.PHONE,
  "street-address": PROFILE_KEYS.ADDRESS,
  bday: PROFILE_KEYS.DOB,
});

const TYPE_CATEGORIES = Object.freeze({
  email: PROFILE_KEYS.EMAIL,
  tel: PROFILE_KEYS.PHONE,
  password: UNKNOWN_SENSITIVE,
});

export function normalizeMetadataText(value) {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function containsPhrase(text, phrase) {
  if (!text || !phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

function createCandidate(category, score, evidence) {
  return { category, score: Math.min(score, 0.99), evidence };
}

export function classifyFieldMetadata(field) {
  const sources = {
    label: normalizeMetadataText(field.label),
    placeholder: normalizeMetadataText(field.placeholder),
    name: normalizeMetadataText(field.name),
    id: normalizeMetadataText(field.id),
    autocomplete: normalizeMetadataText(field.autocomplete),
    type: normalizeMetadataText(field.type),
  };
  const candidates = [];

  for (const category of CATEGORY_ORDER) {
    const taxonomy = PII_TAXONOMY[category];
    for (const [source, text] of Object.entries(sources)) {
      if (!text || source === "type") continue;

      for (const rawKeyword of taxonomy.keywords) {
        const keyword = normalizeMetadataText(rawKeyword);
        if (!containsPhrase(text, keyword)) continue;

        const specificity = Math.min(keyword.length, 24) / 1000;
        const sensitiveBoost = category === UNKNOWN_SENSITIVE ? 0.02 : 0;
        candidates.push(createCandidate(
          category,
          SOURCE_WEIGHTS[source] + specificity + sensitiveBoost,
          `${source}:${keyword}`,
        ));
      }
    }
  }

  const autocompleteCategory = AUTOCOMPLETE_CATEGORIES[sources.autocomplete];
  if (autocompleteCategory) {
    candidates.push(createCandidate(
      autocompleteCategory,
      SOURCE_WEIGHTS.autocomplete,
      `autocomplete:${sources.autocomplete}`,
    ));
  }

  const typeCategory = TYPE_CATEGORIES[sources.type];
  if (typeCategory) {
    candidates.push(createCandidate(typeCategory, SOURCE_WEIGHTS.type, `type:${sources.type}`));
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
  });

  const best = candidates[0];
  if (!best) {
    return {
      category: null,
      confidence: 0,
      risk: "low",
      evidence: [],
    };
  }

  return {
    category: best.category,
    confidence: Number(best.score.toFixed(2)),
    risk: PII_TAXONOMY[best.category].risk,
    evidence: [...new Set(
      candidates
        .filter((candidate) => candidate.category === best.category)
        .map((candidate) => candidate.evidence),
    )].slice(0, 4),
  };
}

export function isAutoFillableClassification(classification) {
  return classification?.category !== UNKNOWN_SENSITIVE
    && SUPPORTED_PROFILE_KEYS.includes(classification?.category);
}
