import { genericFormAdapter } from "./generic-adapter.js";
import { googleFormsAdapter } from "./google-forms-adapter.js";

const FORM_ADAPTERS = Object.freeze([
  googleFormsAdapter,
  genericFormAdapter,
]);

export function selectFormAdapter(document, locationLike) {
  return FORM_ADAPTERS.find((adapter) => adapter.matches(document, locationLike))
    ?? genericFormAdapter;
}
