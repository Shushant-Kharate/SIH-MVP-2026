# PrivacyFill AI — End-to-End MVP Implementation Plan

## 1. Document purpose

This document is the build specification for the SIH MVP. It is intentionally detailed enough that a developer or coding agent can implement the project one section at a time without needing to redesign the system during development.

The MVP is a Chrome extension that fills application forms from a local user profile while preventing the AI planner from receiving the user's real private values.

The central rule is:

> The AI may reason about anonymous field types and field identifiers, but only trusted extension code may access and insert real profile values.

## 2. Decisions already made

| Decision | Selected option | Reason |
| --- | --- | --- |
| Extension platform | Chrome Manifest V3 | Matches the team's experience and hackathon target |
| Main language | JavaScript with ES modules | Fastest option for the current team |
| Extension build | esbuild | Allows modular source code while producing browser-ready bundles |
| Backend | Node.js + Express | Same language across the project and minimal setup |
| AI integration | Optional OpenAI-compatible planner behind the backend | The API key never enters browser code |
| Offline reliability | Deterministic fallback planner | The demonstration must work without API access |
| Profile storage | `chrome.storage.session` | Values disappear after the browser session and are not claimed to be a production vault |
| Demo websites | Two controlled forms served by the backend | Predictable testing and repeatable evaluation |
| Final submission | Always requires explicit user confirmation | High-impact actions remain human controlled |
| Initial Git workflow | Local implementation and commits; ask before first push | Prevents premature remote changes |

## 3. MVP outcome

At the end of implementation, an evaluator must be able to:

1. Start one local Node.js server.
2. Load the built extension as an unpacked Chrome extension.
3. Open the extension's profile page and save fake test details.
4. Open either controlled application form.
5. Scan the form and see detected fields and PII categories.
6. Inspect the exact sanitized payload that will leave the extension.
7. Verify that the payload contains no raw profile values.
8. Request an AI or fallback action plan.
9. Validate the returned actions locally.
10. Fill the form locally using the real session profile.
11. Review an audit log containing metadata but no private values.
12. Attempt submission and encounter an explicit confirmation boundary.
13. Repeat the process on a differently structured form.

## 4. Scope boundaries

### 4.1 Included

- Chrome Manifest V3 extension.
- Session-only local profile.
- Name, email, phone, address, date of birth, Aadhaar and PAN categories.
- Text inputs, email, telephone, date, number, textarea, select, radio and checkbox fields.
- DOM-based label and field discovery.
- Deterministic PII classification using field metadata and patterns.
- Anonymous field IDs and typed profile references.
- Exact and normalized outbound-value leakage checks.
- Structured AI action plans.
- Deterministic offline fallback planning.
- Strict local action validation.
- Local form filling and event dispatch.
- Stale-plan detection using a form snapshot identifier.
- Confirmation before form submission.
- Privacy-safe audit records.
- Two controlled demonstration forms.
- Automated unit and integration tests.

### 4.2 Explicitly excluded from the MVP

- CAPTCHA solving or bypassing.
- File uploads.
- Password-manager behavior.
- Automatic final submission.
- OCR, screenshots, PDFs or image-based forms.
- Face or image anonymization.
- Training a custom ML model.
- Production-grade encrypted persistent storage.
- Support for arbitrary websites or cross-origin iframes.
- A formal guarantee of zero information leakage.
- Deployment of a public multi-user service.

## 5. Security and privacy invariants

The following rules are mandatory. A section is incomplete if it violates any of them.

1. Raw profile values must never be sent to `/api/plan`.
2. Raw profile values must never appear in backend logs, planner prompts, planner responses or audit logs.
3. The browser extension must never contain an API key.
4. `.env` files must be ignored by Git.
5. The backend must accept only the documented sanitized request contract.
6. The extension must fail closed when the leakage checker reports a match.
7. Every planner action must be validated locally before execution.
8. Unknown action types must be rejected.
9. Every target field must exist in the current form registry.
10. Private fills must use a typed `profileKey`, not a literal value returned by the AI.
11. Plans created for an old DOM snapshot must be rejected or regenerated.
12. Submission must never be performed silently.
13. Audit records may contain field IDs, categories, results and timing, but not field values.
14. The demo must use fake seeded PII, never a team member's real identifiers.

## 6. Trust boundaries and data flow

