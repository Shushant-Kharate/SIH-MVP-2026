import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const sourceRoot = path.join(repositoryRoot, "extension");
const outputRoot = path.join(repositoryRoot, "dist", "extension");

function assertSafeOutputPath(target) {
  const allowedParent = `${path.join(repositoryRoot, "dist")}${path.sep}`;
  if (!target.startsWith(allowedParent) || path.basename(target) !== "extension") {
    throw new Error(`Refusing to modify unexpected build path: ${target}`);
  }
}

async function copyStaticFiles() {
  await cp(path.join(sourceRoot, "manifest.json"), path.join(outputRoot, "manifest.json"));
  await cp(path.join(sourceRoot, "pages"), path.join(outputRoot, "pages"), {
    recursive: true,
    filter(source) {
      return !source.endsWith(".js");
    },
  });
}

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

async function verifyBrowserBundle() {
  const forbidden = ["OPENAI_API_KEY", "api.openai.com"];
  const credentialPattern = /\bsk-[A-Za-z0-9_-]{20,}\b/;
  const files = await listFiles(outputRoot);

  for (const file of files) {
    if (!/\.(?:js|json|html|css)$/i.test(file)) continue;
    const content = await readFile(file, "utf8");
    for (const marker of forbidden) {
      if (content.includes(marker)) {
        throw new Error(`Forbidden secret/provider marker '${marker}' found in ${file}`);
      }
    }
    if (credentialPattern.test(content)) {
      throw new Error(`Potential API credential found in ${file}`);
    }
  }
}

assertSafeOutputPath(outputRoot);
await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, "pages"), { recursive: true });
await copyStaticFiles();

await build({
  entryPoints: {
    background: path.join(sourceRoot, "src", "background.js"),
    "pages/popup": path.join(sourceRoot, "src", "popup.js"),
    "pages/profile": path.join(sourceRoot, "src", "profile.js"),
  },
  bundle: true,
  entryNames: "[dir]/[name]",
  format: "esm",
  logLevel: "info",
  minify: false,
  outdir: outputRoot,
  platform: "browser",
  sourcemap: false,
  target: ["chrome120"],
});

await build({
  entryPoints: [path.join(sourceRoot, "src", "content.js")],
  bundle: true,
  entryNames: "content",
  format: "iife",
  logLevel: "info",
  minify: false,
  outdir: outputRoot,
  platform: "browser",
  sourcemap: false,
  target: ["chrome120"],
});

await verifyBrowserBundle();
console.log(`Extension built successfully at ${outputRoot}`);
