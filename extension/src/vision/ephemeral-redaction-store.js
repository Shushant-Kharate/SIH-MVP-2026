const DEFAULT_TTL_MS = 60_000;
const MAX_TTL_MS = 5 * 60_000;

function validateRedaction(redaction) {
  if (typeof redaction?.sanitizedDataUrl !== "string"
    || !redaction.sanitizedDataUrl.startsWith("data:image/png;base64,")) {
    throw new TypeError("A sanitized in-memory PNG is required.");
  }
  if (redaction?.coverage?.ok !== true || !Number.isInteger(redaction?.maskCount)) {
    throw new TypeError("Verified redaction coverage is required.");
  }
  if (Object.hasOwn(redaction, "originalDataUrl")) {
    throw new TypeError("Original capture pixels cannot enter the sanitized store.");
  }
}

export class EphemeralRedactionStore {
  #entry = null;
  #timer = null;
  #ttlMs;
  #schedule;
  #cancelSchedule;
  #onExpire;

  constructor({
    ttlMs = DEFAULT_TTL_MS,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer),
    onExpire = () => {},
  } = {}) {
    this.#ttlMs = Math.min(MAX_TTL_MS, Math.max(1_000, Number(ttlMs) || DEFAULT_TTL_MS));
    this.#schedule = schedule;
    this.#cancelSchedule = cancelSchedule;
    this.#onExpire = onExpire;
  }

  replace(redaction) {
    validateRedaction(redaction);
    this.clear();
    this.#entry = { ...redaction };
    this.#timer = this.#schedule(() => {
      this.clear();
      this.#onExpire();
    }, this.#ttlMs);
    return this.getMetadata();
  }

  getMetadata() {
    if (!this.#entry) return null;
    return Object.freeze({
      width: this.#entry.width,
      height: this.#entry.height,
      maskCount: this.#entry.maskCount,
      requiredCount: this.#entry.coverage.requiredCount,
      coveredCount: this.#entry.coverage.coveredCount,
      coveragePassed: this.#entry.coverage.ok,
    });
  }

  consume() {
    if (!this.#entry) return null;
    const result = this.#entry;
    this.#entry = null;
    if (this.#timer !== null) this.#cancelSchedule(this.#timer);
    this.#timer = null;
    return result;
  }

  clear() {
    if (this.#timer !== null) this.#cancelSchedule(this.#timer);
    this.#timer = null;
    this.#entry = null;
  }

  hasResult() {
    return this.#entry !== null;
  }
}
