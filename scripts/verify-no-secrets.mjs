import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)));
const git = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: root, encoding: "utf8" },
);

if (git.status !== 0) {
  console.error(git.stderr || "Unable to enumerate repository files.");
  process.exit(1);
}

const textExtensions = new Set([
  ".js", ".mjs", ".cjs", ".json", ".md", ".html", ".css", ".txt", ".yml", ".yaml",
]);

const secretPatterns = [
  { name: "OpenAI-style secret", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  {
    name: "populated OPENAI_API_KEY",
    pattern: /OPENAI_API_KEY\s*=\s*[A-Za-z0-9_-]{12,}/g,
  },
];

const findings = [];

for (const relativePath of git.stdout.split(/\r?\n/).filter(Boolean)) {
  if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;

  const absolutePath = path.join(root, relativePath);
  const contents = await readFile(absolutePath, "utf8");

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(contents)) findings.push({ relativePath, name });
  }
}

if (findings.length > 0) {
  console.error("Potential secrets detected:");
  for (const finding of findings) {
    console.error(`- ${finding.relativePath}: ${finding.name}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed across ${git.stdout.split(/\r?\n/).filter(Boolean).length} repository files.`);
