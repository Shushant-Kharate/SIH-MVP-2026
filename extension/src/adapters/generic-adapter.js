import { deriveAccessibleFieldLabel } from "../core/accessible-name.js";

export const genericFormAdapter = Object.freeze({
  id: "generic",

  matches() {
    return true;
  },

  findControls(document) {
    return Array.from(document.querySelectorAll("input, select, textarea"));
  },

  deriveLabel(element, document) {
    return deriveAccessibleFieldLabel(element, document);
  },

  deriveRequired(element) {
    return element.required === true || element.getAttribute("aria-required") === "true";
  },

  getFormContainer(element) {
    return element.closest("form");
  },

  getUnsupportedControlCount() {
    return 0;
  },
});
