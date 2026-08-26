import { MESSAGE_TYPES } from "../../shared/message-types.js";
import { PROFILE_KEYS, SUPPORTED_PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { validateProfileValues } from "./core/profile-validation.js";

const DEMO_PROFILE = Object.freeze({
  [PROFILE_KEYS.NAME]: "Aarav Demo Sharma",
  [PROFILE_KEYS.EMAIL]: "aarav.privacy@example.test",
  [PROFILE_KEYS.PHONE]: "9876543210",
  [PROFILE_KEYS.ADDRESS]: "42 Privacy Test Road, Pune",
  [PROFILE_KEYS.DOB]: "2002-04-18",
  [PROFILE_KEYS.AADHAAR]: "234567890123",
  [PROFILE_KEYS.PAN]: "ABCDE1234F",
});

const FIELD_IDS = Object.freeze({
  [PROFILE_KEYS.NAME]: "profile-name",
  [PROFILE_KEYS.EMAIL]: "profile-email",
  [PROFILE_KEYS.PHONE]: "profile-phone",
  [PROFILE_KEYS.ADDRESS]: "profile-address",
  [PROFILE_KEYS.DOB]: "profile-dob",
  [PROFILE_KEYS.AADHAAR]: "profile-aadhaar",
  [PROFILE_KEYS.PAN]: "profile-pan",
});

const ERROR_IDS = Object.freeze({
  [PROFILE_KEYS.NAME]: "error-name",
  [PROFILE_KEYS.EMAIL]: "error-email",
  [PROFILE_KEYS.PHONE]: "error-phone",
  [PROFILE_KEYS.ADDRESS]: "error-address",
  [PROFILE_KEYS.DOB]: "error-dob",
  [PROFILE_KEYS.AADHAAR]: "error-aadhaar",
  [PROFILE_KEYS.PAN]: "error-pan",
});

const form = document.querySelector("#profile-form");
const message = document.querySelector("#profile-message");
const useDemoButton = document.querySelector("#use-demo-profile");
const deleteButton = document.querySelector("#delete-profile");

async function sendMessage(type, payload = undefined) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    return {
      ok: false,
      data: null,
      error: { code: "EXTENSION_RUNTIME_UNAVAILABLE", message: "Build and open this page from the Chrome extension." },
    };
  }
  return chrome.runtime.sendMessage({ type, ...(payload ? { payload } : {}) });
}

function setMessage(text, tone = "neutral") {
  message.textContent = text;
  message.dataset.tone = tone;
}

function collectValues() {
  return Object.fromEntries(SUPPORTED_PROFILE_KEYS.map((key) => [
    key,
    document.getElementById(FIELD_IDS[key]).value,
  ]));
}

function clearErrors() {
  for (const key of SUPPORTED_PROFILE_KEYS) {
    const input = document.getElementById(FIELD_IDS[key]);
    document.getElementById(ERROR_IDS[key]).textContent = "";
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
  }
}

function renderErrors(errors) {
  clearErrors();
  let firstInvalid = null;

  for (const key of SUPPORTED_PROFILE_KEYS) {
    if (!errors[key]) continue;
    const input = document.getElementById(FIELD_IDS[key]);
    const errorElement = document.getElementById(ERROR_IDS[key]);
    errorElement.textContent = errors[key];
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", ERROR_IDS[key]);
    firstInvalid ??= input;
  }

  firstInvalid?.focus();
}

function fillForm(values) {
  for (const key of SUPPORTED_PROFILE_KEYS) {
    document.getElementById(FIELD_IDS[key]).value = values[key] ?? "";
  }
}

async function refreshStatus() {
  const response = await sendMessage(MESSAGE_TYPES.PROFILE_GET_STATUS);
  if (!response?.ok) {
    setMessage(response?.error?.message ?? "Session status is unavailable.", "error");
    return;
  }

  const status = response.data;
  setMessage(
    status.hasProfile
      ? `Session profile ready with ${status.availableProfileKeys.length} private categories.`
      : "No session profile is currently stored.",
    status.hasProfile ? "success" : "neutral",
  );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const validation = validateProfileValues(collectValues());
  if (!validation.ok) {
    renderErrors(validation.errors);
    setMessage("Review the highlighted fields. Nothing was saved.", "error");
    return;
  }

  setMessage("Saving values to this Chrome session…", "neutral");
  const response = await sendMessage(MESSAGE_TYPES.PROFILE_SAVE, { values: validation.values });

  if (!response?.ok) {
    if (response?.error?.details) renderErrors(response.error.details);
    setMessage(response?.error?.message ?? "The profile could not be saved.", "error");
    return;
  }

  form.reset();
  clearErrors();
  setMessage(
    `Session profile saved with ${response.data.availableProfileKeys.length} private categories. Input fields were cleared.`,
    "success",
  );
});

form.addEventListener("reset", () => {
  window.setTimeout(clearErrors, 0);
});

useDemoButton.addEventListener("click", () => {
  fillForm(DEMO_PROFILE);
  clearErrors();
  setMessage("Fictional demo values loaded. Review them, then save to this session.", "neutral");
});

deleteButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Delete all profile values stored in this browser session?");
  if (!confirmed) return;

  const response = await sendMessage(MESSAGE_TYPES.PROFILE_CLEAR);
  form.reset();
  clearErrors();
  setMessage(
    response?.ok ? "Session profile deleted." : (response?.error?.message ?? "Profile deletion failed."),
    response?.ok ? "success" : "error",
  );
});

document.querySelector("#profile-dob").max = new Date().toISOString().slice(0, 10);
await refreshStatus();
