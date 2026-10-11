import { deriveAccessibleFieldLabel } from "../core/accessible-name.js";

const QUESTION_SELECTOR = "[data-question-container], [role='listitem']";
const QUESTION_HEADING_SELECTOR = [
  "[data-question-title]",
  "[role='heading']",
  ".question-title",
  ".field-title",
  "legend",
].join(", ");
const CUSTOM_WIDGET_SELECTOR = [
  "[role='radio']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='grid']",
  "[contenteditable='true']",
].join(", ");
const SUPPORTED_INPUT_TYPES = new Set([
  "date", "email", "number", "password", "search", "tel", "text", "url",
]);

function topLevelQuestionContainers(document) {
  return Array.from(document.querySelectorAll(QUESTION_SELECTOR)).filter((container) => (
    !container.parentElement?.closest(QUESTION_SELECTOR)
  ));
}

function nativeQuestionControls(container) {
  return Array.from(container.querySelectorAll("input, select, textarea")).filter((element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "select") return false;
    const type = (element.getAttribute("type") || "text").toLowerCase();
    return SUPPORTED_INPUT_TYPES.has(type);
  });
}

function questionIsUnsupported(container, nativeControls) {
  if (container.querySelector(CUSTOM_WIDGET_SELECTOR)) return true;
  if (container.querySelector("input[type='file'], select, input[type='radio'], input[type='checkbox']")) {
    return true;
  }
  return nativeControls.length > 1;
}

export function analyzeGoogleForm(document) {
  const supportedControls = [];
  let unsupportedControlCount = 0;

  for (const container of topLevelQuestionContainers(document)) {
    const nativeControls = nativeQuestionControls(container);
    if (questionIsUnsupported(container, nativeControls)) {
      unsupportedControlCount += 1;
      continue;
    }
    if (nativeControls.length === 1) supportedControls.push(nativeControls[0]);
  }

  return Object.freeze({
    supportedControls,
    unsupportedControlCount,
  });
}

function matchesGoogleFormsLocation(locationLike) {
  const protocol = String(locationLike?.protocol ?? "").toLowerCase();
  const hostname = String(locationLike?.hostname ?? "").toLowerCase();
  const pathname = String(locationLike?.pathname ?? "");
  return protocol === "https:"
    && hostname === "docs.google.com"
    && pathname.startsWith("/forms/");
}

function rawQuestionHeading(element) {
  const container = element.closest(QUESTION_SELECTOR);
  if (!container) return "";
  for (const candidate of container.querySelectorAll(QUESTION_HEADING_SELECTOR)) {
    if (candidate.getAttribute("aria-hidden") === "true" || candidate.hidden) continue;
    const text = String(candidate.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) return text;
  }
  return "";
}

export const googleFormsAdapter = Object.freeze({
  id: "google-forms-experimental",

  matches(document, locationLike) {
    return matchesGoogleFormsLocation(locationLike)
      && topLevelQuestionContainers(document).length > 0;
  },

  findControls(document) {
    return analyzeGoogleForm(document).supportedControls;
  },

  deriveLabel(element, document) {
    return deriveAccessibleFieldLabel(element, document);
  },

  deriveRequired(element) {
    if (element.required === true || element.getAttribute("aria-required") === "true") return true;
    const heading = rawQuestionHeading(element);
    return /(?:\*|\(required\))\s*$/iu.test(heading);
  },

  getFormContainer(element) {
    return element.closest("form");
  },

  getUnsupportedControlCount(document) {
    return analyzeGoogleForm(document).unsupportedControlCount;
  },
});