```text
UNTRUSTED WEBPAGE DOM
        |
        | field metadata only
        v
TRUSTED EXTENSION SCANNER
        |
        | anonymous fields + typed profile references
        v
TRUSTED PRIVACY ENGINE
        |
        | leak-checked sanitized JSON only
        v
BACKEND / AI PLANNER
        |
        | structured actions with field IDs and profile keys
        v
TRUSTED LOCAL VALIDATOR
        |
        | approved actions only
        v
TRUSTED LOCAL EXECUTOR <------ session-only real profile
        |
        v
WEBPAGE FIELDS
        |
        v
EXPLICIT USER CONFIRMATION BEFORE SUBMISSION
```

The backend is outside the private-value trust boundary. Even if the backend or AI provider were inspected, it should see only anonymous field descriptions and typed references.

## 7. Planned repository structure

```text
SIH-MVP-2026/
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── IMPLEMENTATION_PLAN.md
├── scripts/
│   ├── build-extension.mjs
│   └── verify-no-secrets.mjs
├── shared/
│   ├── action-types.js
│   ├── message-types.js
│   ├── pii-taxonomy.js
│   └── contracts.js
├── extension/
│   ├── manifest.json
│   ├── assets/
│   │   └── icons/
│   ├── pages/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   ├── profile.html
│   │   └── profile.css
│   └── src/
│       ├── background.js
│       ├── popup.js
│       ├── profile.js
│       ├── content.js
│       ├── core/
│       │   ├── profile-store.js
│       │   ├── field-scanner.js
│       │   ├── pii-classifier.js
│       │   ├── sanitizer.js
│       │   ├── leak-checker.js
│       │   ├── action-validator.js
│       │   ├── action-executor.js
│       │   ├── snapshot.js
│       │   └── audit-log.js
│       └── ui/
│           ├── status-view.js
│           ├── payload-view.js
│           └── confirmation-overlay.js
├── server/
│   ├── index.js
│   ├── config.js
│   ├── routes/
│   │   ├── health.js
│   │   └── plan.js
│   ├── planners/
│   │   ├── fallback-planner.js
│   │   ├── remote-planner.js
│   │   └── planner-service.js
│   ├── validation/
│   │   ├── request-validator.js
│   │   └── response-validator.js
│   └── security/
│       ├── safe-logger.js
│       └── rate-limit.js
├── demo/
│   ├── index.html
│   ├── scholarship.html
│   ├── service-registration.html
│   ├── demo.css
│   └── demo.js
├── tests/
│   ├── fixtures/
│   │   ├── fake-profile.js
│   │   ├── sanitized-form.js
│   │   └── valid-plan.js
│   ├── unit/
│   │   ├── pii-classifier.test.js
│   │   ├── sanitizer.test.js
│   │   ├── leak-checker.test.js
│   │   ├── action-validator.test.js
│   │   └── fallback-planner.test.js
│   ├── integration/
│   │   ├── plan-route.test.js
│   │   └── privacy-boundary.test.js
│   └── manual/
│       └── acceptance-checklist.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── THREAT_MODEL.md
│   ├── DEMO_SCRIPT.md
│   └── TEST_MATRIX.md
└── dist/
    └── extension/              # generated; load this folder in Chrome
```

`dist/` is generated by the build and must not be manually edited. Whether it is committed will be decided after verifying how the team will present the project.

## 8. Shared data model

### 8.1 Supported profile

The profile object held in `chrome.storage.session` is:

```js
{
  version: 1,
  values: {
    "PROFILE.NAME": "Aarav Sharma",
    "PROFILE.EMAIL": "aarav.demo@example.test",
    "PROFILE.PHONE": "9876543210",
    "PROFILE.ADDRESS": "42 Demo Road, Pune, Maharashtra",
    "PROFILE.DOB": "2002-04-18",
    "PROFILE.AADHAAR": "234567890123",
    "PROFILE.PAN": "ABCDE1234F"
  }
}
```

Only fake test data belongs in fixtures and screenshots. The application must never ship with a real profile.

### 8.2 PII taxonomy

| Profile key | Common label evidence | Expected controls | Risk |
| --- | --- | --- | --- |
| `PROFILE.NAME` | name, applicant, candidate | text | medium |
| `PROFILE.EMAIL` | email, e-mail | email, text | medium |
| `PROFILE.PHONE` | phone, mobile, contact | tel, text, number | medium |
| `PROFILE.ADDRESS` | address, residence, locality | text, textarea | high |
| `PROFILE.DOB` | date of birth, DOB, birth date | date, text | high |
| `PROFILE.AADHAAR` | Aadhaar, UID, UIDAI | text, number | critical |
| `PROFILE.PAN` | PAN, tax identifier | text | critical |
| `UNKNOWN_SENSITIVE` | password, OTP, CVV, bank account | any | critical/block |

`UNKNOWN_SENSITIVE` fields are detected and displayed but are never automatically filled in the MVP.

