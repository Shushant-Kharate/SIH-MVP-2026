import { PRIVACY_LEVELS, isPrivacyLevel } from "../../../shared/privacy-levels.js";
import { verifyVisualCoverage } from "./visual-coverage-checker.js";

const DEFAULT_PADDING = 8;
const MAX_PADDING = 64;
const ALWAYS_OPAQUE_KINDS = new Set(["face", "password", "otp", "cvv", "captcha"]);

export class VisualRedactionError extends Error {
  constructor(code, message, coverage = null) {
    super(message);
    this.name = "VisualRedactionError";
    this.code = code;
    this.coverage = coverage;
  }
}

function normalizeBounds(bounds, width, height) {
  const x = Math.round(Number(bounds?.x));
  const y = Math.round(Number(bounds?.y));
  const boxWidth = Math.round(Number(bounds?.width));
  const boxHeight = Math.round(Number(bounds?.height));
  if (![x, y, boxWidth, boxHeight].every(Number.isFinite) || boxWidth < 1 || boxHeight < 1) return null;
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(width, x + boxWidth);
  const bottom = Math.min(height, y + boxHeight);
  if (right <= left || bottom <= top) return null;
  return Object.freeze({ x: left, y: top, width: right - left, height: bottom - top });
}

function intersect(first, second) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function translate(bounds, crop) {
  return Object.freeze({
    x: bounds.x - crop.x,
    y: bounds.y - crop.y,
    width: bounds.width,
    height: bounds.height,
  });
}

function pad(bounds, amount, width, height) {
  return normalizeBounds({
    x: bounds.x - amount,
    y: bounds.y - amount,
    width: bounds.width + (amount * 2),
    height: bounds.height + (amount * 2),
  }, width, height);
}

function isSensitive(region) {
  return ALWAYS_OPAQUE_KINDS.has(region?.kind)
    || region?.risk === "critical"
    || (isPrivacyLevel(region?.privacyLevel) && region.privacyLevel !== PRIVACY_LEVELS.VISIBLE);
}

function sensitivePortion(bounds, region, policy) {
  const mayRevealSuffix = policy.privateMaskMode === "partial"
    && region.privacyLevel === PRIVACY_LEVELS.PLACEHOLDER
    && region.allowPartialReveal === true;
  if (!mayRevealSuffix) return bounds;
  const revealFraction = Math.min(0.5, Math.max(0.05, Number(policy.partialRevealFraction) || 0.2));
  return Object.freeze({
    ...bounds,
    width: Math.max(1, Math.ceil(bounds.width * (1 - revealFraction))),
  });
}

export function createVisualRedactionPlan({
  width,
  height,
  visualSnapshot,
  additionalRegions = [],
  cropBounds,
  policy = {},
} = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError("Source image dimensions are invalid.");
  }
  if (!visualSnapshot || !Array.isArray(visualSnapshot.regions) || !Array.isArray(additionalRegions)) {
    throw new TypeError("A local visual snapshot and additional-region list are required.");
  }

  const crop = normalizeBounds(cropBounds ?? { x: 0, y: 0, width, height }, width, height);
  if (!crop) throw new TypeError("The selected crop is invalid.");
  const requestedPadding = Number(policy.padding ?? DEFAULT_PADDING);
  const padding = Math.min(MAX_PADDING, Math.max(
    0,
    Number.isFinite(requestedPadding) ? Math.round(requestedPadding) : DEFAULT_PADDING,
  ));
  const regions = [...visualSnapshot.regions, ...additionalRegions];
  const requiredRegions = [];
  const masks = [];
  let excludedByCropCount = 0;

  for (const region of regions) {
    if (!isSensitive(region)) continue;
    const sourceBounds = normalizeBounds(region.pixelBounds, width, height);
    if (!sourceBounds || typeof region.regionId !== "string") {
      throw new TypeError("A sensitive visual region is invalid.");
    }
    const clippedToCrop = intersect(sourceBounds, crop);
    if (!clippedToCrop) {
      excludedByCropCount += 1;
      continue;
    }
    const outputBounds = translate(clippedToCrop, crop);
    const requiredBounds = sensitivePortion(outputBounds, region, policy);
    const maskBounds = pad(requiredBounds, padding, crop.width, crop.height);
    requiredRegions.push(Object.freeze({ regionId: region.regionId, bounds: requiredBounds }));
    masks.push(Object.freeze({
      maskId: `MASK_${region.regionId}`,
      regionId: region.regionId,
      kind: region.kind ?? "pii",
      mode: "opaque",
      bounds: maskBounds,
      color: ALWAYS_OPAQUE_KINDS.has(region.kind) ? "#111827" : "#172033",
    }));
  }

  return Object.freeze({
    sourceScreenId: visualSnapshot.screenId,
    sourceWidth: width,
    sourceHeight: height,
    crop,
    outputWidth: crop.width,
    outputHeight: crop.height,
    requiredRegions: Object.freeze(requiredRegions),
    masks: Object.freeze(masks),
    excludedByCropCount,
  });
}

