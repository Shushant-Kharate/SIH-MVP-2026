import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const demoRoot = new URL("../../demo/", import.meta.url);

async function readDemoFile(name) {
  return readFile(new URL(name, demoRoot), "utf8");
}

describe("controlled demo forms", () => {
  it("links both forms from the demo landing page", async () => {
    const html = await readDemoFile("index.html");

    assert.match(html, /href="\.\/scholarship\.html"/);
    assert.match(html, /href="\.\/service-registration\.html"/);
    assert.match(html, /Fake data only/i);
  });

  it("provides the scholarship fields required by the MVP", async () => {
    const html = await readDemoFile("scholarship.html");

    for (const fieldName of [
      "applicantName",
      "email",
      "mobileNumber",
      "dateOfBirth",
      "aadhaarNumber",
      "permanentAddress",
      "course",
      "applicantConsent",
    ]) {
      assert.match(html, new RegExp(`name="${fieldName}"`));
    }

    assert.match(html, /data-demo-form="scholarship"/);
    assert.match(html, /<label class="required" for="scholarship-name">/);
  });

  it("uses mixed labeling strategies on the service form", async () => {
    const html = await readDemoFile("service-registration.html");

    assert.match(html, /<label class="field-label field--wide">/);
    assert.match(html, /aria-label="Primary mobile number"/);
    assert.match(html, /aria-labelledby="pan-field-label"/);
    assert.match(html, /placeholder="PAN number/);
    assert.match(html, /<fieldset class="radio-fieldset field--wide">/);
    assert.match(html, /name="district"/);
  });

  it("includes an optional OTP control for blocked-field testing", async () => {
    const html = await readDemoFile("service-registration.html");
    const otpControl = html.match(/<input(?=[^>]*name="verificationCode")[^>]*>/)?.[0];

    assert.ok(otpControl);
    assert.match(otpControl, /aria-label="One-time password OTP"/);
    assert.doesNotMatch(otpControl, /\srequired(?:\s|>)/);
  });

  it("keeps submission entirely local", async () => {
    const script = await readDemoFile("demo.js");

    assert.match(script, /event\.preventDefault\(\)/);
    assert.doesNotMatch(script, /\bfetch\s*\(/);
    assert.doesNotMatch(script, /XMLHttpRequest/);
    assert.doesNotMatch(script, /sendBeacon/);
  });

  it("offers a reset control and local result on both forms", async () => {
    for (const file of ["scholarship.html", "service-registration.html"]) {
      const html = await readDemoFile(file);
      assert.match(html, /<button type="reset">Reset form<\/button>/);
      assert.match(html, /data-form-outcome/);
      assert.match(html, /demo\.js/);
    }
  });
});
