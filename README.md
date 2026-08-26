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
npm run demo
```

The backend and the extension's scanning/filling workflow are added in later implementation chunks. No API key is required for the shared-contract layer, demo forms or deterministic fallback mode.

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
eligible to leave the extension. Backend planning and local filling are added in later chunks.

## Secret handling

Copy `.env.example` to `.env` only when backend configuration is required. Never commit `.env`, place an API key in extension code, or use real personal information in tests.
