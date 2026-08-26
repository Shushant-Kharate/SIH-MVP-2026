const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

function isProtectedStorePage(url) {
  if (url.hostname === "chromewebstore.google.com") return true;
  if (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore")) return true;
  if (url.hostname === "microsoftedge.microsoft.com" && url.pathname.startsWith("/addons")) return true;
  return false;
}

function rejection(code, message) {
  return Object.freeze({ ok: false, code, message });
}

export function getPageEligibility(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return rejection("PAGE_URL_MISSING", "The current tab does not expose a scannable page address.");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return rejection("PAGE_URL_INVALID", "The current tab address is not valid.");
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    return rejection(
      "PAGE_NOT_SUPPORTED",
      "PrivacyFill can scan only normal HTTP or HTTPS webpages selected by the user.",
    );
  }

  if (isProtectedStorePage(url)) {
    return rejection(
      "PAGE_NOT_SUPPORTED",
      "Browser extension stores are protected pages and cannot be scanned.",
    );
  }

  return Object.freeze({
    ok: true,
    protocol: url.protocol,
    origin: url.origin,
  });
}
