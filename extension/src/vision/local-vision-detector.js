import { PRIVACY_LEVELS } from "../../../shared/privacy-levels.js";

const MAX_FACE_REGIONS = 8;
const MAX_TEXT_REGIONS = 8;

function isSkinPixel(red, green, blue) {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const rgbRule = red > 95 && green > 40 && blue > 20
    && maximum - minimum > 15 && Math.abs(red - green) > 15
    && red > green && red > blue;
  const cb = 128 - (0.168736 * red) - (0.331264 * green) + (0.5 * blue);
  const cr = 128 + (0.5 * red) - (0.418688 * green) - (0.081312 * blue);
  return rgbRule && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 180;
}

function sourceBounds(bounds, scaleX, scaleY, sourceWidth, sourceHeight) {
  const x = Math.max(0, Math.floor(bounds.x * scaleX));
  const y = Math.max(0, Math.floor(bounds.y * scaleY));
  const right = Math.min(sourceWidth, Math.ceil((bounds.x + bounds.width) * scaleX));
  const bottom = Math.min(sourceHeight, Math.ceil((bounds.y + bounds.height) * scaleY));
  return Object.freeze({ x, y, width: right - x, height: bottom - y });
}

function connectedSkinComponents(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    mask[index] = data[offset + 3] > 0 && isSkinPixel(data[offset], data[offset + 1], data[offset + 2]) ? 1 : 0;
  }
  const seen = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    let cursor = 0;
    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++];
      const x = index % width;
      const y = Math.floor(index / width);
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (neighbor < 0 || neighbor >= mask.length || seen[neighbor] || !mask[neighbor]) continue;
        const neighborX = neighbor % width;
        if (Math.abs(neighborX - x) > 1) continue;
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    components.push({ count, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  return components;
}

export function detectFaceRegions(image, {
  sourceWidth = image?.width,
  sourceHeight = image?.height,
} = {}) {
  const { data, width, height } = image ?? {};
  if (!(data instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height)
    || data.length !== width * height * 4 || width < 1 || height < 1) {
    throw new TypeError("RGBA image data is required for local face detection.");
  }
  const scaleX = sourceWidth / width;
  const scaleY = sourceHeight / height;
  const minimumPixels = Math.max(24, Math.round(width * height * 0.001));
  return connectedSkinComponents(data, width, height)
    .filter((component) => {
      const aspect = component.width / component.height;
      const fill = component.count / (component.width * component.height);
      return component.count >= minimumPixels
        && component.width >= 8 && component.height >= 8
        && aspect >= 0.55 && aspect <= 1.8 && fill >= 0.2;
    })
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_FACE_REGIONS)
    .map((component, index) => Object.freeze({
      regionId: `REGION_FACE_${index + 1}`,
      role: "manual-mask",
      semanticType: null,
      privacyLevel: PRIVACY_LEVELS.BLOCKED,
      confidence: Math.min(0.95, 0.55 + (component.count / (component.width * component.height)) * 0.4),
      risk: "critical",
      kind: "face",
      pixelBounds: sourceBounds(component, scaleX, scaleY, sourceWidth, sourceHeight),
    }));
}

function darkPixel(data, offset) {
  const gray = (data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114);
  return data[offset + 3] > 0 && gray < 145;
}

export function detectTextRegionCandidates(image, {
  sourceWidth = image?.width,
  sourceHeight = image?.height,
} = {}) {
  const { data, width, height } = image ?? {};
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new TypeError("RGBA image data is required for local text-region detection.");
  }
  const activeRows = new Uint8Array(height);
  for (let y = 0; y < height; y += 1) {
    let darkCount = 0;
    for (let x = 0; x < width; x += 1) {
      if (darkPixel(data, ((y * width) + x) * 4)) darkCount += 1;
    }
    const density = darkCount / width;
    activeRows[y] = density >= 0.018 && density <= 0.55 ? 1 : 0;
  }
  const bands = [];
  let start = null;
  for (let y = 0; y <= height; y += 1) {
    if (y < height && activeRows[y]) {
      if (start === null) start = y;
      continue;
    }
    if (start === null) continue;
    if (y - start >= 2) bands.push({ top: Math.max(0, start - 2), bottom: Math.min(height, y + 2) });
    start = null;
  }
  const scaleX = sourceWidth / width;
  const scaleY = sourceHeight / height;
  return bands.flatMap((band) => {
    let minX = width;
    let maxX = -1;
    let count = 0;
    for (let y = band.top; y < band.bottom; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!darkPixel(data, ((y * width) + x) * 4)) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        count += 1;
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = band.bottom - band.top;
    const areaRatio = (boxWidth * boxHeight) / (width * height);
    if (count < 12 || boxWidth < 12 || boxHeight < 3 || areaRatio > 0.2) return [];
    return [{ x: Math.max(0, minX - 3), y: band.top, width: Math.min(width - minX + 3, boxWidth + 6), height: boxHeight }];
  }).slice(0, MAX_TEXT_REGIONS).map((bounds, index) => Object.freeze({
    regionId: `REGION_TEXT_${index + 1}`,
    role: "manual-mask",
    semanticType: null,
    privacyLevel: PRIVACY_LEVELS.VISIBLE,
    confidence: 0.45,
    risk: "low",
    kind: "text-candidate",
    pixelBounds: sourceBounds(bounds, scaleX, scaleY, sourceWidth, sourceHeight),
  }));
}

export function runLocalVisualDetection(image, options) {
  const startedAt = performance.now();
  const faceRegions = detectFaceRegions(image, options);
  const textCandidates = detectTextRegionCandidates(image, options);
  return Object.freeze({
    faceRegions: Object.freeze(faceRegions),
    textCandidates: Object.freeze(textCandidates),
    metrics: Object.freeze({
      faceRegionCount: faceRegions.length,
      textCandidateCount: textCandidates.length,
      durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10),
      mode: "packaged-classical-cv",
    }),
  });
}
