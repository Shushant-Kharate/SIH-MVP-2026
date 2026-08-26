import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createDemoServer } from "../../scripts/serve-demo.mjs";

let server;
let baseUrl;

before(async () => {
  server = createDemoServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("controlled demo server", () => {
  it("redirects the root to the demo landing page", async () => {
    const response = await fetch(`${baseUrl}/`, { redirect: "manual" });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/demo/");
  });

  it("serves the landing page, both forms and their assets", async () => {
    const expected = [
      ["/demo/", "text/html", "Controlled Demo Forms"],
      ["/demo/scholarship.html", "text/html", "National Scholarship Application"],
      ["/demo/service-registration.html", "text/html", "Citizen Service Registration"],
      ["/demo/demo.css", "text/css", ".form-layout"],
      ["/demo/demo.js", "text/javascript", "event.preventDefault()"],
    ];

    for (const [pathname, contentType, marker] of expected) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200, pathname);
      assert.match(response.headers.get("content-type"), new RegExp(contentType));
      assert.match(await response.text(), new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("sets defensive headers and disables caching", async () => {
    const response = await fetch(`${baseUrl}/demo/scholarship.html`);

    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy"), /form-action 'self'/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });

  it("rejects unsupported methods and non-demo paths", async () => {
    const postResponse = await fetch(`${baseUrl}/demo/`, { method: "POST" });
    const missingResponse = await fetch(`${baseUrl}/package.json`);

    assert.equal(postResponse.status, 405);
    assert.equal(postResponse.headers.get("allow"), "GET, HEAD");
    assert.equal(missingResponse.status, 404);
  });
});