### 8.3 Field registry entry

```js
{
  fieldId: "FIELD_1",
  formId: "FORM_1",
  tag: "input",
  type: "text",
  label: "Applicant full name",
  name: "applicantName",
  required: true,
  disabled: false,
  readonly: false,
  options: [],
  classification: {
    category: "PROFILE.NAME",
    confidence: 0.98,
    risk: "medium",
    evidence: ["label:applicant full name"]
  }
}
```

The sanitized copy must exclude current field values and other unnecessary attributes.

### 8.4 Planning request contract

```js
{
  contractVersion: 1,
  requestId: "uuid",
  snapshotId: "sha256-or-stable-session-hash",
  task: "Fill this application form using my saved profile",
  availableProfileKeys: [
    "PROFILE.NAME",
    "PROFILE.EMAIL",
    "PROFILE.PHONE"
  ],
  fields: [
    {
      fieldId: "FIELD_1",
      formId: "FORM_1",
      tag: "input",
      type: "text",
      label: "Applicant full name",
      required: true,
      options: [],
      suggestedProfileKey: "PROFILE.NAME",
      risk: "medium"
    }
  ]
}
```

This object is passed through the leakage checker immediately before network transmission.

### 8.5 Planning response contract

```js
{
  contractVersion: 1,
  requestId: "uuid",
  snapshotId: "same-id-as-request",
  planner: "remote" | "fallback",
  actions: [
    {
      action: "fill_private",
      target: "FIELD_1",
      profileKey: "PROFILE.NAME"
    }
  ],
  requiresConfirmation: true
}
```

### 8.6 Allowed actions

| Action | Required fields | Behavior |
| --- | --- | --- |
| `fill_private` | `target`, `profileKey` | Resolve a real value locally and fill a compatible field |
| `select` | `target`, `value` | Select a literal that exists in the sanitized option list |
| `check` | `target`, `checked` | Change an allowed checkbox or radio state |
| `focus` | `target` | Bring a known field into view |
| `request_confirmation` | optional `reason` | Pause for explicit user approval |

No `click`, `navigate`, `upload`, `download`, `script`, `submit` or arbitrary JavaScript action is allowed.

## 9. Implementation chunks

Each chunk ends with a gate. Do not begin a dependent chunk until its gate passes.

### Chunk 0 — Freeze scope and development baseline

**Owner:** Member 4 with team review
**Estimated time:** 30 minutes
**Dependencies:** none

Tasks:

1. Confirm Node.js 20 or newer and current Chrome are installed.
2. Create a working branch named `codex/mvp-implementation`.
3. Add root `package.json` using ES modules.
4. Add scripts for `dev`, `server`, `build:extension`, `test`, `test:privacy` and `verify`.
5. Add `.gitignore` entries for `node_modules`, `.env`, `.env.*`, logs and generated artifacts.
6. Add `.env.example` with placeholders only:
   - `PORT=8787`
   - `PLANNER_MODE=fallback`
   - `OPENAI_API_KEY=`
   - `OPENAI_MODEL=`
7. Install only the dependencies actually required by the design.
8. Record setup commands in the README.

Gate:

- `npm install` succeeds.
- `npm test` can run even before tests are added.
- `git status` shows no secrets or generated dependency folders.

Suggested commit: `chore: scaffold privacyfill mvp`

### Chunk 1 — Shared constants and contracts

**Owner:** Members 2 and 3
**Estimated time:** 1 hour
**Dependencies:** Chunk 0

Tasks:

1. Define the PII keys, risk levels and allowed action names once in `shared/`.
2. Implement request and response shape validators.
3. Reject unknown top-level fields where practical.
4. Enforce maximum limits:
   - task: 300 characters;
   - fields: 100;
   - actions: 100;
   - labels: 200 characters;
   - options: 100 per field;
   - option length: 200 characters.
5. Create fixtures for a fake profile, sanitized form and valid plan.
6. Add contract tests for valid, missing, malformed and oversized inputs.

Gate:

- Shared contract tests pass.
- Both the server and extension can import the same constants during their build.
- The contracts have no property that can carry an unrestricted profile object.

Suggested commit: `feat: define privacy-safe planning contracts`

### Chunk 2 — Controlled demonstration forms

**Owner:** Member 4
**Estimated time:** 1.5 hours
**Dependencies:** Chunk 0

Build two visually different pages.

**Form A: Scholarship application**

- Standard labels using `for` attributes.
- Name, email, phone, DOB, address, Aadhaar, course select and terms checkbox.
- Required-field validation.
- Fake submission result displayed locally.

**Form B: Government-service registration**

