const ALLOWED_OUTCOMES = new Set(["accepted", "rejected", "fallback"]);
const ALLOWED_PLANNERS = new Set(["remote", "fallback", "none"]);

function safeToken(value, fallback = "unknown") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 100);
  return normalized || fallback;
}

export function createSafeLogger(write = (line) => console.log(line)) {
  return Object.freeze({
    plan(event) {
      const record = {
        event: "plan_request",
        requestId: safeToken(event.requestId),
        fieldCount: Number.isInteger(event.fieldCount) ? event.fieldCount : 0,
        planner: ALLOWED_PLANNERS.has(event.planner) ? event.planner : "none",
        durationMs: Math.max(0, Math.round(Number(event.durationMs) || 0)),
        outcome: ALLOWED_OUTCOMES.has(event.outcome) ? event.outcome : "rejected",
      };
      if (event.code) record.code = safeToken(event.code);
      write(JSON.stringify(record));
      return record;
    },
  });
}
