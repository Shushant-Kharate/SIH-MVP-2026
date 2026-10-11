# PrivacyFill AI — External-page Chrome checklist

This is the mandatory Chrome release gate for user-selected web forms. Automated DOM tests do not replace
these checks because Chrome permissions, real framework behavior and current Google Forms markup must be
observed in the presentation browser.

Use only team-created forms and the fictional profile from `tests/fixtures/fake-profile.js`. Never use a
real Aadhaar number, PAN, address, phone number, email account, application or uploaded document.

## Test session record

| Item | Value |
| --- | --- |
| Date/time | PENDING |
| Commit SHA | PENDING |
| Operator | PENDING |
| Chrome version | PENDING |
| Windows version | PENDING |
| Built extension path | `dist/extension` |
| Planner mode | `fallback` recommended |
| Automated gate | PASS — 171 functional, 79 privacy, 18 focused acceptance on 2026-08-26 |
| Google Form 1 link/name | PENDING — team-created fictional form |
| Google Form 2 link/name | PENDING — team-created fictional form |
| Google Form 3 link/name | PENDING — team-created fictional form |

Allowed results are `MANUAL PASS`, `MANUAL FAIL`, `BLOCKED` and `PENDING`. A result is a pass only when
the expected behavior is directly observed on the current build. Record screenshots by evidence ID; do
not paste page URLs containing tokens or user identifiers into this document.

## Thirteen required cases

| ID | Scenario and operator procedure | Expected safe result | Automated evidence | Manual result/evidence |
| --- | --- | --- | --- | --- |
| X01 | Open a previously unseen HTTPS page containing a plain native HTML form. Open PrivacyFill, read the access card, then select **Scan**. | Popup says **Ready to scan this tab** before the click. Scanning begins only after the click; the standard-form compatibility card and four counts appear. | `page-eligibility.test.js`, `content-injector.test.js`, `popup-view-model.test.js`, external release flow | PENDING |
| X02 | Open a second tab with a reordered/restyled native form containing the same fictional categories in a different order. Scan and fill it. | Fields map by accessible metadata rather than position or repository filename. Supported fields retain their fictional values after native events. | `field-scanner.test.js`, `release-flow.test.js`, `external-standard-form.html` | PENDING |
| X03 | Use a team-controlled React/Vue/Angular page with a controlled native text input. Scan, inspect, then fill. | Value remains after framework processing. A replaced or reverted target fails safely and stops the remaining actions. | `framework-fill-flow.test.js`, `action-executor.test.js` | PENDING |
| X04 | Open team-created Google Form 1 containing only short-answer/paragraph questions for name, email, phone and address. Run it twice from a clean reload. | Popup says **Google Forms experimental**. Supported native questions fill; no Google account text, form title or URL appears in checked JSON, audit or server logs. | `form-adapters.test.js`, `external-privacy-boundary.test.js` | PENDING |
| X05 | Open team-created Google Form 2 containing a compatible date question and required questions. Run it twice from a clean reload. | Compatible native date behavior and required detection are recorded. If current Google markup is incompatible, the field is left unchanged and the result is recorded as BLOCKED—not reclassified by clicking. | `form-adapters.test.js`, `field-scanner.test.js` | PENDING |
| X06 | Open team-created Google Form 3 containing file upload, custom dropdown/radio grid and a second section. Scan the first section. | Unsupported count is non-zero. File/grid/custom widgets remain untouched. Move sections manually and explicitly scan again; no automatic Next click occurs. | Google-like fixture and adapter tests | PENDING |
| X07 | Scan an eligible form, then navigate, reload, switch tabs or materially change the form before inspection/fill. | Previous scan and fill controls are invalidated. Popup says **Page changed—rescan required** and no old action executes. | `popup-view-model.test.js`, `action-validator.test.js`, snapshot tests | PENDING |
| X08 | On a team-controlled page, place fictional email/phone/PAN/Aadhaar-like text in labels, placeholders, helper text and options; then inspect checked JSON. | External labels are canonicalized/redacted, arbitrary options are withheld and the privacy result remains zero matches. Deliberate residual leakage blocks the request. | `label-sanitizer.test.js`, `external-privacy-boundary.test.js`, `leak-checker.test.js` | PENDING |
| X09 | Include OTP and password fields alongside supported profile fields, then fill. | OTP/password fields remain empty and appear blocked; no plan action resolves them. CAPTCHA and file inputs are also untouched. | `pii-classifier.test.js`, external and controlled release flows | PENDING |
| X10 | Run a form containing Aadhaar and PAN. Cancel the critical prompt once, verify no critical field changed, then run again and approve using fictional data. | Cancellation occurs before critical resolution. Approval fills only locally validated critical targets. | `action-validator.test.js`, `release-flow.test.js` | PENDING |
| X11 | After a successful fill on a form where normal submission interception is supported, attempt submission; cancel once, then permit one attempt. | No silent submission occurs. Cancel leaves the form editable; **Submit once** permits one attempt only. If the site bypasses normal form submission, do not claim the guard supports it. | `confirmation-overlay.test.js`, `release-flow.test.js` | PENDING |
| X12 | Open `chrome://settings`, the Chrome Web Store, a `file://` page and another unsupported scheme; open PrivacyFill on each. | Popup says **Unsupported browser page**. Scan is disabled and no script injection is attempted. | `page-eligibility.test.js`, `content-injector.test.js`, static security gate | PENDING |
| X13 | Keep an unrelated form open in a second tab. Invoke PrivacyFill only in the selected test tab, scan and fill, then inspect the unrelated tab. | The unrelated tab remains untouched. Manifest has no persistent all-sites permission and scanner injection targets only the selected top frame. | `extension-manifest.test.js`, `content-injector.test.js`, `verify-static-security.mjs` | PENDING |

## Evidence to capture

- `X01-selected-tab-access.png`: access card before scanning, with no unrelated tab content visible.
- `X02-external-standard-fill.png`: reordered test form filled only with fictional values.
- `X04-google-short-answer.png`: experimental badge and supported result.
- `X06-google-unsupported.png`: non-zero unsupported count with widgets still unchanged.
- `X07-page-changed.png`: rescan-required state and disabled Fill button.
- `X08-zero-match-json.png`: exact minimized JSON plus zero raw profile matches.
- `X09-blocked-sensitive.png`: OTP/password/CAPTCHA/file fields unchanged.
- `X10-critical-cancel-approve.png`: prompt evidence without displaying the identifier.
- `X11-submit-guard.png`: safe confirmation metadata only.
- `X12-unsupported-page.png`: protected-page rejection.
- `X13-second-tab-untouched.png`: both tab titles only; crop all personal browser UI.
- Console and server-log text files showing no uncaught errors and no fictional profile-value matches.

## Google Forms compatibility record

For each of the three forms, record the current Chrome version, question types, supported count,
unsupported count, two clean-run results and any DOM/behavior limitation. A Google Forms result is not a
release blocker for standard native forms when it fails closed, but the team must describe it accurately
as experimental and must not demo an unverified question type.

| Form | Question types | Run 1 | Run 2 | Supported/unsupported counts | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 3 | PENDING | PENDING | PENDING | PENDING | PENDING |

## Release decision

Do not claim external-page release readiness until X01–X13 have been completed on the presentation
laptop. Any raw-value match, unexpected critical/OTP fill, unrelated-tab access, silent submission or
uncaught extension error is a release-blocking failure. Fix the issue, rerun `npm run verify`, rebuild and
restart all affected manual cases from a clean page reload.
