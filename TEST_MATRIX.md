# PrivacyFill AI test and evidence matrix

## How to use this matrix

Run the automated commands from the repository root, then complete the Chrome checklist on the exact
laptop and build used for presentation. Automated DOM tests are strong regression evidence but do not
replace visual extension verification.

```powershell
npm ci
npm run verify
npm run test:acceptance
npm run verify:docs
```

Record the date, commit, Node version, Chrome version and operator in the release section below.

## Automated claim matrix

| ID | Claim | Primary automated evidence | Expected result |
| --- | --- | --- | --- |
| C01 | Manifest is MV3 and restricted to localhost | `tests/unit/extension-manifest.test.js`, `npm run verify:static` | No `<all_urls>`, external connection or remote/dynamic code |
| C02 | Profile accepts only the seven supported categories and valid fictional shapes | `tests/unit/profile-validation.test.js`, `profile-store.test.js` | Invalid/unknown values rejected; status exposes no values |
| C03 | Scanner supports labels, ARIA, placeholders, names, selects, radios and checkboxes | `tests/unit/field-scanner.test.js`, `demo-forms.test.js` | Both forms produce stable safe registries |
| C04 | OTP/password-like fields are critical and unsupported | `tests/unit/pii-classifier.test.js`, `demo-forms.test.js` | Category is `UNKNOWN_SENSITIVE`; no private fill action |
| C05 | Snapshots do not depend on current values | `tests/unit/snapshot.test.js` | Value changes do not reveal or corrupt snapshot identity |
| C06 | Outbound request has strict allowlisted properties | `tests/unit/sanitizer.test.js`, `contracts.test.js` | No raw values, DOM HTML, selectors or unknown properties |
| C07 | Seeded profile values and normalized variants are blocked | `tests/unit/leak-checker.test.js`, `tests/integration/privacy-boundary.test.js` | Deliberate leak throws before network; valid flow has zero matches |
| C08 | API rejects invalid, oversized, disallowed and rate-limited requests safely | `tests/integration/plan-route.test.js`, `tests/unit/server-security.test.js` | Safe 4xx response with no request echo |
| C09 | Fallback produces correlated typed actions for both forms | `tests/unit/fallback-planner.test.js`, `planner-service.test.js` | Strict response; no profile values |
| C10 | Remote errors or malformed plans use validated fallback | `tests/unit/remote-planner.test.js`, `planner-service.test.js`, route integration | Bounded timeout/error and safe fallback |
| C11 | Response IDs, schema and values are rechecked in the extension | `tests/unit/planner-client.test.js`, `contracts.test.js`, privacy integration | Stale, malformed or leaking plan rejected |
| C12 | Local validator rejects stale/missing/disabled/readonly/incompatible targets | `tests/unit/action-validator.test.js`, `tests/integration/local-fill-flow.test.js` | No rejected action executes |
| C13 | Critical categories need approval | `tests/unit/action-validator.test.js`, `tests/integration/release-flow.test.js` | Aadhaar/PAN cannot resolve before approval |
| C14 | Approved values are filled locally with native events | `tests/unit/action-executor.test.js`, local/release integration | Correct target/value and input/change events |
| C15 | Audit records and safe logs contain metadata only | `tests/unit/audit-log.test.js`, `server-security.test.js`, release/privacy integration | No seeded value in serialized artifacts |
| C16 | Submission requires review and one-use approval | `tests/unit/confirmation-overlay.test.js`, `tests/integration/release-flow.test.js` | Cancel blocks; Submit once permits one attempt and rearms |
| C17 | Both forms complete twice through the actual HTTP API | `tests/integration/release-flow.test.js` | Two clean scholarship and service flows; OTP remains empty |
| C18 | Repository contains no likely secret and extension contains no provider credential | `npm run verify:secrets`, `npm run verify:static` | Both scans pass |
| C19 | Required documentation and referenced local commands/links remain valid | `npm run verify:docs` | Required sections/files exist; local links and npm scripts resolve |

## Manual Chrome matrix

The authoritative operator table is `tests/manual/acceptance-checklist.md`. Its 13 cases cover:

- extension load, fake session profile and both controlled pages;
- field classification and exact sanitized payload inspection;
- fallback plan and local fill;
- critical approval, OTP blocking and metadata-only audit;
- Cancel, Submit once and clean reset/repeat.

No release is approved while any row says `MANUAL PENDING` or FAIL.

## Demo evidence manifest

Use only fictional values and store artifacts under `demo-evidence/` with these exact names:

| File | Required content | Privacy check |
| --- | --- | --- |
| `01-profile-categories.png` | Profile page or readiness state | Critical inputs masked; no realistic values visible |
| `02-field-classifications.png` | Scan result on a controlled form | Only labels/categories and anonymous IDs |
| `03-sanitized-zero-match.png` | Exact checked payload and zero-match result | Search image visually for every seeded value before keeping |
| `04-accepted-plan.png` | Planner type and accepted structured action summary | Typed references only; no values |
| `05-local-fill.png` | Highlighted controlled form after fill | Fictional data only; crop unrelated browser UI |
| `06-submission-boundary.png` | Extension confirmation dialog | Form/count/category metadata only |
| `07-full-flow.mp4` | Reset-to-submit backup recording | No keys, real tabs, notifications, shell history or real PII |

The repository tracks `demo-evidence/README.md`, not generated evidence by default. Review artifacts as a
team before adding or sharing them.

## Latest automated baseline

Baseline after the Chunk 10 documentation verifier was added:

- Functional suite: 124/124 pass.
- Privacy suite: 48/48 pass.
- Focused acceptance suite: 17/17 pass.
- Static extension security: pass.
- Secret scan: pass across 89 repository files.
- Documentation verification: 4/4 pass.

These counts are historical evidence, not hard-coded release expectations; adding tests changes them.
Use the current command exit status as the release decision.

## Release record

Complete this table without inserting any private value or API key.

| Item | Value |
| --- | --- |
| Date/time | PENDING |
| Commit SHA | PENDING |
| Node/npm version | PENDING |
| Chrome version | PENDING |
| Presentation laptop/operator | PENDING |
| `npm run verify` | PENDING |
| Manual A01–A13 | PENDING |
| Scholarship clean runs (required: 2) | PENDING |
| Service clean runs (required: 2) | PENDING |
| Evidence reviewed by | PENDING |
| Release decision | PENDING |

## Failure rule

Any private-value match, silent critical fill, unexpected OTP fill, unvalidated action execution, missing
submission interception, secret scan failure or reproducibility failure blocks the release. Record the
failure, fix it, rerun the entire automated gate, then restart the two-run manual count from zero.
