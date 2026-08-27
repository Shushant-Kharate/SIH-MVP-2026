import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const forbiddenVisualArtifacts = [
  "originalDataUrl",
  "sanitizedDataUrl",
  "visualSnapshot",
  "pixelBounds",
  "appliedMasks",
];

async function source(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("visual context network boundary", () => {
  it("keeps original, sanitized and coordinate artifacts out of every current planner boundary", async () => {
    const networkBoundary = (await Promise.all([
      source("extension/src/core/sanitizer.js"),
      source("extension/src/core/planner-client.js"),
      source("extension/src/background.js"),
      source("server/planners/planner-service.js"),
      source("server/routes/plan.js"),
    ])).join("\n");

    for (const artifact of forbiddenVisualArtifacts) {
      assert.equal(networkBoundary.includes(artifact), false, `${artifact} reached a planner boundary`);
    }
  });
});