async function browserRasterize({ sourceDataUrl, plan }) {
  if (!globalThis.fetch || !globalThis.createImageBitmap || !globalThis.document?.createElement) {
    throw new VisualRedactionError("VISUAL_RASTERIZER_UNAVAILABLE", "Local screenshot redaction is unavailable.");
  }
  const response = await fetch(sourceDataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = plan.outputWidth;
  canvas.height = plan.outputHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close?.();
    throw new VisualRedactionError("VISUAL_CANVAS_UNAVAILABLE", "A private redaction canvas could not be created.");
  }

  try {
    context.drawImage(
      bitmap,
      plan.crop.x,
      plan.crop.y,
      plan.crop.width,
      plan.crop.height,
      0,
      0,
      plan.outputWidth,
      plan.outputHeight,
    );
    const appliedMasks = plan.masks.map((mask) => {
      context.fillStyle = mask.color;
      context.fillRect(mask.bounds.x, mask.bounds.y, mask.bounds.width, mask.bounds.height);
      return Object.freeze({
        regionId: mask.regionId,
        mode: mask.mode,
        bounds: mask.bounds,
        applied: true,
      });
    });
    return {
      sanitizedDataUrl: canvas.toDataURL("image/png"),
      appliedMasks,
      dispose() {
        canvas.width = 1;
        canvas.height = 1;
      },
    };
  } finally {
    bitmap.close?.();
  }
}

export async function redactCapture(capture, options = {}) {
  if (typeof capture?.originalDataUrl !== "string"
    || !capture.originalDataUrl.startsWith("data:image/png;base64,")) {
    throw new VisualRedactionError("ORIGINAL_CAPTURE_MISSING", "The temporary original capture is unavailable.");
  }
  const plan = createVisualRedactionPlan({
    width: capture.width,
    height: capture.height,
    visualSnapshot: capture.visualSnapshot,
    additionalRegions: options.additionalRegions,
    cropBounds: options.cropBounds,
    policy: options.policy,
  });
  const rasterize = options.rasterize ?? browserRasterize;
  let candidate;
  try {
    candidate = await rasterize({ sourceDataUrl: capture.originalDataUrl, plan });
    if (typeof candidate?.sanitizedDataUrl !== "string"
      || !candidate.sanitizedDataUrl.startsWith("data:image/png;base64,")
      || candidate.sanitizedDataUrl === capture.originalDataUrl) {
      throw new VisualRedactionError("SANITIZED_IMAGE_INVALID", "A distinct sanitized PNG was not produced.");
    }
    const coverage = verifyVisualCoverage({
      width: plan.outputWidth,
      height: plan.outputHeight,
      requiredRegions: plan.requiredRegions,
      appliedMasks: candidate.appliedMasks,
    });
    if (!coverage.ok) {
      throw new VisualRedactionError(
        "VISUAL_COVERAGE_FAILED",
        "At least one sensitive screen region was not fully covered.",
        coverage,
      );
    }
    return Object.freeze({
      sanitizedDataUrl: candidate.sanitizedDataUrl,
      width: plan.outputWidth,
      height: plan.outputHeight,
      maskCount: plan.masks.length,
      coverage,
      redactionPlan: plan,
    });
  } catch (error) {
    if (error instanceof VisualRedactionError) throw error;
    throw new VisualRedactionError("VISUAL_REDACTION_FAILED", "The screenshot could not be redacted locally.");
  } finally {
    candidate?.dispose?.();
    candidate = null;
  }
}