- Mixed wrapping labels, `aria-label`, placeholder and name attributes.
- Name, phone, PAN, address, date, category radio group and district select.
- Fields placed in a different order from Form A.
- One deliberately unsupported sensitive field such as OTP to demonstrate blocking.

Tasks:

1. Serve forms from `http://localhost:8787/demo/`.
2. Use accessible HTML so field-label discovery has a reliable baseline.
3. Prevent real network submission; show a local success summary.
4. Add reset buttons for repeatable demos.
5. Include a visible banner stating that all data must be fake.

Gate:

- Both forms work without the extension.
- Native required validation works.
- Reset returns each page to a predictable initial state.
- The two forms exercise at least four different labeling strategies.

Suggested commit: `feat: add controlled application form demos`

### Chunk 3 — Extension shell and session profile

**Owner:** Member 1
**Estimated time:** 2 hours
**Dependencies:** Chunks 0 and 1

Tasks:

1. Create a minimal Manifest V3 configuration.
2. Request only `storage`, `activeTab` and `scripting` permissions initially.
3. Add host permission only for `http://localhost:8787/*`.
4. Add a module service worker.
5. Create the popup with these states:
   - backend status;
   - profile present/missing;
   - Scan Form;
   - Inspect Safe Payload;
   - Plan and Fill;
   - View Audit;
   - Clear Session.
6. Create the profile page with the seven supported profile fields.
7. Validate formats before saving:
   - email syntax;
   - 10-digit Indian mobile format;
   - ISO date;
   - 12-digit Aadhaar demo shape;
   - PAN shape `[A-Z]{5}[0-9]{4}[A-Z]`.
8. Save the profile only in `chrome.storage.session`.
9. Display a clear limitation that session storage is not a production encrypted vault.
10. Ensure UI status messages never echo full sensitive values.

Gate:

- The extension loads without Manifest errors.
- A fake profile can be saved, read and cleared.
- Restarting the browser removes the session profile.
- Searching console and UI logs reveals no full profile values.

Suggested commit: `feat: add extension shell and session profile`

### Chunk 4 — DOM field scanner, classifier and snapshot

**Owner:** Members 1 and 2
**Estimated time:** 3 hours
**Dependencies:** Chunks 1, 2 and 3

`field-scanner.js` responsibilities:

1. Find visible, enabled `input`, `select` and `textarea` elements.
2. Ignore buttons, submit controls, hidden inputs and extension-owned overlay elements.
3. Derive a human-readable label in this priority order:
   - explicit `<label for>`;
   - wrapping `<label>`;
   - `aria-label`;
   - `aria-labelledby`;
   - placeholder;
   - name;
   - id.
4. Normalize whitespace and enforce length limits.
5. Collect only required metadata and safe select options.
6. Assign `FORM_n` and `FIELD_n` IDs.
7. Store the mapping from anonymous IDs to live DOM elements only in the content script.

`pii-classifier.js` responsibilities:

1. Combine label, name, id, placeholder, type and autocomplete evidence.
2. Match normalized keywords against the PII taxonomy.
3. Use type evidence for email, telephone and date.
4. Return category, confidence, risk and evidence.
5. Mark password, OTP, CVV and bank-like labels as `UNKNOWN_SENSITIVE`.
6. Never read existing field values for classification.

`snapshot.js` responsibilities:

1. Build a deterministic representation from field IDs and safe metadata.
2. Generate a snapshot ID.
3. Invalidate plans when field count, identity, labels or types materially change.

Gate:

- Both forms produce registries with stable anonymous IDs during one page state.
- At least 90% of intended demo fields receive the correct category.
- OTP is marked blocked/unknown-sensitive.
- No current input value appears in the registry.
- A DOM change causes a new snapshot ID.

Suggested commit: `feat: scan and classify application fields`

### Chunk 5 — Sanitization and outbound leakage protection

**Owner:** Member 2
**Estimated time:** 2.5 hours
**Dependencies:** Chunks 1, 3 and 4

`sanitizer.js` responsibilities:

1. Convert the private field registry to the planning request contract.
2. Include only anonymous IDs, normalized labels, types, required flags, safe options, risk and suggested profile keys.
3. Include only the names of profile keys that are available.
4. Remove values, DOM HTML, page text, CSS, coordinates and unrelated attributes.
5. Reject blocked fields from automatic-fill candidates.

`leak-checker.js` responsibilities:

1. Serialize a deep copy of the outbound payload.
2. Build protected variants for every non-empty profile value:
   - exact lowercase value;
   - whitespace-normalized value;
   - digits-only value for phone and identifiers;
   - punctuation-stripped value where meaningful.
