import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const demoDirectory = path.resolve(scriptDirectory, "..", "demo");

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
});

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function resolveDemoPath(url) {
  const parsedUrl = new URL(url, "http://localhost");
  let pathname;

  try {
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch {
    return null;
  }

  if (pathname === "/" || pathname === "/demo") return { redirect: "/demo/" };
  if (!pathname.startsWith("/demo/")) return null;

  const relativePath = pathname.slice("/demo/".length) || "index.html";
  const resolvedPath = path.resolve(demoDirectory, relativePath);
  const allowedPrefix = `${demoDirectory}${path.sep}`;

  if (resolvedPath !== demoDirectory && !resolvedPath.startsWith(allowedPrefix)) return null;
  return { resolvedPath };
}

export function createDemoServer() {
  return http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendText(response, 405, "Method not allowed");
      return;
    }

    const target = resolveDemoPath(request.url ?? "/");
    if (!target) {
      sendText(response, 404, "Not found");
      return;
    }
    if (target.redirect) {
      response.writeHead(302, { Location: target.redirect });
      response.end();
      return;
    }

    try {
      await access(target.resolvedPath);
      const fileStats = await stat(target.resolvedPath);
      if (!fileStats.isFile()) throw new Error("Not a file");

      const extension = path.extname(target.resolvedPath).toLowerCase();
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(target.resolvedPath).pipe(response);
    } catch {
      sendText(response, 404, "Not found");
    }
  });
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const requestedPort = Number.parseInt(process.env.PORT ?? "8787", 10);
  const port = Number.isInteger(requestedPort) ? requestedPort : 8787;
  const server = createDemoServer();

  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    const activePort = typeof address === "object" && address ? address.port : port;
    console.log(`PrivacyFill demo forms: http://localhost:${activePort}/demo/`);
  });
}
