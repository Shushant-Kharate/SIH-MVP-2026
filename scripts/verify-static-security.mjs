import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const extensionSource = path.join(repositoryRoot, "extension");
const extensionBuild = path.join(repositoryRoot, "dist", "extension");
const findings = [];
const verifiedVendorAssets = new Set();

function runGit(args) {
  return spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
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

function addFinding(file, rule) {
  findings.push({ file: path.relative(repositoryRoot, file).replaceAll("\\", "/"), rule });
}

const vendorManifestPath = path.join(extensionSource, "vendor", "tesseract-assets.json");
const vendorManifest = JSON.parse(await readFile(vendorManifestPath, "utf8"));
for (const asset of vendorManifest.assets) {
  const builtAsset = path.join(extensionBuild, "vendor", "tesseract", asset.target);
  const contents = await readFile(builtAsset);
  const digest = createHash("sha256").update(contents).digest("hex");
  if (contents.byteLength !== asset.bytes || digest !== asset.sha256) {
    addFinding(builtAsset, "packaged OCR asset differs from its pinned byte count or SHA-256");
  } else {
    verifiedVendorAssets.add(path.resolve(builtAsset));
  }
}

const ignoredEnvironment = runGit(["check-ignore", "--quiet", ".env"]);
if (ignoredEnvironment.status !== 0) addFinding(path.join(repositoryRoot, ".gitignore"), ".env is not ignored");

const exampleIgnored = runGit(["check-ignore", "--quiet", ".env.example"]);
if (exampleIgnored.status === 0) addFinding(path.join(repositoryRoot, ".gitignore"), ".env.example is ignored");

const manifestPath = path.join(extensionSource, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (JSON.stringify(manifest).includes("<all_urls>")) addFinding(manifestPath, "broad <all_urls> permission");
if (manifest.manifest_version !== 3) addFinding(manifestPath, "extension is not Manifest V3");
if (Object.hasOwn(manifest, "externally_connectable")) addFinding(manifestPath, "externally connectable surface");

const expectedPermissions = ["activeTab", "scripting", "storage"];
if (JSON.stringify([...(manifest.permissions ?? [])].sort()) !== JSON.stringify(expectedPermissions.sort())) {
  addFinding(manifestPath, "permissions differ from activeTab, scripting and storage allowlist");
}
const expectedPersistentHosts = ["http://localhost:8787/*"];
if (JSON.stringify(manifest.host_permissions ?? []) !== JSON.stringify(expectedPersistentHosts)) {
  addFinding(manifestPath, "persistent host permissions exceed the localhost planner/demo boundary");
}
if ((manifest.optional_host_permissions ?? []).length > 0) {
  addFinding(manifestPath, "optional persistent host permissions are present");
}

if ((manifest.content_scripts ?? []).length > 0) {
  addFinding(manifestPath, "static content script is registered; selected-tab injection must remain on demand");
}
const expectedExtensionCsp = "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' data: blob:; img-src 'self' data: blob:; object-src 'self'";
if (manifest.content_security_policy?.extension_pages !== expectedExtensionCsp) {
  addFinding(manifestPath, "extension page content security policy exceeds the packaged local OCR boundary");
}

const injectorPath = path.join(extensionSource, "src", "core", "content-injector.js");
const injectorSource = await readFile(injectorPath, "utf8");
if (!/files:\s*\["content\.js"\]/.test(injectorSource)) {
  addFinding(injectorPath, "on-demand injection does not use the packaged content script");
}
if (!/allFrames:\s*false/.test(injectorSource)) {
  addFinding(injectorPath, "on-demand injection is not restricted to the top frame");
}
if (/\bfunc\s*:/.test(injectorSource) || /\bworld\s*:\s*["']MAIN["']/.test(injectorSource)) {
  addFinding(injectorPath, "on-demand injection uses inline code or the page main world");
}

const codePatterns = [
  { rule: "dynamic eval", pattern: /\beval\s*\(/ },
  { rule: "dynamic Function constructor", pattern: /\bnew\s+Function\s*\(/ },
  { rule: "remote script source", pattern: /<script[^>]+src=["']https?:\/\//i },
  { rule: "page-wide body text collection", pattern: /document\.body\.(?:innerText|textContent)/ },
  { rule: "full-page HTML collection", pattern: /document\.documentElement\.(?:innerHTML|outerHTML)/ },
  { rule: "browser history access", pattern: /chrome\.history\b/ },
  { rule: "browser cookie access", pattern: /chrome\.cookies\b/ },
  { rule: "Chrome debugger access", pattern: /chrome\.debugger\b/ },
];
const screenshotPattern = /captureVisibleTab\s*\(/;
const providerPatterns = [
  { rule: "OpenAI credential variable in extension", pattern: /OPENAI_API_KEY/ },
  { rule: "provider endpoint in extension", pattern: /api\.openai\.com/ },
  { rule: "OpenAI-style credential in extension", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
];

for (const directory of [extensionSource, extensionBuild]) {
  for (const file of await listFiles(directory)) {
    if (!/\.(?:js|json|html|css)$/i.test(file)) continue;
    const contents = await readFile(file, "utf8");
    const relativeFile = path.relative(directory, file).replaceAll("\\", "/");
    const screenshotAllowed = directory === extensionSource
      ? relativeFile === "src/vision/screen-capture.js"
      : relativeFile === "pages/popup.js";
    if (screenshotPattern.test(contents) && !screenshotAllowed) {
      addFinding(file, "tab screenshot capture outside the explicit popup workflow");
    }
    for (const { rule, pattern } of codePatterns) {
      const isVerifiedEmscriptenAsset = verifiedVendorAssets.has(path.resolve(file));
      const isRequiredRuntimeConstruct = rule === "dynamic eval" || rule === "dynamic Function constructor";
      if (pattern.test(contents) && !(isVerifiedEmscriptenAsset && isRequiredRuntimeConstruct)) {
        addFinding(file, rule);
      }
    }
    for (const { rule, pattern } of providerPatterns) {
      if (pattern.test(contents)) addFinding(file, rule);
    }
  }
}

const screenCapturePath = path.join(extensionSource, "src", "vision", "screen-capture.js");
const screenCaptureSource = await readFile(screenCapturePath, "utf8");
if (!/tabsApi\.captureVisibleTab\(tab\.windowId,\s*\{\s*format:\s*["']png["']\s*\}\)/.test(screenCaptureSource)) {
  addFinding(screenCapturePath, "visible-tab capture is not restricted to the selected window and PNG format");
}
const popupSource = await readFile(path.join(extensionSource, "src", "popup.js"), "utf8");
if (!/analyzeScreenButton\.addEventListener\(["']click["'],\s*analyzeVisibleScreen\)/.test(popupSource)) {
  addFinding(path.join(extensionSource, "src", "popup.js"), "visible-tab capture lacks an explicit popup click action");
}

const visualArtifactAllowlist = new Map([
  ["originalDataUrl", new Set([
    "src/popup.js",
    "src/inspector.js",
    "src/privacy/visual-redactor.js",
    "src/vision/ephemeral-capture-store.js",
    "src/vision/ephemeral-redaction-store.js",
    "src/vision/screen-capture.js",
    "src/vision/visual-session-broker.js",
  ])],
  ["sanitizedDataUrl", new Set([
    "src/popup.js",
    "src/inspector.js",
    "src/privacy/visual-redactor.js",
    "src/vision/ephemeral-redaction-store.js",
    "src/vision/visual-session-broker.js",
  ])],
]);
for (const file of await listFiles(extensionSource)) {
  if (!file.endsWith(".js")) continue;
  const relativeFile = path.relative(extensionSource, file).replaceAll("\\", "/");
  const contents = await readFile(file, "utf8");
  for (const [artifact, allowedFiles] of visualArtifactAllowlist) {
    if (contents.includes(artifact) && !allowedFiles.has(relativeFile)) {
      addFinding(file, `${artifact} escaped the local visual lifecycle`);
    }
  }
}
const visualRedactorPath = path.join(extensionSource, "src", "privacy", "visual-redactor.js");
const visualRedactorSource = await readFile(visualRedactorPath, "utf8");
if (!/verifyVisualCoverage\s*\(/.test(visualRedactorSource)
  || !/VISUAL_COVERAGE_FAILED/.test(visualRedactorSource)) {
  addFinding(visualRedactorPath, "sanitized output is not coverage-gated");
}
const selectiveOcrPath = path.join(extensionSource, "src", "vision", "selective-ocr.js");
const selectiveOcrSource = await readFile(selectiveOcrPath, "utf8");
for (const required of [
  /chrome\.runtime\.getURL\(["']vendor\/tesseract["']\)/,
  /workerBlobURL:\s*false/,
  /cacheMethod:\s*["']none["']/,
  /MAX_CANDIDATES\s*=\s*6/,
  /MAX_TOTAL_AREA_RATIO\s*=\s*0\.4/,
]) {
  if (!required.test(selectiveOcrSource)) addFinding(selectiveOcrPath, "offline selective OCR invariant is missing");
}
if (/https?:\/\//.test(selectiveOcrSource)) {
  addFinding(selectiveOcrPath, "OCR source contains a remote runtime or model URL");
}

if (findings.length > 0) {
  console.error("Static security verification failed:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.rule}`);
  process.exit(1);
}

console.log("Static security verification passed for source and built extension files.");