3. Ignore variants too short to check safely.
4. Search every outbound string.
5. Return only category and match type, never the matched value.
6. Block the request if any protected variant is found.
7. Run again after retries or payload reconstruction.

Important limitation to document: this is a strong MVP safety net, not a complete DLP system. Encodings, partial secrets, OCR and semantic reconstruction require later work.

Gate:

- All seeded raw and normalized profile values are absent from safe payload fixtures.
- Injecting a full phone, email, Aadhaar, PAN or address into any payload field causes a block.
- The displayed safe-payload viewer uses the exact checked object, not a separately reconstructed preview.
- Logs describe the blocked category without displaying its value.

Suggested commit: `feat: enforce sanitized planner boundary`

### Chunk 6 — Backend and planner abstraction

**Owner:** Member 3
**Estimated time:** 3 hours
**Dependencies:** Chunks 1, 2 and 5 contract output

Endpoints:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Return service and selected planner status |
| `POST` | `/api/plan` | Validate a sanitized request and return a structured action plan |
| `GET` | `/demo/*` | Serve controlled forms and assets |

Backend rules:

1. Parse JSON with a small body-size limit.
2. Allow requests only from the extension and local demo development origins.
3. Validate the planning request before calling any planner.
4. Log request ID, number of fields, planner type, duration and outcome only.
5. Never log the full request in normal operation.
6. Apply basic local rate limiting.
7. Return stable JSON error codes instead of stack traces.

Fallback planner:

1. For each safe field with an available compatible `suggestedProfileKey`, emit `fill_private`.
2. Skip `UNKNOWN_SENSITIVE` and unsupported controls.
3. Add no literal private value.
4. Set `planner: "fallback"` and `requiresConfirmation: true`.
5. Sort actions by form and document order for predictable demonstrations.

Remote planner:

1. Activate only when `PLANNER_MODE=remote`, `OPENAI_API_KEY` and `OPENAI_MODEL` are configured.
2. Read credentials only on the server.
3. Send a fixed system policy plus the sanitized request.
4. Require structured JSON output matching the action contract.
5. Reject prose, unknown actions or mismatched request/snapshot IDs.
6. Fall back deterministically on timeout, network failure, malformed output or policy rejection.
7. Clearly return which planner produced the accepted plan.

Gate:

- Health endpoint reports fallback mode without an API key.
- Both demo requests receive valid fallback plans.
- Invalid or oversized requests receive safe 4xx errors.
- Simulated remote failure returns a valid fallback plan.
- Server tests prove no raw profile fixture is required or accepted.

Suggested commit: `feat: add validated planner backend and fallback`

### Chunk 7 — Local action validation and execution

**Owner:** Members 1 and 2
**Estimated time:** 3 hours
**Dependencies:** Chunks 4, 5 and 6

Validation order:

1. Parse and validate the response contract.
2. Verify matching request ID and snapshot ID.
3. Reject more than the maximum allowed actions.
4. Reject actions outside the allowlist.
5. Confirm that each target exists in the current field registry.
6. Confirm that the live element is still connected, visible, enabled and writable.
7. Confirm profile-key availability.
8. Confirm category and control-type compatibility.
9. Confirm select/radio literal membership in the current allowed options.
10. Reject duplicate or contradictory actions.
11. Require confirmation for critical disclosure and all final submissions.

Execution rules:

1. Resolve `profileKey` against session storage locally.
2. Focus and scroll the target into view.
3. Use the native property setter when required by React-like controls.
4. Dispatch bubbling `input` and `change` events.
5. Re-read the field to verify that the intended value was accepted.
6. Highlight successful, skipped and failed fields with different non-intrusive outlines.
7. Record only field ID, profile category, action, status and duration in the audit log.
8. Stop on a critical validation failure; do not partially continue silently.

Gate:

- Seven private fields fill correctly on Form A.
- Intended supported fields fill correctly on Form B.
- An injected `upload`, `click` or nonexistent target action is rejected.
- An old plan is rejected after the DOM changes.
- No executor audit entry contains the inserted value.

Suggested commit: `feat: validate and execute private fills locally`

### Chunk 8 — Confirmation boundary, safe-payload viewer and audit UI

**Owner:** Member 4 with Member 1
**Estimated time:** 2.5 hours
**Dependencies:** Chunks 3, 5 and 7

Safe-payload viewer:

- Show the exact post-sanitization, post-leak-check request.
- Display a green `0 raw profile matches` status only after the checker passes.
- Make the planner type visible.
- Never display the session profile beside the outbound payload during screenshots.

Audit panel:

