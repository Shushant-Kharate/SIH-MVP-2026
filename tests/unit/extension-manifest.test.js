import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const extensionRoot = new URL("../../extension/", import.meta.url);

async function readExtensionFile(relativePath) {
  return readFile(new URL(relativePath, extensionRoot), "utf8");
}

describe("Chrome extension shell", () => {
  it("uses Manifest V3 and a module service worker", async () => {
    const manifest = JSON.parse(await readExtensionFile("manifest.json"));

    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.background, {
      service_worker: "background.js",
      type: "module",
    });
    assert.equal(manifest.action.default_popup, "pages/popup.html");
    assert.equal(manifest.options_page, "pages/profile.html");
  });

  it("requests only the planned permissions and local demo host", async () => {
    const manifest = JSON.parse(await readExtensionFile("manifest.json"));

    assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting", "storage"]);
    assert.deepEqual(manifest.host_permissions, ["http://localhost:8787/*"]);
    assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
    assert.equal(Object.hasOwn(manifest, "externally_connectable"), false);
    assert.deepEqual(manifest.content_scripts, [{
      matches: ["http://localhost:8787/demo/*"],
      js: ["content.js"],
      run_at: "document_idle",
    }]);
  });

  it("defines all seven profile controls without inline scripts", async () => {
    const html = await readExtensionFile("pages/profile.html");

    for (const key of ["NAME", "EMAIL", "PHONE", "ADDRESS", "DOB", "AADHAAR", "PAN"]) {
      assert.match(html, new RegExp(`name="PROFILE\\.${key}"`));
    }
    assert.match(html, /type="module" src="\.\/profile\.js"/);
    assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/);
  });

  it("describes temporary storage without claiming an encrypted vault", async () => {
    const profileHtml = await readExtensionFile("pages/profile.html");
    const popupHtml = await readExtensionFile("pages/popup.html");
    const combined = `${profileHtml}\n${popupHtml}`;

    assert.match(combined, /temporary extension session/i);
    assert.match(combined, /not a\s+production-grade encrypted vault/i);
  });

  it("provides an exact checked-payload viewer without inline HTML rendering", async () => {
    const popupHtml = await readExtensionFile("pages/popup.html");
    const popupScript = await readExtensionFile("src/popup.js");

    assert.match(popupHtml, /id="payload-json"/);
    assert.match(popupHtml, /Exact checked JSON/);
    assert.match(popupScript, /payloadJson\.textContent = JSON\.stringify/);
    assert.doesNotMatch(popupScript, /innerHTML/);
  });

  it("exposes the locally validated plan-and-fill action", async () => {
    const popupHtml = await readExtensionFile("pages/popup.html");
    const popupScript = await readExtensionFile("src/popup.js");

    assert.match(popupHtml, /id="plan-fill"/);
    assert.match(popupScript, /MESSAGE_TYPES\.PLAN_REQUEST/);
    assert.match(popupScript, /MESSAGE_TYPES\.VALIDATE_AND_EXECUTE/);
    assert.match(popupScript, /critical identifier/);
  });

  it("provides a metadata-only audit viewer and guarded submission code", async () => {
    const popupHtml = await readExtensionFile("pages/popup.html");
    const popupScript = await readExtensionFile("src/popup.js");
    const confirmationScript = await readExtensionFile("src/ui/confirmation-overlay.js");

    assert.match(popupHtml, /id="view-audit"/);
    assert.match(popupHtml, /id="audit-list"/);
    assert.match(popupScript, /MESSAGE_TYPES\.GET_AUDIT_LOG/);
    assert.match(popupScript, /MESSAGE_TYPES\.CLEAR_AUDIT_LOG/);
    assert.match(confirmationScript, /stopImmediatePropagation/);
    assert.match(confirmationScript, /requestSubmit/);
    assert.doesNotMatch(popupScript, /innerHTML/);
    assert.doesNotMatch(confirmationScript, /innerHTML/);
  });

  it("injects the packaged scanner only after a selected-tab ping", async () => {
    const popupScript = await readExtensionFile("src/popup.js");
    const injectorScript = await readExtensionFile("src/core/content-injector.js");
    const contentScript = await readExtensionFile("src/content.js");

    assert.match(popupScript, /ensureContentScript/);
    assert.match(injectorScript, /PING_CONTENT_SCRIPT/);
    assert.match(injectorScript, /scriptingApi\.executeScript/);
    assert.match(injectorScript, /files: \["content\.js"\]/);
    assert.match(contentScript, /__privacyFillContentScriptV1/);
    assert.match(contentScript, /PING_CONTENT_SCRIPT/);
    assert.equal(JSON.stringify(JSON.parse(await readExtensionFile("manifest.json"))).includes("<all_urls>"), false);
  });

  it("shows selected-tab permission, compatibility counts and privacy inspection states", async () => {
    const popupHtml = await readExtensionFile("pages/popup.html");
    const popupScript = await readExtensionFile("src/popup.js");
    const popupViewModel = await readExtensionFile("src/ui/popup-view-model.js");
    const combined = `${popupHtml}\n${popupScript}\n${popupViewModel}`;

    for (const id of [
      "page-access-title",
      "compatibility-title",
      "detected-field-count",
      "mapped-field-count",
      "blocked-field-count",
      "unsupported-field-count",
    ]) {
      assert.match(popupHtml, new RegExp(`id="${id}"`));
    }
    assert.match(combined, /Ready to scan this tab/);
    assert.match(combined, /Google Forms experimental/);
    assert.match(combined, /Page changed—rescan required/);
    assert.match(combined, /No supported fields/);
    assert.match(popupHtml, /Required: verify exact JSON and zero matches/);
    assert.doesNotMatch(combined, /works on every (?:website|form)/i);
  });
});
