import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { afterEach, describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { createApp } from "../../server/index.js";
import { createConfig } from "../../server/config.js";
import { validatePlanningResponse } from "../../shared/contracts.js";
import { SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { createSafeScanResult, scanDocument } from "../../extension/src/core/field-scanner.js";
import { createPlanningRequest } from "../../extension/src/core/sanitizer.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";
import { createSanitizedPlanningRequest } from "../fixtures/sanitized-form.js";

const servers = [];

async function startTestServer(options = {}) {
  const app = createApp({ logWriter: () => {}, ...options });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function requestForDemo(name, requestId) {
  const html = await readFile(new URL(`../../demo/${name}`, import.meta.url), "utf8");
  const scan = createSafeScanResult(scanDocument(parseHTML(html).document));
  return createPlanningRequest({
    scanResult: scan,
    availableProfileKeys: SUPPORTED_PROFILE_KEYS,
    requestId,
  });
}

async function postJson(baseUrl, body, headers = {}) {
  return fetch(`${baseUrl}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("planner HTTP API", () => {
  it("reports fallback health without an API key", async () => {
    const baseUrl = await startTestServer({
      config: createConfig({ PLANNER_MODE: "fallback", PORT: "8787" }),
    });
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "privacyfill-planner",
      planner: "fallback",
      requestedPlanner: "fallback",
      remoteConfigured: false,
    });
  });

  it("returns valid fallback plans for both controlled forms", async () => {
    const baseUrl = await startTestServer();
    const requests = [
      await requestForDemo("scholarship.html", "request-scholarship-http"),
      await requestForDemo("service-registration.html", "request-service-http"),
    ];

    for (const request of requests) {
      const response = await postJson(baseUrl, request, { Origin: "http://localhost:8787" });
      const plan = await response.json();
      assert.equal(response.status, 200);
      assert.equal(validatePlanningResponse(plan).ok, true);
      assert.equal(plan.requestId, request.requestId);
      assert.equal(plan.snapshotId, request.snapshotId);
      assert.equal(plan.planner, "fallback");
    }
  });

  it("rejects raw profiles, malformed JSON, oversized bodies, and foreign origins safely", async () => {
    const baseUrl = await startTestServer();
    const rawValue = FAKE_PROFILE[SUPPORTED_PROFILE_KEYS[0]];
    const unsafe = { ...createSanitizedPlanningRequest(), profile: FAKE_PROFILE };
    const invalidResponse = await postJson(baseUrl, unsafe);
    const invalidText = await invalidResponse.text();
    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidText.includes(rawValue), false);

    const malformedResponse = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken",
    });
    assert.equal(malformedResponse.status, 400);
    assert.equal((await malformedResponse.json()).error.code, "INVALID_JSON");

    const oversizedResponse = await fetch(`${baseUrl}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(40_000) }),
    });
    assert.equal(oversizedResponse.status, 413);
    assert.equal((await oversizedResponse.json()).error.code, "REQUEST_TOO_LARGE");

    const originResponse = await postJson(baseUrl, createSanitizedPlanningRequest(), {
      Origin: "https://example.com",
    });
    assert.equal(originResponse.status, 403);
    assert.equal((await originResponse.json()).error.code, "ORIGIN_NOT_ALLOWED");
  });

  it("rate limits repeated planning requests", async () => {
    const baseUrl = await startTestServer({
      config: createConfig({ RATE_LIMIT_PER_MINUTE: "2" }),
    });

    assert.equal((await postJson(baseUrl, createSanitizedPlanningRequest())).status, 200);
    assert.equal((await postJson(baseUrl, createSanitizedPlanningRequest())).status, 200);
    const response = await postJson(baseUrl, createSanitizedPlanningRequest());
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, "RATE_LIMITED");
  });

  it("returns a valid fallback plan when the remote provider fails", async () => {
    const config = createConfig({
      PLANNER_MODE: "remote",
      OPENAI_API_KEY: "fictional-api-key",
      OPENAI_MODEL: "fictional-model",
    });
    const baseUrl = await startTestServer({
      config,
      fetchImpl: async () => { throw new Error("simulated network failure"); },
    });

    const request = createSanitizedPlanningRequest();
    const response = await postJson(baseUrl, request);
    const plan = await response.json();
    assert.equal(response.status, 200);
    assert.equal(plan.planner, "fallback");
    assert.equal(validatePlanningResponse(plan).ok, true);
  });
});
