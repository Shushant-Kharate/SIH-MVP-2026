export const ACTION_TYPES = Object.freeze({
  FILL_PRIVATE: "fill_private",
  SELECT: "select",
  CHECK: "check",
  FOCUS: "focus",
  REQUEST_CONFIRMATION: "request_confirmation",
});

export const ALLOWED_ACTION_TYPES = Object.freeze(Object.values(ACTION_TYPES));

export function isAllowedActionType(value) {
  return ALLOWED_ACTION_TYPES.includes(value);
}
