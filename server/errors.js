export class SafeHttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "SafeHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createSafeErrorBody(code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { error };
}
