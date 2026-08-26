export function createRateLimiter({ limit = 30, windowMs = 60_000, now = Date.now } = {}) {
  const clients = new Map();

  return function rateLimit(request, response, next) {
    const timestamp = now();
    const key = request.ip || request.socket.remoteAddress || "local";
    const existing = clients.get(key);
    const entry = !existing || timestamp >= existing.resetAt
      ? { count: 0, resetAt: timestamp + windowMs }
      : existing;

    entry.count += 1;
    clients.set(key, entry);

    response.setHeader("RateLimit-Limit", String(limit));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
    response.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1_000)));

    if (entry.count > limit) {
      response.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many planning requests. Try again shortly." },
      });
      return;
    }
    next();
  };
}
