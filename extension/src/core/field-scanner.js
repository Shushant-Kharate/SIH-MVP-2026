import { CONTRACT_LIMITS } from "../../../shared/contracts.js";
import { selectFormAdapter } from "../adapters/adapter-registry.js";
import { classifyFieldMetadata } from "./pii-classifier.js";
import { minimizeExternalLabel, minimizeExternalOptions } from "./label-sanitizer.js";
import { createSnapshotId } from "./snapshot.js";

const IGNORED_INPUT_TYPES = new Set(["button", "file", "hidden", "image", "reset", "submit"]);
const SUPPORTED_INPUT_TYPES = new Set([
  "checkbox", "date", "email", "number", "password", "radio", "search", "tel", "text", "url",
]);

function normalizeWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function limitText(value, maximum = CONTRACT_LIMITS.MAX_LABEL_LENGTH) {
  return normalizeWhitespace(value).slice(0, maximum);
}

export function deriveFieldLabel(element, document = element.ownerDocument) {
  return selectFormAdapter(document).deriveLabel(element, document);
}

function isSemanticallyVisible(element) {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest("[hidden], [aria-hidden='true'], [data-privacyfill-owned]")) return false;

  const style = (element.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
  if (style.includes("display:none") || style.includes("visibility:hidden")) return false;

  const view = element.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    const computed = view.getComputedStyle(element);
    if (computed?.display === "none" || computed?.visibility === "hidden") return false;
  }
  return true;
}

function getControlType(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  return (element.getAttribute("type") || "text").toLowerCase();
}

function isSupportedElement(element) {
  const tag = element.tagName.toLowerCase();
  if (!["input", "select", "textarea"].includes(tag)) return false;
  if (element.disabled || !isSemanticallyVisible(element)) return false;
  if (tag !== "input") return true;

  const type = getControlType(element);
  return !IGNORED_INPUT_TYPES.has(type) && SUPPORTED_INPUT_TYPES.has(type);
}

function getSafeOptions(element) {
  if (element.tagName.toLowerCase() !== "select") return [];
  return Array.from(element.querySelectorAll("option"))
    .map((option) => limitText(option.textContent, CONTRACT_LIMITS.MAX_OPTION_LENGTH))
    .filter(Boolean)
    .slice(0, CONTRACT_LIMITS.MAX_OPTIONS_PER_FIELD);
}

function formIdFor(element, formIds, adapter) {
  const form = adapter.getFormContainer(element);
  if (!form) return "FORM_0";
  if (!formIds.has(form)) formIds.set(form, `FORM_${formIds.size + 1}`);
  return formIds.get(form);
}

function buildFieldEntry(element, index, formIds, document, externalPage, adapter) {
  const tag = element.tagName.toLowerCase();
  const rawMetadata = {
    fieldId: `FIELD_${index + 1}`,
    formId: formIdFor(element, formIds, adapter),
    tag,
    type: getControlType(element),
    label: adapter.deriveLabel(element, document),
    name: limitText(element.getAttribute("name")),
    id: limitText(element.getAttribute("id")),
    placeholder: limitText(element.getAttribute("placeholder")),
    autocomplete: limitText(element.getAttribute("autocomplete")),
    required: adapter.deriveRequired(element, document),
    disabled: element.disabled === true,
    readonly: element.readOnly === true || element.hasAttribute("readonly"),
    options: getSafeOptions(element),
  };
  const classification = classifyFieldMetadata(rawMetadata);
  const metadata = externalPage
    ? {
        ...rawMetadata,
        label: minimizeExternalLabel(rawMetadata.label, classification.category),
        options: minimizeExternalOptions(rawMetadata.options),
      }
    : rawMetadata;

  return {
    ...metadata,
    classification,
  };
}

export function scanDocument(document, { externalPage = false, locationLike } = {}) {
  if (!document?.querySelectorAll) throw new TypeError("A DOM document is required.");

  const adapter = selectFormAdapter(document, locationLike);
  const candidates = adapter.findControls(document)
    .filter(isSupportedElement)
    .slice(0, CONTRACT_LIMITS.MAX_FIELDS);
  const formIds = new Map();
  const elementByFieldId = new Map();
  const fields = candidates.map((element, index) => {
    const field = buildFieldEntry(element, index, formIds, document, externalPage, adapter);
    elementByFieldId.set(field.fieldId, element);
    return field;
  });

  return {
    adapterId: adapter.id,
    privacyMode: externalPage ? "external" : "controlled",
    unsupportedControlCount: adapter.getUnsupportedControlCount(document),
    snapshotId: createSnapshotId(fields),
    fields,
    elementByFieldId,
  };
}

export function createSafeScanResult(scan) {
  const fields = scan.fields.map((field) => ({
    fieldId: field.fieldId,
    formId: field.formId,
    tag: field.tag,
    type: field.type,
    label: field.label,
    required: field.required,
    readonly: field.readonly,
    options: [...field.options],
    suggestedProfileKey: field.classification.category,
    confidence: field.classification.confidence,
    risk: field.classification.risk,
    evidence: [...field.classification.evidence],
  }));

  return {
    adapterId: scan.adapterId ?? "generic",
    privacyMode: scan.privacyMode === "external" ? "external" : "controlled",
    unsupportedControlCount: Number.isInteger(scan.unsupportedControlCount)
      ? Math.max(0, scan.unsupportedControlCount)
      : 0,
    snapshotId: scan.snapshotId,
    fieldCount: fields.length,
    privateFieldCount: fields.filter((field) => field.suggestedProfileKey?.startsWith("PROFILE.")).length,
    blockedFieldCount: fields.filter((field) => field.suggestedProfileKey === "UNKNOWN_SENSITIVE").length,
    fields,
  };
}
