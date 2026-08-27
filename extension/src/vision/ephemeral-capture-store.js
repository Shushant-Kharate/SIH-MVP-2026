const DEFAULT_TTL_MS = 60_000;
const MAX_TTL_MS = 5 * 60_000;

function defaultCaptureId() {
  if (globalThis.crypto?.randomUUID) return `CAPTURE_${crypto.randomUUID()}`;
  if (globalThis.crypto?.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return `CAPTURE_${Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("")}`;
  }
  throw new Error("Secure capture identifiers are unavailable.");
}

function validateCapture(capture) {
  if (typeof capture?.originalDataUrl !== "string"
    || !capture.originalDataUrl.startsWith("data:image/png;base64,")) {
    throw new TypeError("An in-memory PNG capture is required.");
  }
  if (!Number.isInteger(capture.width) || !Number.isInteger(capture.height)
    || capture.width < 1 || capture.height < 1) {
    throw new TypeError("Capture dimensions are invalid.");
  }
  if (!capture.visualSnapshot || !Array.isArray(capture.visualSnapshot.regions)) {
    throw new TypeError("A correlated local visual snapshot is required.");
  }
}

export class EphemeralCaptureStore {
  #entry = null;
  #timer = null;
  #ttlMs;
  #now;
  #schedule;
  #cancelSchedule;
  #createCaptureId;
  #onExpire;

  constructor({
    ttlMs = DEFAULT_TTL_MS,
    now = () => Date.now(),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer),
    createCaptureId = defaultCaptureId,
    onExpire = () => {},
  } = {}) {
    this.#ttlMs = Math.min(MAX_TTL_MS, Math.max(1_000, Number(ttlMs) || DEFAULT_TTL_MS));
    this.#now = now;
    this.#schedule = schedule;
    this.#cancelSchedule = cancelSchedule;
    this.#createCaptureId = createCaptureId;
    this.#onExpire = onExpire;
  }

  replace(capture) {
    validateCapture(capture);
    this.clear();
    const createdAt = this.#now();
    this.#entry = {
      ...capture,
      captureId: this.#createCaptureId(),
      createdAt,
      expiresAt: createdAt + this.#ttlMs,
    };
    this.#timer = this.#schedule(() => {
      const expiredId = this.#entry?.captureId;
      this.clear();
      if (expiredId) this.#onExpire(expiredId);
    }, this.#ttlMs);
    return this.getMetadata();
  }

  getMetadata() {
    if (!this.#entry) return null;
    return Object.freeze({
      captureId: this.#entry.captureId,
      width: this.#entry.width,
      height: this.#entry.height,
      regionCount: this.#entry.visualSnapshot.regions.length,
      createdAt: this.#entry.createdAt,
      expiresAt: this.#entry.expiresAt,
    });
  }

  consume(captureId) {
    if (!this.#entry || this.#entry.captureId !== captureId) return null;
    const consumed = this.#entry;
    this.#entry = null;
    if (this.#timer !== null) this.#cancelSchedule(this.#timer);
    this.#timer = null;
    return consumed;
  }

  clear() {
    if (this.#timer !== null) this.#cancelSchedule(this.#timer);
    this.#timer = null;
    this.#entry = null;
  }

  hasCapture() {
    return this.#entry !== null;
  }
}