- Scan started/completed.
- Number of fields and classified private fields.
- Sanitization completed.
- Leak check passed/blocked.
- Planner requested and planner selected.
- Plan accepted/rejected.
- Per-field action result using anonymous field IDs.
- Confirmation requested/accepted/cancelled.

Submission guard:

1. Attach only to the form involved in the current fill operation.
2. Intercept the next submit event.
3. Display an extension-owned confirmation overlay with:
   - form name;
   - count of filled fields;
   - critical categories involved, but no values;
   - Cancel;
   - Submit once.
4. On Cancel, keep the form editable.
5. On Submit once, remove or bypass the guard for exactly one submission.
6. Never ask the planner to approve submission.

Gate:

- The user can see what the AI saw.
- Audit events contain no raw fixture values.
- A normal submit attempt is blocked by the extension confirmation overlay.
- Cancel does not submit.
- Submit once results in exactly one local demo submission.

Suggested commit: `feat: add privacy audit and confirmation gate`

### Chunk 9 — Automated verification

**Owner:** Member 4 with all members fixing failures
**Estimated time:** 3 hours
**Dependencies:** Chunks 1–8

Unit tests:

- Label extraction and normalization.
- PII classification for positive, ambiguous and blocked cases.
- Sanitizer property allowlist.
- Exact and normalized leak detection.
- Contract validation.
- Allowed and rejected actions.
- Snapshot mismatch.
- Fallback-plan determinism.
- Safe audit serialization.

Integration tests:

- `/api/health` in fallback mode.
- Valid sanitized request to `/api/plan`.
- Invalid request rejection.
- Oversized body rejection.
- Remote-planner failure to fallback.
- Serialized outbound payload contains zero fake-profile values.
- Planner response contains no properties capable of carrying raw private profile values.

Static security checks:

- Search tracked files for the API key prefix and known secret-variable assignments.
- Search built extension files for `OPENAI_API_KEY` and provider endpoints.
- Verify `.env` is ignored.
- Verify the manifest does not request `<all_urls>`.
- Verify no `eval`, `new Function` or remote script is used.

Manual acceptance tests:

1. Fresh install with no profile.
2. Invalid profile formats.
3. Form A happy path.
4. Form B happy path.
5. Backend unavailable.
6. Forced fallback mode.
7. Injected raw-value leak.
8. Malformed planner response.
9. Unknown action.
10. Removed target after scan.
11. Cancel submission.
12. Confirm submission once.
13. Clear session and verify values disappear.

Gate:

- `npm test` passes.
- `npm run test:privacy` passes.
- `npm run build:extension` succeeds with no warnings that affect execution.
- All manual acceptance checks have recorded results.

Suggested commit: `test: verify privacy boundary and demo flows`

### Chunk 10 — Documentation and demonstration package

**Owner:** Member 4 with technical review by all members
**Estimated time:** 2 hours
**Dependencies:** Chunks 0–9

README must include:

- One-paragraph problem and solution.
- Architecture diagram.
- Requirements.
- Installation commands.
- How to run the backend.
- How to build and load the extension.
- How to save a fake profile.
- How to run each demo.
- How to enable remote planning without exposing the key.
- How to run tests.
- Known limitations.
- Research acknowledgement and defensible novelty statement.

Additional documents:

- `ARCHITECTURE.md`: components, messages, contracts and data flow.
- `THREAT_MODEL.md`: assets, boundaries, threats, mitigations and residual risks.
- `DEMO_SCRIPT.md`: a five-minute repeatable presentation.
- `TEST_MATRIX.md`: expected results and evidence locations.

Demo evidence:

- Screenshot of profile category setup without exposing realistic values.
- Screenshot of field classifications.
- Screenshot of sanitized payload and zero-match leak check.
- Screenshot of accepted structured plan.
- Screenshot of locally filled form.
- Screenshot of confirmation boundary.
- Backup screen recording covering the full flow.

Gate:

- A new team member can run the project using only the README.
- All four members can explain the same trust-boundary diagram.
- Demo can be repeated twice after a clean reset.

Suggested commit: `docs: add setup security and demo guidance`

### Chunk 11 — Final end-to-end release candidate

**Owner:** Entire team
**Estimated time:** 1.5 hours
**Dependencies:** all previous chunks

Release checklist:

1. Start from a clean Git checkout.
2. Install dependencies.
3. Run all verification scripts.
4. Build the extension.
5. Load `dist/extension` in Chrome.
6. Use a fresh session profile.
7. Complete Form A twice.
8. Complete Form B twice.
9. Repeat with the backend temporarily unavailable and confirm the supported fallback behavior.
10. Inspect the safe payload and backend output for seeded-value leakage.
11. Inspect Git for `.env`, credentials, personal data and generated noise.
12. Tag the local candidate only after all checks pass.
13. Ask the repository owner before pushing the branch.

