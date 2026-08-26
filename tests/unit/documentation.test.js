import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const requiredDocuments = [
  "README.md",
  "ARCHITECTURE.md",
  "THREAT_MODEL.md",
  "DEMO_SCRIPT.md",
  "TEST_MATRIX.md",
  "demo-evidence/README.md",
  "tests/manual/acceptance-checklist.md",
];

function readDocument(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("handoff package contains every required non-empty document", () => {
  for (const relativePath of requiredDocuments) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    assert.equal(existsSync(absolutePath), true, `${relativePath} should exist`);
    assert.ok(statSync(absolutePath).size > 200, `${relativePath} should contain useful guidance`);
  }
});

test("README covers the Chunk 10 onboarding requirements", () => {
  const readme = readDocument("README.md");
  for (const expectedText of [
    "## Architecture at a glance",
    "## Requirements",
    "npm ci",
    "npm run server",
    "npm run build:extension",
    "Load unpacked",
    "Use fictional demo profile",
    "scholarship.html",
    "service-registration.html",
    "## Optional remote planning",
    "## Known MVP limitations",
    "## Research acknowledgement and novelty boundary",
  ]) {
    assert.ok(readme.includes(expectedText), `README should include: ${expectedText}`);
  }
});

test("relative Markdown links resolve to repository files", () => {
  const markdownLink = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const relativeDocument of requiredDocuments) {
    const content = readDocument(relativeDocument);
    const documentDirectory = path.dirname(path.join(repositoryRoot, relativeDocument));

    for (const match of content.matchAll(markdownLink)) {
      const target = match[1].trim().replace(/^<|>$/g, "").split("#", 1)[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const decodedTarget = decodeURIComponent(target);
      const absoluteTarget = path.resolve(documentDirectory, decodedTarget);
      assert.equal(
        existsSync(absoluteTarget),
        true,
        `${relativeDocument} link should resolve: ${target}`,
      );
    }
  }
});

test("every documented npm run command names an existing package script", () => {
  const npmRunPattern = /npm run ([a-zA-Z0-9:_-]+)/g;
  for (const relativeDocument of requiredDocuments) {
    const content = readDocument(relativeDocument);
    for (const match of content.matchAll(npmRunPattern)) {
      assert.ok(
        Object.hasOwn(packageJson.scripts, match[1]),
        `${relativeDocument} references missing npm script: ${match[1]}`,
      );
    }
  }
});
