import { createWorker, OEM, PSM } from "tesseract.js";

import { UNKNOWN_SENSITIVE } from "../../../shared/pii-taxonomy.js";
import { derivePrivacyLevel } from "../../../shared/privacy-levels.js";
import { minimizeExternalLabel, redactSensitivePatterns } from "../core/label-sanitizer.js";
import { classifyFieldMetadata } from "../core/pii-classifier.js";

const MAX_CANDIDATES = 6;
const MAX_CANDIDATE_AREA_RATIO = 0.18;
const MAX_TOTAL_AREA_RATIO = 0.4;

function normalizeBounds(bounds, width, height) {
  const x = Math.max(0, Math.round(Number(bounds?.x)));
  const y = Math.max(0, Math.round(Number(bounds?.y)));
  const right = Math.min(width, Math.round(Number(bounds?.x) + Number(bounds?.width)));
  const bottom = Math.min(height, Math.round(Number(bounds?.y) + Number(bounds?.height)));
  if (![x, y, right, bottom].every(Number.isFinite) || right - x < 4 || bottom - y < 4) return null;
  return Object.freeze({ x, y, width: right - x, height: bottom - y });
}

export function selectOcrCandidates({ regions, width, height } = {}) {
  if (!Array.isArray(regions) || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new TypeError("Visual regions and screenshot dimensions are required.");
  }
  const imageArea = width * height;
  let selectedArea = 0;
  return regions
    .filter((region) => region?.kind === "text-candidate"
      || (region?.semanticType == null && Number(region?.confidence) < 0.75))
    .map((region) => ({ region, bounds: normalizeBounds(region.pixelBounds, width, height) }))
    .filter(({ bounds }) => bounds && (bounds.width * bounds.height) / imageArea <= MAX_CANDIDATE_AREA_RATIO)
    .sort((left, right) => {
      const leftPriority = left.region.kind === "text-candidate" ? 0 : 1;
      const rightPriority = right.region.kind === "text-candidate" ? 0 : 1;
      return leftPriority - rightPriority || Number(left.region.confidence) - Number(right.region.confidence);
    })
    .flatMap(({ region, bounds }) => {
      const area = bounds.width * bounds.height;
      if (selectedArea + area > imageArea * MAX_TOTAL_AREA_RATIO) return [];
      selectedArea += area;
      return [Object.freeze({ regionId: region.regionId, bounds })];
    })
    .slice(0, MAX_CANDIDATES);
}

async function createBrowserCropper(sourceDataUrl) {
  const bitmap = await createImageBitmap(await (await fetch(sourceDataUrl)).blob());
  return {
    crop(bounds) {
      const canvas = document.createElement("canvas");
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Local OCR crop canvas is unavailable.");
      context.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      const dataUrl = canvas.toDataURL("image/png");
      canvas.width = 1;
      canvas.height = 1;
      return dataUrl;
    },
    dispose() { bitmap.close?.(); },
  };
}

export async function createOfflineOcrWorker({ onProgress = () => {} } = {}) {
  const assetRoot = chrome.runtime.getURL("vendor/tesseract");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${assetRoot}/worker.min.js`,
    corePath: `${assetRoot}/core`,
    langPath: `${assetRoot}/lang`,
    workerBlobURL: false,
    cacheMethod: "none",
    logger(message) {
      onProgress(Object.freeze({ status: String(message?.status ?? "working"), progress: Number(message?.progress) || 0 }));
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  return worker;
}

function safeOcrDetection(candidate, rawText, confidence) {
  const boundedText = String(rawText ?? "").normalize("NFKC").slice(0, 500);
  let classification = classifyFieldMetadata({ label: boundedText });
  if (!classification.category && redactSensitivePatterns(boundedText) !== boundedText.trim().replace(/\s+/g, " ")) {
    classification = {
      category: UNKNOWN_SENSITIVE,
      confidence: 0.9,
      risk: "critical",
      evidence: ["local-pattern-match"],
    };
  }
  const confidenceBucket = confidence >= 80 ? "high" : confidence >= 50 ? "medium" : "low";
  return Object.freeze({
    regionId: candidate.regionId,
    detected: Boolean(classification.category),
    semanticType: classification.category,
    privacyLevel: derivePrivacyLevel(classification),
    risk: classification.risk,
    classificationConfidence: classification.confidence,
    ocrConfidence: confidenceBucket,
    safeLabel: classification.category
      ? minimizeExternalLabel("", classification.category)
      : "Unclassified visual text",
    pixelBounds: candidate.bounds,
    rawTextRetained: false,
  });
}

export async function runSelectiveOcr({
  sourceDataUrl,
  width,
  height,
  regions,
  workerFactory = createOfflineOcrWorker,
  cropperFactory = createBrowserCropper,
  onProgress,
} = {}) {
  if (typeof sourceDataUrl !== "string" || !sourceDataUrl.startsWith("data:image/png;base64,")) {
    throw new TypeError("A local PNG source is required for selective OCR.");
  }
  const candidates = selectOcrCandidates({ regions, width, height });
  if (candidates.length === 0) {
    return Object.freeze({ detections: Object.freeze([]), candidateCount: 0, durationMs: 0, mode: "offline-tesseract-v7" });
  }
  const startedAt = performance.now();
  const cropper = await cropperFactory(sourceDataUrl);
  let worker = null;
  const detections = [];
  try {
    worker = await workerFactory({ onProgress });
    for (const candidate of candidates) {
      let cropDataUrl = cropper.crop(candidate.bounds);
      let rawText = "";
      try {
        const result = await worker.recognize(cropDataUrl, {}, { text: true });
        rawText = String(result?.data?.text ?? "");
        detections.push(safeOcrDetection(candidate, rawText, Number(result?.data?.confidence) || 0));
      } finally {
        cropDataUrl = null;
        rawText = null;
      }
    }
  } finally {
    await worker?.terminate();
    cropper.dispose?.();
  }
  return Object.freeze({
    detections: Object.freeze(detections),
    candidateCount: candidates.length,
    durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10),
    mode: "offline-tesseract-v7",
  });
}