Final gate:

- Two consecutive successful demonstrations on both forms.
- Zero exact or normalized fake-profile matches in every outbound planner request.
- 100% locally validated planner actions.
- 100% confirmation interception for guarded form submission.
- No secret or personal-data finding in tracked files.

Suggested commit: `chore: prepare hackathon release candidate`

## 10. Chrome extension message protocol

All cross-component messages must use named constants and return a consistent envelope.

Request example:

```js
{
  type: "PLAN_REQUEST",
  payload: { /* sanitized planning request */ }
}
```

Response example:

```js
{
  ok: true,
  data: { /* validated result */ },
  error: null
}
```

Failure example:

```js
{
  ok: false,
  data: null,
  error: {
    code: "PRIVACY_LEAK_BLOCKED",
    message: "Outbound request blocked by privacy policy"
  }
}
```

Required message types:

- `PROFILE_SAVE`
- `PROFILE_GET_STATUS`
- `PROFILE_CLEAR`
- `SCAN_FORM`
- `GET_SANITIZED_PAYLOAD`
- `PLAN_REQUEST`
- `VALIDATE_AND_EXECUTE`
- `GET_AUDIT_LOG`
- `CLEAR_AUDIT_LOG`
- `ARM_SUBMISSION_GUARD`

Messages must not carry the complete profile outside trusted extension components. In particular, the popup does not forward profile values to the backend.

## 11. Error codes

Use stable codes so the UI can explain failures without exposing internal details.

| Code | Meaning | User action |
| --- | --- | --- |
| `PROFILE_MISSING` | No session profile exists | Open profile page |
| `NO_SUPPORTED_FIELDS` | Scanner found nothing supported | Try a controlled demo form |
| `PRIVACY_LEAK_BLOCKED` | A protected value appeared outbound | Stop and inspect sanitized metadata |
| `BACKEND_UNAVAILABLE` | Local planning service cannot be reached | Start server or use local fallback path |
| `INVALID_PLAN` | Planner output failed schema validation | Retry/fallback |
| `UNSAFE_ACTION` | Action is outside policy | Reject and audit |
| `STALE_SNAPSHOT` | DOM changed after scanning | Rescan |
| `TARGET_MISSING` | Anonymous target no longer exists | Rescan |
| `INCOMPATIBLE_FIELD` | Profile category and control conflict | Review mapping |
| `CONFIRMATION_REQUIRED` | Consequential action needs the user | Review and decide |

## 12. Test data

Use obviously fictional values that are easy to identify in leak tests:

```js
{
  "PROFILE.NAME": "Aarav Demo Sharma",
  "PROFILE.EMAIL": "aarav.privacy@example.test",
  "PROFILE.PHONE": "9876543210",
  "PROFILE.ADDRESS": "42 Privacy Test Road, Pune",
  "PROFILE.DOB": "2002-04-18",
  "PROFILE.AADHAAR": "234567890123",
  "PROFILE.PAN": "ABCDE1234F"
}
```

These values exist only in test fixtures and manual local profiles. Screenshots should be marked `DEMO DATA`.

## 13. Four-member ownership map

| Member | Primary ownership | Secondary responsibility |
| --- | --- | --- |
| Member 1 | Manifest, service worker, scanner, executor | Browser integration fixes |
| Member 2 | PII taxonomy, sanitizer, leak checker, action validator | Threat model and privacy tests |
| Member 3 | Express server, contracts, remote/fallback planners | Backend integration tests |
| Member 4 | Demo forms, popup/profile UI, audit UI, test matrix, PPT evidence | End-to-end testing and backup video |

Integration rule: every member must implement against the contracts in `shared/`. Contract changes require notifying all owners before merging.

## 14. Two-day execution schedule

### Day 1 morning

- Chunk 0 completed together.
- Members 2 and 3 complete shared contracts.
- Member 1 starts the extension shell.
- Member 4 starts both forms.

Exit condition: server starts, extension loads, forms open and the contract tests run.

### Day 1 afternoon

- Member 1 implements field scanning.
- Member 2 implements classification and sanitization.
- Member 3 implements health, plan route and fallback planner.
- Member 4 finishes UI styling and creates manual test cases.

Exit condition: Form A produces a leak-checked sanitized request and valid fallback plan.

### Day 1 evening

- Integrate the extension-to-backend request.
- Freeze request/response contracts.
- Complete the first end-to-end path on Form A before adding polish.

Exit condition: Form A can scan, plan and fill locally.

### Day 2 morning

