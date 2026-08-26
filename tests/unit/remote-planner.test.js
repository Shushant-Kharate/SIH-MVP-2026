import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRemotePlanner, RemotePlannerError } from "../../server/planners/remote-planner.js";
import { createSanitizedPlanningRequest } from "../fixtures/sanitized-form.js";
import { createValidPlan } from "../fixtures/valid-plan.js";

function remoteOptions(fetchImpl) {
  return {
    apiKey: "fictional-api-key",
    model: "fictional-model",
    endpoint: "https://api.openai.invalid/v1/responses",
    timeoutMs: 500,
    fetchImpl,
  };
}

describe("remote planner adapter", () => {
  it("sends the sanitized request with a strict response schema", async () => {
    const request = createSanitizedPlanningRequest();
    const expected = { ...createValidPlan(), planner: "remote" };
    let captured;
    const planner = createRemotePlanner(remoteOptions(async (_url, options) => {
      captured = options;
      return new Response(JSON.stringify({ output_text: JSON.stringify(expected) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await planner(request);
    const body = JSON.parse(captured.body);

    assert.deepEqual(result, expected);
    assert.deepEqual(JSON.parse(body.input), request);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(captured.headers.Authorization, "Bearer fictional-api-key");
  });

  it("extracts output text from the REST response output array", async () => {
    const expected = { ...createValidPlan(), planner: "remote" };
    const planner = createRemotePlanner(remoteOptions(async () => new Response(JSON.stringify({
      output: [{ content: [{ type: "output_text", text: JSON.stringify(expected) }] }],
    }), { status: 200 })));

    assert.deepEqual(await planner(createSanitizedPlanningRequest()), expected);
  });

  it("returns typed safe errors for HTTP and malformed-output failures", async () => {
    const planners = [
      createRemotePlanner(remoteOptions(async () => new Response("{}", { status: 503 }))),
      createRemotePlanner(remoteOptions(async () => new Response(JSON.stringify({ output_text: "not-json" }), {
        status: 200,
      }))),
    ];

    for (const planner of planners) {
      await assert.rejects(
        planner(createSanitizedPlanningRequest()),
        (error) => error instanceof RemotePlannerError && error.code.startsWith("REMOTE_"),
      );
    }
  });
});
