# PrivacyFill visual browser-agent implementation plan

## Objective and non-negotiable boundary

Extend the existing PrivacyFill architecture with local visual perception and a bounded observe–act loop.
Do not replace the existing DOM scanner, taxonomy, leak checker, strict planning contracts, local profile
resolution, fresh-page validation, critical approval, audit policy or submission guard.

The original screenshot, raw OCR text, live DOM elements and local coordinates are private local artifacts.
They must never enter the existing version-1 planning request. A separate versioned visual contract may be
introduced only after redaction and coverage verification are implemented.

No API key is required for the local visual pipeline or fallback planner. Any optional remote planner keeps
using the existing server-only configuration.

## Section 1 — Local visual-region foundation

Deliverables:

- `shared/privacy-levels.js` defining `VISIBLE`, `PLACEHOLDER`, `LOCAL_APPROVAL` and `BLOCKED`.
- `extension/src/vision/dom-region-mapper.js` mapping the existing live field registry to clipped viewport
  regions using `getBoundingClientRect()`.
- CSS-pixel and screenshot-pixel coordinates using viewport size, scroll offsets, device pixel ratio and
  visual viewport scale.
- Local screen/region identifiers and privacy levels derived from the existing classification/risk result.
- Tests for clipping, off-screen exclusion, zoom/DPR scaling, hidden elements and planner-contract isolation.

Gate: existing scan/payload shapes remain unchanged; no bounds, location or live element is added to the
version-1 request; all existing tests pass.

## Section 2 — Explicit user-triggered visible-tab capture

Deliverables:

- Add `ANALYZE_SCREEN` and internal capture messages.
- `extension/src/vision/screen-capture.js` calls `captureVisibleTab` only from an explicit user action and
  only for the current selected window/tab.
- Decode dimensions and correlate the capture with the active tab plus local visual snapshot.
- Keep the original image in an in-memory, short-lived capture session; never use Chrome storage, IndexedDB,
  filesystem, audit records or server logs.
- Clear the original on cancellation, navigation, timeout, redaction completion and inspector close.

Gate: unselected/background tabs and protected pages cannot be captured; capture has no automatic timer or
background trigger; storage tests prove no original screenshot persistence.

## Section 3 — Local redaction and coverage verification

Deliverables:

- `extension/src/privacy/visual-redactor.js` creates a new canvas/image and never returns original pixels as
  the sanitized result.
- Policy: opaque boxes for password/OTP/CVV/CAPTCHA and critical identifiers; configurable full/partial masks
  for other PII; strong local face blur or opaque mask; irrelevant-region cropping when selected.
- Pixel-space clipping and minimum padding to avoid edge leakage.
- `visual-coverage-checker.js` verifies every required sensitive region is covered by an applied mask before
  sanitized pixels can cross a privacy boundary.
- Tests compare source/sanitized pixel regions and deliberately fail uncovered boxes.

Gate: a failed coverage check destroys the candidate sanitized image and blocks approval/network use.

## Section 4 — Privacy Inspector extension page

Deliverables:

- A dedicated extension page rather than overcrowding the popup.
- Local original/sanitized previews, detection boxes, counts and timing summaries.
- User can reclassify a region, add a manual mask, approve sanitized context or cancel.
- The exact versioned safe payload and both zero-profile-match and all-regions-covered results are visible.
- Navigation or capture-session expiry closes approval and requires a new analysis.

Gate: approval is impossible while a critical region is uncovered; cancel sends nothing and clears pixels.

## Section 5 — Selective OCR and packaged visual inference

Deliverables:

- Adaptive candidates: canvas, image/document regions, unlabelled controls and low-confidence regions only.
- OCR crops only selected regions; OCR strings pass through the existing PII taxonomy, pattern redaction and
  leak checker and remain local until minimized.
- Package a license-reviewed, checksum-pinned local inference runtime and model asset with the extension.
- First genuine CV capability: face detection plus image/text-region detection if model size allows.
- No remote scripts, runtime model downloads or arbitrary page-provided model input configuration.

Gate: model/runtime licenses and hashes are documented; offline execution works; a face in the visual demo
is detected and covered; OCR is not run over the entire screen by default.

## Section 6 — Versioned Virtual Safe UI v2 contract

Deliverables:

- Add a new contract version/type; do not silently modify PlanningRequest v1.
- Include only safe screen ID, viewport dimensions, anonymous element IDs, roles, semantic categories,
  privacy levels, clipped bounds and optionally a coverage-verified sanitized image.
- Typed opaque references are random per capture session and cannot be resolved by the server.
- Strictly reject original screenshot, raw OCR, URL/query, page title, HTML, cookies, account identity,
  browser history, selectors and raw profile properties.

Gate: seeded profile values and original-pixel fingerprints produce zero matches across request, response,
logs and audit; unknown properties fail contract validation.

## Section 7 — Safe click and bounded scroll

Deliverables:

- Add `click` and `scroll` to a new action-contract version.
- Click targets only snapshot-registered, visible, enabled, approved interactive controls whose live role and
  accessible name still match. Payment, delete, submit and destructive labels require explicit approval or
  remain blocked.
- Scroll accepts only fixed directions and capped amounts; no coordinates or arbitrary events from planner.
- Post-action verification and fresh snapshot are mandatory.

Gate: no JavaScript, selector, navigation, upload or automatic submit action exists; stale/dangerous targets
fail before any click.

## Section 8 — Bounded multi-step observe–act loop

Deliverables:

- One action per planner response and a fresh analyze/sanitize/validate cycle after every action.
- Maximum 10 actions, maximum duration, same-tab/origin policy, user-visible Stop and cancellation cleanup.
- Stop immediately on unexpected navigation, popup/inspector loss, privacy failure, target replacement or
  unsupported state.
- Submission and critical disclosures retain their separate approvals.

Gate: tests cover stop, timeout, action limit, unexpected navigation, stale response and successful bounded
two-step interaction.

## Section 9 — Adaptive perception controller and cache

Deliverables:

- L0 DOM semantics → L1 cropped OCR → L2 local model escalation.
- Escalation score based on task relevance × privacy risk × perception uncertainty.
- Cache by screen/region snapshot; debounce mutations; invalidate only affected regions.
- No continuous screenshots or inference while the user is idle.

Gate: high-confidence DOM fields stop at L0; only ambiguous crops reach L1/L2; cache invalidation tests pass.

## Section 10 — SIH evaluation dashboard and release evidence

Deliverables:

- Local metrics: DOM, OCR, model, redaction, server and total latency; L0/L1/L2 counts; PII detection/miss and
  false-positive review counts; peak client memory; WASM/WebGPU mode.
- Metrics contain no OCR strings, screenshots, profile values, URLs or account data.
- A controlled visual demo page with fictional face/image, name, email, phone, Aadhaar, password and safe
  controls, plus repeatable evaluation and manual Chrome checklist.
- Update README, architecture, threat model, demo script and test matrix.

Gate: the complete vertical slice captures only after user action, detects, redacts, verifies, displays the
exact safe context, executes one locally validated action and reports privacy/performance evidence.

## Recommended implementation sequence

Complete and verify one section per commit. Sections 1–4 create a safe screenshot lifecycle before any
visual payload exists. Section 5 adds local perception only after redaction is trustworthy. Sections 6–8
expand contracts/actions behind new versions. Sections 9–10 optimize and produce SIH evidence.

Manual live-browser verification remains mandatory because screenshot scale, Chrome zoom, WebGPU/WASM and
Google Forms markup differ by machine and browser version.
