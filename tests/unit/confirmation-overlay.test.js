import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import { PROFILE_KEYS } from "../../shared/pii-taxonomy.js";
import { scanDocument } from "../../extension/src/core/field-scanner.js";
import {
  armSubmissionGuard,
  SubmissionGuardError,
} from "../../extension/src/ui/confirmation-overlay.js";
import { FAKE_PROFILE } from "../fixtures/fake-profile.js";

function createGuardScenario() {
  const { document, window } = parseHTML(`
    <form data-demo-form="scholarship">
      <label>Applicant full name <input name="applicantName"></label>
      <button type="submit">Submit</button>
    </form>
  `);
  const scan = scanDocument(document);
  const actions = [{ action: "fill_private", target: "FIELD_1", profileKey: PROFILE_KEYS.NAME }];
  return { document, window, form: document.querySelector("form"), scan, actions };
}

function submit(form, window) {
  return form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function overlayHost(document) {
  return document.querySelector("[data-privacyfill-owned='confirmation-overlay']");
}

describe("extension submission confirmation guard", () => {
  it("blocks submission and cancel keeps the form editable", () => {
    const scenario = createGuardScenario();
    const audit = [];
    const controller = armSubmissionGuard({
      scan: scenario.scan,
      actions: scenario.actions,
      filledCount: 1,
      criticalCategories: [PROFILE_KEYS.AADHAAR],
      onAudit: (entry) => audit.push(entry),
    });
    let pageSubmissions = 0;
    scenario.form.addEventListener("submit", () => { pageSubmissions += 1; });

    assert.equal(submit(scenario.form, scenario.window), false);
    const host = overlayHost(scenario.document);
    assert.ok(host);
    const shadowText = Array.from(host.shadowRoot.querySelectorAll("p, h2, span, strong, button"))
      .map((element) => element.textContent)
      .join(" ");
    assert.match(shadowText, /Scholarship/);
    assert.match(shadowText, /Aadhaar/);
    assert.equal(shadowText.includes(FAKE_PROFILE[PROFILE_KEYS.AADHAAR]), false);
    host.shadowRoot.querySelector("[data-action='cancel']").click();

    assert.equal(overlayHost(scenario.document), null);
    assert.equal(pageSubmissions, 0);
    assert.equal(scenario.form.querySelector("input").disabled, false);
    assert.deepEqual(audit.map((entry) => entry.code), [
      "CONFIRMATION_REQUESTED",
      "CONFIRMATION_CANCELLED",
    ]);
    controller.disarm();
  });

  it("allows exactly one submission and guards the next attempt again", () => {
    const scenario = createGuardScenario();
    armSubmissionGuard({
      scan: scenario.scan,
      actions: scenario.actions,
      filledCount: 1,
      criticalCategories: [],
    });
    let pageSubmissions = 0;
    scenario.form.addEventListener("submit", (event) => {
      event.preventDefault();
      pageSubmissions += 1;
    });

    submit(scenario.form, scenario.window);
    overlayHost(scenario.document).shadowRoot.querySelector("[data-action='submit-once']").click();
    assert.equal(pageSubmissions, 1);
    assert.equal(overlayHost(scenario.document), null);

    submit(scenario.form, scenario.window);
    assert.equal(pageSubmissions, 1);
    assert.ok(overlayHost(scenario.document));
  });

  it("rejects plans that span multiple forms", () => {
    const { document } = parseHTML(`
      <form><label>Full name <input name="fullName"></label></form>
      <form><label>Email <input name="email" type="email"></label></form>
    `);
    const scan = scanDocument(document);
    const actions = scan.fields.map((field) => ({ action: "focus", target: field.fieldId }));

    assert.throws(
      () => armSubmissionGuard({ scan, actions, filledCount: 0 }),
      (error) => error instanceof SubmissionGuardError
        && error.code === "MULTIPLE_FORMS_UNSUPPORTED",
    );
  });
});
