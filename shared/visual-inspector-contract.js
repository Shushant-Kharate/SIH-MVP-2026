import { isPrivacyLevel } from "./privacy-levels.js";
import { isSupportedProfileKey, UNKNOWN_SENSITIVE } from "./pii-taxonomy.js";

export const VISUAL_INSPECTOR_PREVIEW_VERSION = "visual-inspector-preview-v1";

function safeBounds(bounds) {
  const output = {
    x: Number(bounds?.x),
    y: Number(bounds?.y),
    width: Number(bounds?.width),
    height: Number(bounds?.height),
  };
  if (!Object.values(output).every(Number.isInteger)
    || output.x < 0 || output.y < 0 || output.width < 1 || output.height < 1) {
    throw new TypeError("Visual preview bounds are invalid.");
  }
  return Object.freeze(output);
}

function safeIdentifier(value, prefix) {
  if (typeof value !== "string" || !value.startsWith(prefix)
    || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new TypeError("A visual preview identifier is invalid.");
  }
  return value;
}

function safeSemanticType(value) {
  if (value === null || value === UNKNOWN_SENSITIVE || isSupportedProfileKey(value)) return value;
  throw new TypeError("A visual semantic category is invalid.");
}

function safeInteger(value, { minimum = 0 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new TypeError("A visual preview count is invalid.");
  }
  return number;
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object"
    && Object.keys(value).every((key) => allowed.includes(key));
}

export function createVisualInspectorPreview({ visualSnapshot, redaction, regions }) {
  if (!visualSnapshot || !Array.isArray(regions) || redaction?.coverage?.ok !== true) {
    throw new TypeError("Coverage-verified inspector state is required.");
  }
  const safeRegions = regions.map((region) => {
    if (!isPrivacyLevel(region.privacyLevel)) throw new TypeError("A visual privacy level is invalid.");
    return Object.freeze({
      regionId: safeIdentifier(region.regionId, region.regionId.startsWith("MANUAL_") ? "MANUAL_" : "REGION_"),
      role: ["textbox", "combobox", "checkbox", "radio", "manual-mask"].includes(region.role)
        ? region.role
        : "manual-mask",
      semanticType: safeSemanticType(region.semanticType ?? null),
      privacyLevel: region.privacyLevel,
      pixelBounds: safeBounds(region.pixelBounds),
    });
  });
  const width = safeInteger(redaction.width, { minimum: 1 });
  const height = safeInteger(redaction.height, { minimum: 1 });
  const maskCount = safeInteger(redaction.maskCount);
  const requiredCount = safeInteger(redaction.coverage.requiredCount);
  const coveredCount = safeInteger(redaction.coverage.coveredCount);
  if (coveredCount !== requiredCount || maskCount < requiredCount) {
    throw new TypeError("The visual preview coverage summary is inconsistent.");
  }
  return Object.freeze({
    version: VISUAL_INSPECTOR_PREVIEW_VERSION,
    networkEnabled: false,
    screenId: safeIdentifier(visualSnapshot.screenId, "SCREEN_"),
    viewport: Object.freeze({
      width,
      height,
    }),
    regions: Object.freeze(safeRegions),
    redaction: Object.freeze({
      maskCount,
      requiredCount,
      coveredCount,
      allRegionsCovered: redaction.coverage.ok === true,
    }),
  });
}

export function assertVisualInspectorPreview(value) {
  const allowedRoot = ["version", "networkEnabled", "screenId", "viewport", "regions", "redaction"];
  if (!value || typeof value !== "object"
    || Object.keys(value).some((key) => !allowedRoot.includes(key))
    || value.version !== VISUAL_INSPECTOR_PREVIEW_VERSION
    || value.networkEnabled !== false) {
    throw new TypeError("The visual inspector preview contract is invalid.");
  }
  if (!hasOnlyKeys(value.viewport, ["width", "height"])
    || !hasOnlyKeys(value.redaction, ["maskCount", "requiredCount", "coveredCount", "allRegionsCovered"])
    || !Array.isArray(value.regions)
    || value.regions.some((region) => (
      !hasOnlyKeys(region, ["regionId", "role", "semanticType", "privacyLevel", "pixelBounds"])
      || !hasOnlyKeys(region.pixelBounds, ["x", "y", "width", "height"])
    ))) {
    throw new TypeError("The visual inspector preview contains unknown properties.");
  }
  return createVisualInspectorPreview({
    visualSnapshot: { screenId: value.screenId },
    redaction: {
      width: value.viewport?.width,
      height: value.viewport?.height,
      maskCount: value.redaction?.maskCount,
      coverage: {
        ok: value.redaction?.allRegionsCovered === true,
        requiredCount: value.redaction?.requiredCount,
        coveredCount: value.redaction?.coveredCount,
      },
    },
    regions: value.regions,
  });
}
