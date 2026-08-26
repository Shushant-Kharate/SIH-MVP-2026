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
npm run verify:secrets
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
- minimal localhost-only host access;
- no API credential or provider code in the browser bundle.

The popup can scan either controlled demo form and display the exact leak-checked JSON that would be
eligible to leave the extension. The validated planner backend is available; extension-to-backend planning
and local field execution are added in the next implementation chunk.

## Secret handling

Copy `.env.example` to `.env` only when remote backend configuration is required. Never commit `.env`,
place an API key in extension code, or use real personal information in tests. Server logs are restricted
to request ID, field count, planner type, duration, outcome, and a safe error code.
