const DEFAULT_TTL_MS = 60_000;
const MAX_IMAGE_LENGTH = 48 * 1024 * 1024;

function secureSessionId() {
  if (globalThis.crypto?.randomUUID) return `VISUAL_${crypto.randomUUID()}`;
  throw new Error("Secure visual session identifiers are unavailable.");
}

function isPngDataUrl(value) {
  return typeof value === "string"
    && value.startsWith("data:image/png;base64,")
    && value.length <= MAX_IMAGE_LENGTH;
}

function validateSession(session) {
  if (!isPngDataUrl(session?.originalDataUrl)
    || !isPngDataUrl(session?.redaction?.sanitizedDataUrl)
    || session.originalDataUrl === session.redaction.sanitizedDataUrl) {
    throw new TypeError("Distinct original and sanitized PNGs are required.");
  }
  if (!Number.isInteger(session?.tabId) || !Number.isInteger(session?.windowId)
    || typeof session?.pageToken !== "string") {
    throw new TypeError("Selected-tab correlation is invalid.");
  }
  if (!session?.visualSnapshot || !Array.isArray(session.visualSnapshot.regions)
    || session?.redaction?.coverage?.ok !== true) {
    throw new TypeError("A coverage-verified visual snapshot is required.");
  }
}

export class VisualSessionBroker {
  #entry = null;
  #timer = null;
  #ttlMs;
  #schedule;
  #cancelSchedule;
  #createId;
  #now;

  constructor({
    ttlMs = DEFAULT_TTL_MS,
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelSchedule = (timer) => clearTimeout(timer),
    createId = secureSessionId,
    now = () => Date.now(),
  } = {}) {
    this.#ttlMs = Math.max(1_000, Math.min(5 * 60_000, Number(ttlMs) || DEFAULT_TTL_MS));
    this.#schedule = schedule;
    this.#cancelSchedule = cancelSchedule;
    this.#createId = createId;
    this.#now = now;
  }

  create(session) {
    validateSession(session);
    this.clear();
    const sessionId = this.#createId();
    const expiresAt = this.#now() + this.#ttlMs;
    this.#entry = { sessionId, session: { ...session, expiresAt } };
    this.#timer = this.#schedule(() => this.clear(), this.#ttlMs);
    return Object.freeze({ sessionId, expiresAt });
  }

  take(sessionId) {
    if (!this.#entry || this.#entry.sessionId !== sessionId) return null;
    const session = this.#entry.session;
    this.#entry = null;
    if (this.#timer !== null) this.#cancelSchedule(this.#timer);
    this.#timer = null;
    return session;
  }

  clear(sessionId = null) {
    if (sessionId && this.#entry?.sessionId !== sessionId) return false;
    const removed = this.#entry !== null;
    if (this.#timer !== null) this.#cancelSchedule(this.#timer);
    this.#timer = null;
    this.#entry = null;
    return removed;
  }

  hasSession() {
    return this.#entry !== null;
  }
}
