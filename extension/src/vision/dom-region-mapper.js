import { derivePrivacyLevel } from "../../../shared/privacy-levels.js";

const MAX_PIXEL_SCALE = 16;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function roundedCss(value) {
  return Math.round(value * 1000) / 1000;
}

function clippedScale(value) {
  return Math.min(MAX_PIXEL_SCALE, Math.max(0.25, positiveNumber(value, 1)));
}

function freezeBounds(bounds) {
  return Object.freeze({
    x: roundedCss(bounds.x),
    y: roundedCss(bounds.y),
    width: roundedCss(bounds.width),
    height: roundedCss(bounds.height),
  });
}

function freezePixelBounds(bounds) {
  return Object.freeze({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  });
}

function deriveRole(field) {
  if (field.tag === "textarea") return "textbox";
  if (field.tag === "select") return "combobox";
  if (field.type === "checkbox" || field.type === "radio") return field.type;
  return "textbox";
}

function elementIsRendered(element, windowLike) {
  if (!element || element.isConnected === false || element.hidden === true) return false;
  if (element.getAttribute?.("aria-hidden") === "true") return false;
  const computed = windowLike?.getComputedStyle?.(element);
  if (computed?.display === "none" || computed?.visibility === "hidden") return false;
  if (finiteNumber(computed?.opacity, 1) <= 0) return false;
  return typeof element.getBoundingClientRect === "function";
}

function getViewport(windowLike, screenshotSize) {
  const visualViewport = windowLike?.visualViewport;
  const width = positiveNumber(visualViewport?.width, positiveNumber(windowLike?.innerWidth, 1));
  const height = positiveNumber(visualViewport?.height, positiveNumber(windowLike?.innerHeight, 1));
  const originX = Math.max(0, finiteNumber(visualViewport?.offsetLeft));
  const originY = Math.max(0, finiteNumber(visualViewport?.offsetTop));
  const devicePixelRatio = clippedScale(windowLike?.devicePixelRatio);
  const visualScale = clippedScale(visualViewport?.scale);
  const inferredScale = clippedScale(devicePixelRatio * visualScale);
  const screenshotWidth = positiveNumber(screenshotSize?.width, width * inferredScale);
  const screenshotHeight = positiveNumber(screenshotSize?.height, height * inferredScale);

  return Object.freeze({
    width: roundedCss(width),
    height: roundedCss(height),
    scrollX: roundedCss(finiteNumber(windowLike?.scrollX)),
    scrollY: roundedCss(finiteNumber(windowLike?.scrollY)),
    devicePixelRatio,
    visualScale,
    pixelWidth: Math.round(screenshotWidth),
    pixelHeight: Math.round(screenshotHeight),
    originX,
    originY,
    scaleX: screenshotWidth / width,
    scaleY: screenshotHeight / height,
  });
}

function mapElementBounds(element, viewport) {
  const rect = element.getBoundingClientRect();
  const left = finiteNumber(rect?.left);
  const top = finiteNumber(rect?.top);
  const width = Math.max(0, finiteNumber(rect?.width, finiteNumber(rect?.right) - left));
  const height = Math.max(0, finiteNumber(rect?.height, finiteNumber(rect?.bottom) - top));
  const right = left + width;
  const bottom = top + height;
  const viewportRight = viewport.originX + viewport.width;
  const viewportBottom = viewport.originY + viewport.height;
  const clippedLeft = Math.max(left, viewport.originX);
  const clippedTop = Math.max(top, viewport.originY);
  const clippedRight = Math.min(right, viewportRight);
  const clippedBottom = Math.min(bottom, viewportBottom);

  if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return null;

  const cssBounds = {
    x: clippedLeft - viewport.originX,
    y: clippedTop - viewport.originY,
    width: clippedRight - clippedLeft,
    height: clippedBottom - clippedTop,
  };
  return Object.freeze({
    cssBounds: freezeBounds(cssBounds),
    pixelBounds: freezePixelBounds({
      x: cssBounds.x * viewport.scaleX,
      y: cssBounds.y * viewport.scaleY,
      width: cssBounds.width * viewport.scaleX,
      height: cssBounds.height * viewport.scaleY,
    }),
  });
}

export function createLocalVisualSnapshot(scan, {
  windowLike = globalThis.window,
  screenshotSize,
} = {}) {
  if (!scan || !Array.isArray(scan.fields) || !(scan.elementByFieldId instanceof Map)) {
    throw new TypeError("A live DOM scan with a field registry is required.");
  }

  const viewportWithLocalMapping = getViewport(windowLike, screenshotSize);
  const {
    originX: _originX,
    originY: _originY,
    scaleX: _scaleX,
    scaleY: _scaleY,
    ...safeViewport
  } = viewportWithLocalMapping;
  const regions = [];

  for (const field of scan.fields) {
    const element = scan.elementByFieldId.get(field.fieldId);
    if (!elementIsRendered(element, windowLike)) continue;
    const mappedBounds = mapElementBounds(element, viewportWithLocalMapping);
    if (!mappedBounds) continue;

    regions.push(Object.freeze({
      regionId: `REGION_${field.fieldId}`,
      fieldId: field.fieldId,
      role: deriveRole(field),
      semanticType: field.classification?.category ?? null,
      privacyLevel: derivePrivacyLevel(field.classification),
      confidence: Math.max(0, Math.min(1, finiteNumber(field.classification?.confidence))),
      risk: field.classification?.risk ?? "low",
      cssBounds: mappedBounds.cssBounds,
      pixelBounds: mappedBounds.pixelBounds,
    }));
  }

  return Object.freeze({
    screenId: `SCREEN_${scan.snapshotId}`,
    sourceSnapshotId: scan.snapshotId,
    viewport: Object.freeze(safeViewport),
    regionCount: regions.length,
    regions: Object.freeze(regions),
  });
}
