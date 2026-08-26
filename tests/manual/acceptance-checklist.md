# PrivacyFill AI — Manual Acceptance Checklist

This checklist records both automated evidence and the Chrome-only verification that must be completed
on the presentation laptop. Use only the fictional profile in `tests/fixtures/fake-profile.js`.

## Test session record

| Item | Value |
| --- | --- |
| Date prepared | 2026-08-26 |
| Branch | `codex/mvp-implementation` |
| Automated command | `npm run verify` |
| Automated result | PASS — 120 tests at preparation time |
| Manual Chrome operator | _Not yet assigned_ |
| Chrome version | _Not yet recorded_ |
| Built extension path | `dist/extension` |

Result vocabulary:

- `AUTOMATED PASS`: covered by a repeatable repository test.
- `MANUAL PASS`: observed using the unpacked extension in Chrome.
- `MANUAL FAIL`: observed behavior differs from the expected result; record evidence and stop release.
- `MANUAL PENDING`: requires a person to load and operate the unpacked extension.

## Acceptance cases

| ID | Scenario | Operator procedure | Expected result | Automated evidence | Manual result |
| --- | --- | --- | --- | --- | --- |
| A01 | Fresh install with no profile | Clear the extension session, open the popup on Form A. | Popup says a local profile is required; Inspect and Fill remain disabled. | `profile-store.test.js`, `extension-manifest.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A02 | Invalid profile formats | Enter an invalid email, short phone, malformed Aadhaar and PAN, then save. | Save is rejected with field-safe errors and no values in status text or logs. | `profile-validation.test.js`, `profile-store.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A03 | Form A happy path | Save the fictional profile, scan Scholarship, inspect payload, plan and fill. | Six intended private fields fill; zero outbound matches; Aadhaar approval appears; fields highlight. | `release-flow.test.js` runs twice — AUTOMATED PASS | MANUAL PENDING |
| A04 | Form B happy path | Reset, open Citizen Service, scan, inspect, plan and fill. | Five supported fields fill; PAN approval appears; OTP stays empty. | `release-flow.test.js` runs twice — AUTOMATED PASS | MANUAL PENDING |
| A05 | Backend unavailable | Stop `npm run server`, then request a plan. | Popup reports the local planner is unavailable; no field is changed. | `planner-client.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A06 | Forced fallback mode | Start with `PLANNER_MODE=fallback`, open `/api/health`, then fill either form. | Health and popup show fallback planner; no API key is required. | `plan-route.test.js`, `release-flow.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A07 | Injected raw-value leak | In a development-only test, insert one fictional profile value into a sanitized label before the request. | Extension blocks the request before network transmission and reports a safe privacy error. | `privacy-boundary.test.js`, `planner-client.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A08 | Malformed planner response | Use the remote-planner failure stub or return malformed JSON/actions. | Server uses a valid fallback or extension rejects the response; no action executes. | `remote-planner.test.js`, `planner-service.test.js`, `planner-client.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A09 | Unknown action | Inject `click`, `upload`, or `submit` into a plan fixture. | Contract/local validator rejects the whole plan before partial execution. | `contracts.test.js`, `action-validator.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A10 | Removed or changed target | Scan, materially change/remove a target field, then execute the old plan. | Fresh snapshot does not match; the entire plan is rejected. | `action-validator.test.js`, `snapshot.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A11 | Cancel submission | Fill a form, press its submit button, then choose Cancel in the extension dialog. | Page submission count remains zero and the form stays editable. | `confirmation-overlay.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A12 | Confirm submission once | Submit again and choose Submit once, then attempt a second submission. | Exactly one attempt passes; the next attempt displays the guard again. | `confirmation-overlay.test.js`, `release-flow.test.js` — AUTOMATED PASS | MANUAL PENDING |
| A13 | Clear session | Clear profile and audit history from the popup, then reopen it. | Profile values and audit metadata disappear; Fill is disabled until a new profile is saved. | `profile-store.test.js`, `audit-log.test.js` — AUTOMATED PASS | MANUAL PENDING |

## Evidence to capture during the manual run

- Screenshot of the missing-profile state.
- Screenshot of the exact sanitized JSON and `0 raw profile matches` status.
- Screenshot of the filled Scholarship form using fictional values.
- Screenshot showing OTP empty on the Citizen Service form.
- Screenshot of the submission confirmation dialog without private values.
- Screenshot of the metadata-only audit panel.
- Browser console capture showing no uncaught extension errors.

## Release decision

Do not mark the release candidate ready until A01–A13 all show `MANUAL PASS` on the presentation
laptop for the current commit. Record defects beside the failed row and rerun `npm run verify` after fixes.
