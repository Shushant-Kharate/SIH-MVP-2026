import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parseHTML } from "linkedom";

import {
  deriveAccessibleFieldLabel,
  normalizeAccessibleText,
} from "../../extension/src/core/accessible-name.js";

function labelFor(document, selector) {
  return deriveAccessibleFieldLabel(document.querySelector(selector), document);
}

describe("bounded accessible-name discovery", () => {
  it("uses explicit, wrapping, ARIA-reference and ARIA labels in priority order", () => {
    const { document } = parseHTML(`
      <label for="explicit">Explicit name</label><input id="explicit" aria-label="Ignored ARIA">
      <label>Wrapped phone <input id="wrapped" aria-label="Ignored ARIA"></label>
      <span id="aria-one">Primary</span><span id="aria-two">email address *</span>
      <input id="referenced" aria-labelledby="aria-one aria-two aria-one" aria-label="Ignored ARIA">
      <input id="aria" aria-label="Date of birth">
    `);

    assert.equal(labelFor(document, "#explicit"), "Explicit name");
    assert.equal(labelFor(document, "#wrapped"), "Wrapped phone");
    assert.equal(labelFor(document, "#referenced"), "Primary email address");
    assert.equal(labelFor(document, "#aria"), "Date of birth");
  });

  it("uses a direct fieldset legend without collecting the entire fieldset", () => {
    const { document } = parseHTML(`
      <fieldset>
        <legend>Applicant category *</legend>
        <p>Private helper text that must not become the label.</p>
        <input id="choice" type="radio">
      </fieldset>
    `);

    assert.equal(labelFor(document, "#choice"), "Applicant category");
  });

  it("uses only a bounded heading from a Google Forms-like question container", () => {
    const { document } = parseHTML(`
      <p>Account private-account@example.test</p>
      <div role="listitem">
        <div role="heading">Mobile number *</div>
        <input id="mobile" type="tel">
        <p>Helper example: 9876543210</p>
      </div>
    `);

    const label = labelFor(document, "#mobile");
    assert.equal(label, "Mobile number");
    assert.equal(label.includes("private-account@example.test"), false);
    assert.equal(label.includes("9876543210"), false);
  });

  it("does not use arbitrary ancestor or body text when no bounded name exists", () => {
    const { document } = parseHTML(`
      <main>Private account private@example.test <section><input></section></main>
    `);

    assert.equal(labelFor(document, "input"), "Unlabelled field");
  });

  it("excludes hidden descendants, helper controls and script text from a label", () => {
    const { document } = parseHTML(`
      <label>
        Public email address
        <span aria-hidden="true">private@example.test</span>
        <span style="display: none">9876543210</span>
        <script>secret()</script>
        <input id="safe-email" type="email">
      </label>
    `);

    assert.equal(labelFor(document, "#safe-email"), "Public email address");
  });

  it("normalizes required markers, whitespace and length", () => {
    assert.equal(normalizeAccessibleText("  Applicant   name   * * "), "Applicant name");
    assert.equal(normalizeAccessibleText("Email address (required)"), "Email address");
    assert.equal(normalizeAccessibleText("x".repeat(500)).length, 200);
  });
});
