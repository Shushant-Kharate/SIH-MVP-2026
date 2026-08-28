import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const extensionSource = path.join(repositoryRoot, "extension");
const extensionBuild = path.join(repositoryRoot, "dist", "extension");
const findings = [];

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

const ignoredEnvironment = runGit(["check-ignore", "--quiet", ".env"]);
if (ignoredEnvironment.status !== 0) addFinding(path.join(repositoryRoot, ".gitignore"), ".env is not ignored");

const exampleIgnored = runGit(["check-ignore", "--quiet", ".env.example"]);
if (exampleIgnored.status === 0) addFinding(path.join(repositoryRoot, ".gitignore"), ".env.example is ignored");

const manifestPath = path.join(extensionSource, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (JSON.stringify(manifest).includes("<all_urls>")) addFinding(manifestPath, "broad <all_urls> permission");
if (manifest.manifest_version !== 3) addFinding(manifestPath, "extension is not Manifest V3");
if (Object.hasOwn(manifest, "externally_connectable")) addFinding(manifestPath, "externally connectable surface");

const codePatterns = [
  { rule: "dynamic eval", pattern: /\beval\s*\(/ },
  { rule: "dynamic Function constructor", pattern: /\bnew\s+Function\s*\(/ },
  { rule: "remote script source", pattern: /<script[^>]+src=["']https?:\/\//i },
];
const providerPatterns = [
  { rule: "OpenAI credential variable in extension", pattern: /OPENAI_API_KEY/ },
  { rule: "provider endpoint in extension", pattern: /api\.openai\.com/ },
  { rule: "OpenAI-style credential in extension", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
];

for (const directory of [extensionSource, extensionBuild]) {
  for (const file of await listFiles(directory)) {
    if (!/\.(?:js|json|html|css)$/i.test(file)) continue;
    const contents = await readFile(file, "utf8");
    for (const { rule, pattern } of codePatterns) {
      if (pattern.test(contents)) addFinding(file, rule);
    }
    for (const { rule, pattern } of providerPatterns) {
      if (pattern.test(contents)) addFinding(file, rule);
    }
  }
}

if (findings.length > 0) {
  console.error("Static security verification failed:");
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.rule}`);
  process.exit(1);
}

console.log("Static security verification passed for source and built extension files.");
