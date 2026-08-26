# PrivacyFill AI — SIH MVP 2026

PrivacyFill AI is a privacy-preserving Chrome form-filling agent. An AI or deterministic planner receives only anonymous field metadata and typed profile references; real profile values stay inside the trusted browser extension and are resolved locally.

The project is being implemented incrementally according to [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Requirements

- Node.js 20 or newer
- npm
- A current Chromium-based browser (Chrome recommended)

## Current development commands

```bash
npm install
npm test
npm run test:privacy
npm run test:acceptance
npm run verify:static
npm run verify:secrets
npm run verify
```

Run the controlled demonstration forms at `http://localhost:8787/demo/`:

```bash
npm run server
```

The same process serves the demo forms and the planner API:

- `GET /api/health` reports the effective planner mode;
- `POST /api/plan` accepts only the sanitized planning-request contract;
- `GET /demo/*` serves the two controlled forms.

Fallback planning is the default and requires no API key. It deterministically returns typed
`fill_private` references for compatible fields and never receives or returns real profile values.

For optional remote planning, copy `.env.example` to `.env`, set `PLANNER_MODE=remote`, and provide
server-only `OPENAI_API_KEY` and `OPENAI_MODEL` values. The remote adapter uses structured JSON output,
then revalidates the response and automatically falls back on timeout, network failure, malformed output,
unsafe actions, or stale request identifiers. Never place these settings in extension code.

## Build the Chrome extension

```bash
npm run build:extension
```

The loadable unpacked extension is generated at `dist/extension`. In Chrome, open
`chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select that folder.

The current extension chunk provides:

- a session-only seven-field local profile;
- strict profile validation and normalization;
- a popup showing profile readiness without displaying values;
- a localhost-scoped DOM scanner with anonymous field IDs;
- deterministic PII classification and blocked OTP/password detection;
- value-independent form snapshot identifiers;
- an allowlist-only sanitized planning-request builder;
- exact and normalized profile-value leakage blocking;
- an exact checked-JSON payload viewer in the popup;
- validated calls to the local fallback or remote planner;
- a second local policy check against a fresh form snapshot;
- native field filling with `input` and `change` event dispatch;
- explicit approval before critical Aadhaar or PAN disclosure;
- session-only, metadata-only per-field audit records;
- a popup audit viewer with safe local clear controls;
- an extension-owned review dialog that intercepts submission;
- a one-use submission bypass that immediately rearms afterward;
- minimal localhost-only host access;
- no API credential or provider code in the browser bundle.

The popup can scan either controlled demo form and display the exact leak-checked JSON that would be
eligible to leave the extension. **Plan and fill locally** sends that checked object to the planner, validates
the returned action plan, asks before resolving critical identifiers, rescans for DOM changes, and fills
approved values inside the page's isolated extension context. OTP, password-like, unknown, stale, missing,
disabled, readonly and incompatible targets are rejected before execution. A filled form's next submit
attempt is intercepted by the extension and shows only the form name, filled-field count, and critical
category names. Cancel keeps the form editable; **Submit once** permits exactly one submission attempt.

For a local demonstration:

1. Run `npm run server` and `npm run build:extension`.
2. Load `dist/extension` as an unpacked Chrome extension.
3. Save only the fictional test profile from `tests/fixtures/fake-profile.js`.
4. Open either page under `http://localhost:8787/demo/`.
5. Use **Scan**, optionally inspect the exact payload, then choose **Plan and fill locally**.
6. Approve the critical-identifier prompt and review the highlighted fields.
7. Choose **View privacy audit** to inspect value-free events.
8. Submit the form, review the extension confirmation dialog, then Cancel or **Submit once**.

Before presenting, follow the Chrome-only cases in
[`tests/manual/acceptance-checklist.md`](./tests/manual/acceptance-checklist.md) and record the operator,
Chrome version, and result for every row. Automated checks do not replace loading the unpacked extension
on the presentation laptop.

## Secret handling

Copy `.env.example` to `.env` only when remote backend configuration is required. Never commit `.env`,
place an API key in extension code, or use real personal information in tests. Server logs are restricted
to request ID, field count, planner type, duration, outcome, and a safe error code.