- Implement strict action validation, snapshot checks and audit events.
- Add Form B mappings and edge cases.
- Add submission confirmation.

Exit condition: both forms work end to end with fallback planning.

### Day 2 afternoon

- Add optional remote planner integration.
- Finish automated privacy and API tests.
- Fix all acceptance failures.
- Complete README and architecture/threat-model documents.

Exit condition: verification commands pass and both flows repeat successfully.

### Day 2 evening

- Capture screenshots and backup video.
- Rehearse the demo.
- Test on the presentation laptop and network.
- Create the release candidate commit.

Exit condition: two consecutive clean demonstrations and a usable backup recording.

## 15. Measurable success criteria

| Metric | MVP target | Measurement |
| --- | --- | --- |
| Seeded-value leakage | 0 matches | Search serialized outbound requests for every protected variant |
| Required-field mapping | At least 90% | Correct mappings divided by intended supported fields across both forms |
| Planner contract validity | 100% | Validate every accepted response |
| Local action validation | 100% | No action executes before validation |
| Critical/unknown sensitive auto-fill | 0 | OTP/password-like controls remain blocked |
| Submission confirmation | 100% | Every guarded submit attempt displays the confirmation boundary |
| Demo repeatability | Two consecutive runs per form | Reset and repeat without source-code edits |
| Local scan/privacy latency | Target under 2 seconds | Measure scan, classify, sanitize and leak-check duration |

## 16. Known risks and mitigations

| Risk | MVP mitigation | Residual limitation |
| --- | --- | --- |
| PII classifier misses a field | Controlled forms, rules, confidence and fail-closed handling | Arbitrary sites need semantic models and broader testing |
| Sanitizer over-redacts useful context | Keep labels, types, required state and safe options | Some ambiguous fields may require user mapping |
| Raw value leaks in an unexpected encoding | Exact and normalized variant checks | Not a complete DLP system |
| AI returns unsafe instructions | Strict schema, allowlist and local validation | Prompt/model behavior remains probabilistic before validation |
| Page changes after planning | Snapshot IDs and live target checks | Highly dynamic sites may require rescanning often |
| API or network fails during demo | Deterministic fallback planner | Fallback demonstrates architecture but not remote reasoning |
| Extension storage is described as a vault | Explicit session-only limitation | Production persistence requires platform-backed encryption |
| Broad browser permissions concern judges | Restrict MVP to localhost demo host | Arbitrary site support is postponed |
| Team integration causes contract drift | Shared constants and frozen contracts | Changes still require coordination |

## 17. Claims the team may and may not make

Defensible MVP claim:

> PrivacyFill AI separates reasoning from secret handling. The planner operates on anonymous, typed form metadata, while a local browser component validates the plan and resolves real user values only at the moment of field entry.

Do not claim:

- that no related research exists;
- mathematically guaranteed zero leakage;
- production-grade encrypted storage;
- support for all websites;
- screenshot, PDF, OCR or facial anonymization;
- fully autonomous safe submission;
- a trained proprietary AI model.

## 18. Definition of done

The MVP is complete only when every statement below is true:

- [ ] The repository installs and starts from documented commands.
- [ ] The built extension loads without errors.
- [ ] A fake session profile can be created and cleared.
- [ ] Both forms are scanned and classified.
- [ ] The exact outbound payload is visible to the evaluator.
- [ ] The leak checker reports zero raw-profile matches on valid flows.
- [ ] Deliberate seeded-value injection is blocked.
- [ ] Fallback planning works without an API key.
- [ ] Optional remote planning works when server credentials are configured.
- [ ] Every action is schema- and policy-validated locally.
- [ ] Supported fields are filled using local profile resolution.
- [ ] Unknown-sensitive fields are not auto-filled.
- [ ] Audit logs contain no private values.
- [ ] Stale plans and unknown actions are rejected.
- [ ] Final submission requires explicit confirmation.
- [ ] Automated tests and privacy checks pass.
- [ ] No secret, `.env` file or real PII is tracked by Git.
- [ ] README, threat model, architecture and demo instructions are complete.
- [ ] The full demonstration succeeds twice on both forms.

## 19. Execution rule for future implementation turns

Implementation should proceed in chunk order. For each chunk:

1. Restate the chunk goal.
2. Inspect overlapping files and current Git status.
3. Implement only the chunk and necessary shared prerequisites.
4. Run the chunk's tests and gates.
5. Report files changed, verification results and any remaining limitation.
6. Create a focused local commit only after the gate passes.
7. Move to the next chunk without redesigning established contracts unless a verified blocker requires it.

The first implementation task after this plan is **Chunk 0 — Freeze scope and development baseline**.
