import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

async function copyPackagedOcrAssets() {
  const manifestPath = path.join(sourceRoot, "vendor", "tesseract-assets.json");
  const assetManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const vendorRoot = path.join(outputRoot, "vendor", "tesseract");
  for (const asset of assetManifest.assets) {
    const source = path.join(repositoryRoot, "node_modules", ...asset.source.split("/"));
    const target = path.join(vendorRoot, ...asset.target.split("/"));
    const contents = await readFile(source);
    const digest = createHash("sha256").update(contents).digest("hex");
    const sourceStat = await stat(source);
    if (digest !== asset.sha256 || sourceStat.size !== asset.bytes) {
      throw new Error(`Packaged OCR asset verification failed: ${asset.source}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  await cp(manifestPath, path.join(vendorRoot, "ASSET_MANIFEST.json"));
  const licenseRoot = path.join(vendorRoot, "licenses");
  await mkdir(licenseRoot, { recursive: true });
  await cp(path.join(repositoryRoot, "node_modules", "tesseract.js", "LICENSE.md"), path.join(licenseRoot, "tesseract.js-Apache-2.0.txt"));
  await cp(path.join(repositoryRoot, "node_modules", "tesseract.js-core", "LICENSE"), path.join(licenseRoot, "tesseract.js-core-Apache-2.0.txt"));
  await cp(path.join(repositoryRoot, "node_modules", "@tesseract.js-data", "eng", "package.json"), path.join(licenseRoot, "tesseract-eng-package-metadata.json"));
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
await copyPackagedOcrAssets();

await build({
  entryPoints: {
    background: path.join(sourceRoot, "src", "background.js"),
    "pages/popup": path.join(sourceRoot, "src", "popup.js"),
    "pages/profile": path.join(sourceRoot, "src", "profile.js"),
    "pages/inspector": path.join(sourceRoot, "src", "inspector.js"),
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
