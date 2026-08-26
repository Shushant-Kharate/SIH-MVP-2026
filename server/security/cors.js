const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function isAllowedOrigin(origin) {
  return origin === undefined || EXTENSION_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin);
}

export function localCors(request, response, next) {
  const origin = request.get("Origin");
  if (!isAllowedOrigin(origin)) {
    response.status(403).json({
      error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." },
    });
    return;
  }

  response.setHeader("Vary", "Origin");
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
}
