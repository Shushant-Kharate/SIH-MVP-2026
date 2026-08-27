import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const outputRoot = fileURLToPath(new URL("../../dist/extension/", import.meta.url));

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

describe("built Chrome extension", () => {
  it("contains the loadable Manifest V3 entry points", async () => {
    const files = (await listFiles(outputRoot))
      .map((file) => path.relative(outputRoot, file).replaceAll("\\", "/"));

    for (const expected of [
      "manifest.json",
      "background.js",
      "content.js",
      "pages/common.css",
      "pages/popup.css",
      "pages/popup.html",
      "pages/popup.js",
      "pages/inspector.css",
      "pages/inspector.html",
      "pages/inspector.js",
      "pages/profile.css",
      "pages/profile.html",
      "pages/profile.js",
    ]) assert.equal(files.includes(expected), true, expected);
  });

  it("contains no API credential or provider endpoint markers", async () => {
    const forbidden = [/OPENAI_API_KEY/, /api\.openai\.com/, /\bsk-[A-Za-z0-9_-]{20,}\b/];

    for (const file of await listFiles(outputRoot)) {
      if (!/\.(?:js|json|html|css)$/i.test(file)) continue;
      const content = await readFile(file, "utf8");
      for (const pattern of forbidden) assert.doesNotMatch(content, pattern, file);
    }
  });

  it("keeps session storage restricted to trusted extension contexts", async () => {
    const background = await readFile(path.join(outputRoot, "background.js"), "utf8");

    assert.match(background, /TRUSTED_CONTEXTS/);
    assert.match(background, /storage\.session/);
    assert.doesNotMatch(background, /storage\.local/);
  });
});
