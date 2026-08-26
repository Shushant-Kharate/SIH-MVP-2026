import { CONTRACT_LIMITS } from "../../../shared/contracts.js";

const QUESTION_CONTAINER_SELECTOR = [
  "[data-question-container]",
  "[role='listitem']",
  ".question",
  ".form-field",
].join(", ");

const QUESTION_HEADING_SELECTORS = [
  "[data-question-title]",
  "[role='heading']",
  ".question-title",
  ".field-title",
  "legend",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

function normalizeWhitespace(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeAccessibleText(value) {
  return normalizeWhitespace(value)
    .replace(/(?:\s*\*\s*)+$/gu, "")
    .replace(/\s*\(required\)\s*$/iu, "")
    .trim()
    .slice(0, CONTRACT_LIMITS.MAX_LABEL_LENGTH);
}

function isHiddenFromAccessibility(element) {
  if (!element) return true;
  if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return true;
  if (element.closest?.("[hidden], [aria-hidden='true'], [data-privacyfill-owned]")) return true;
  const inlineStyle = String(element.getAttribute?.("style") ?? "").replace(/\s+/g, "").toLowerCase();
  if (inlineStyle.includes("display:none") || inlineStyle.includes("visibility:hidden")) return true;
  const computed = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return computed?.display === "none" || computed?.visibility === "hidden";
}

function textFromElement(element) {
  if (isHiddenFromAccessibility(element)) return "";
  const parts = [];
  let collectedLength = 0;
  const excludedTags = new Set(["button", "input", "noscript", "script", "select", "style", "textarea"]);

  function collect(node) {
    if (collectedLength >= CONTRACT_LIMITS.MAX_LABEL_LENGTH * 2) return;
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      parts.push(text);
      collectedLength += text.length;
      return;
    }
    if (node.nodeType !== 1) return;
    if (node !== element && isHiddenFromAccessibility(node)) return;
    if (node !== element && excludedTags.has(node.tagName?.toLowerCase())) return;
    for (const child of node.childNodes ?? []) collect(child);
  }

  collect(element);
  return normalizeAccessibleText(parts.join(" "));
}

function getExplicitLabel(element, document) {
  const id = element.getAttribute("id");
  if (!id) return "";

  for (const label of document.querySelectorAll("label[for]")) {
    if (label.getAttribute("for") === id) return textFromElement(label);
  }
  return "";
}

function getWrappingLabel(element) {
  return textFromElement(element.closest("label"));
}

function getAriaLabelledBy(element, document) {
  const ids = normalizeWhitespace(element.getAttribute("aria-labelledby"))
    .split(" ")
    .filter(Boolean)
    .slice(0, 4);
  const seen = new Set();
  const parts = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const text = textFromElement(document.getElementById(id));
    if (text && !parts.includes(text)) parts.push(text);
  }
  return normalizeAccessibleText(parts.join(" "));
}

function getFieldsetLegend(element) {
  const fieldset = element.closest("fieldset");
  if (!fieldset) return "";
  const legend = Array.from(fieldset.children ?? [])
    .find((child) => child.tagName?.toLowerCase() === "legend");
  return textFromElement(legend);
}

function getQuestionHeading(element) {
  const container = element.closest(QUESTION_CONTAINER_SELECTOR);
  if (!container || isHiddenFromAccessibility(container)) return "";

  for (const selector of QUESTION_HEADING_SELECTORS) {
    for (const candidate of container.querySelectorAll(selector)) {
      if (candidate.contains?.(element)) continue;
      const text = textFromElement(candidate);
      if (text) return text;
    }
  }
  return "";
}

export function deriveAccessibleFieldLabel(element, document = element?.ownerDocument) {
  if (!element || !document) return "Unlabelled field";

  const candidates = [
    getExplicitLabel(element, document),
    getWrappingLabel(element),
    getAriaLabelledBy(element, document),
    normalizeAccessibleText(element.getAttribute("aria-label")),
    getFieldsetLegend(element),
    getQuestionHeading(element),
    normalizeAccessibleText(element.getAttribute("placeholder")),
    normalizeAccessibleText(element.getAttribute("name")),
    normalizeAccessibleText(element.getAttribute("id")),
  ];
  return candidates.find(Boolean) ?? "Unlabelled field";
}
