import { ACTION_TYPES } from "../../shared/action-types.js";
import { CONTRACT_VERSION } from "../../shared/contracts.js";
import { SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";

const SYSTEM_POLICY = `You are the untrusted planning component of PrivacyFill AI.
You receive only sanitized form metadata. Return only actions allowed by the supplied schema.
Never invent, request, infer, or return personal values. A private fill must reference a PROFILE.* key.
Never submit, click, navigate, upload, execute code, or target a field not present in the request.
Preserve requestId and snapshotId exactly, set planner to remote, and require confirmation.`;

const ACTION_SCHEMA = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "target", "profileKey"],
      properties: {
        action: { const: ACTION_TYPES.FILL_PRIVATE },
        target: { type: "string" },
        profileKey: { type: "string", enum: SUPPORTED_PROFILE_KEYS },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "target", "value"],
      properties: {
        action: { const: ACTION_TYPES.SELECT },
        target: { type: "string" },
        value: { type: "string" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "target", "checked"],
      properties: {
        action: { const: ACTION_TYPES.CHECK },
        target: { type: "string" },
        checked: { type: "boolean" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "target"],
      properties: {
        action: { const: ACTION_TYPES.FOCUS },
        target: { type: "string" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["action", "reason"],
      properties: {
        action: { const: ACTION_TYPES.REQUEST_CONFIRMATION },
        reason: { type: "string" },
      },
    },
  ],
};

export const REMOTE_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion", "requestId", "snapshotId", "planner", "actions", "requiresConfirmation",
  ],
  properties: {
    contractVersion: { const: CONTRACT_VERSION },
    requestId: { type: "string" },
    snapshotId: { type: "string" },
    planner: { const: "remote" },
    actions: { type: "array", maxItems: 100, items: ACTION_SCHEMA },
    requiresConfirmation: { const: true },
  },
});

export class RemotePlannerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RemotePlannerError";
    this.code = code;
  }
}

function extractOutputText(responseBody) {
  if (typeof responseBody?.output_text === "string") return responseBody.output_text;
  if (!Array.isArray(responseBody?.output)) return null;

  for (const item of responseBody.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

export function createRemotePlanner({ apiKey, model, endpoint, timeoutMs = 8_000, fetchImpl = fetch }) {
  return async function remotePlanner(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: SYSTEM_POLICY,
          input: JSON.stringify(request),
          text: {
            format: {
              type: "json_schema",
              name: "privacyfill_action_plan",
              strict: true,
              schema: REMOTE_PLAN_SCHEMA,
            },
          },
          max_output_tokens: 3_000,
          store: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new RemotePlannerError("REMOTE_HTTP_ERROR", "Remote planner returned a non-success status.");
      }

      const responseBody = await response.json();
      const outputText = extractOutputText(responseBody);
      if (!outputText) {
        throw new RemotePlannerError("REMOTE_OUTPUT_MISSING", "Remote planner returned no structured output.");
      }

      try {
        return JSON.parse(outputText);
      } catch {
        throw new RemotePlannerError("REMOTE_OUTPUT_INVALID_JSON", "Remote planner output was not valid JSON.");
      }
    } catch (error) {
      if (error instanceof RemotePlannerError) throw error;
      if (error?.name === "AbortError") {
        throw new RemotePlannerError("REMOTE_TIMEOUT", "Remote planner timed out.");
      }
      throw new RemotePlannerError("REMOTE_UNAVAILABLE", "Remote planner could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
  };
}
