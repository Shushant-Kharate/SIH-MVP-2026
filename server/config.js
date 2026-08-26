const DEFAULT_PORT = 8787;
const DEFAULT_RATE_LIMIT = 30;
const DEFAULT_REMOTE_TIMEOUT_MS = 8_000;

function parseInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizeMode(value) {
  return value === "remote" ? "remote" : "fallback";
}

export function createConfig(environment = process.env) {
  const requestedPlanner = normalizeMode(environment.PLANNER_MODE);
  const openAiApiKey = environment.OPENAI_API_KEY?.trim() ?? "";
  const openAiModel = environment.OPENAI_MODEL?.trim() ?? "";
  const remoteConfigured = Boolean(openAiApiKey && openAiModel);

  return Object.freeze({
    port: parseInteger(environment.PORT, DEFAULT_PORT, { min: 1, max: 65_535 }),
    requestedPlanner,
    effectivePlanner: requestedPlanner === "remote" && remoteConfigured ? "remote" : "fallback",
    remoteConfigured,
    openAiApiKey,
    openAiModel,
    openAiEndpoint: "https://api.openai.com/v1/responses",
    remoteTimeoutMs: parseInteger(environment.PLANNER_TIMEOUT_MS, DEFAULT_REMOTE_TIMEOUT_MS, {
      min: 500,
      max: 30_000,
    }),
    rateLimitPerMinute: parseInteger(environment.RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT, {
      min: 1,
      max: 1_000,
    }),
  });
}
