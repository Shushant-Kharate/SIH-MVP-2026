# PrivacyFill AI threat model

## Scope and security objective

This threat model covers the SIH MVP's Manifest V3 extension, user-selected top-level HTTP/HTTPS forms,
two controlled localhost forms, experimental Google Forms adapter, local Express planner API,
deterministic fallback planner and optional remote model adapter. Its primary
objective is to prevent raw session-profile values from crossing the planning boundary while retaining
useful typed planning and explicit user control over critical disclosure and final submission.

It is not a claim that values remain secret from the destination page after the user approves filling.
Any page can read values inserted into its own DOM.

## Assets

| Asset | Desired property |
| --- | --- |
| Name, email, phone, address, DOB, Aadhaar-shaped and PAN-shaped demo values | Confidential before intentional local insertion; temporary lifetime |
| API key | Server-side confidentiality; never bundled or committed |
| Category-to-value mapping | Confined to trusted extension session storage and execution path |
| Planning request/response | Integrity, strict shape, correlation and absence of raw profile values |
| DOM target registry and snapshot | Integrity between scan, plan and execution |
| User approval | Authentic, scoped to critical disclosure and one submission attempt |
| Audit records and server logs | Useful evidence without private values |
| Extension package | No remote code, broad host access or unsafe dynamic execution |

## Actors and assumptions

| Actor/component | Treatment |
| --- | --- |
| User/evaluator | Trusted to use fictional data, inspect prompts and make approval decisions |
| Packaged extension code | Trusted computing base; a compromised extension invalidates the model |
| Selected webpage/DOM | Untrusted input, including external labels, framework events and mutations |
| Local backend | Outside the raw-value boundary; trusted only to enforce its documented API |
| Remote model/provider | Untrusted for confidentiality and action correctness; receives sanitized data only |
| Network | Untrusted for remote mode; HTTPS is used by the provider adapter |
| Other installed extensions, malware, compromised browser/OS | Out of scope for the MVP |

Assumptions: Chrome enforces extension origin isolation, temporary `activeTab` authorization and
`chrome.storage.session` access controls; the repository dependencies and local build machine are not
compromised; the user invokes the extension only on the intended destination tab; and external sites may
change markup at any time. The team-created Google Forms and browser version must therefore be retested.

## Trust boundaries

1. **Page → extension scanner:** attacker-controlled labels, attributes and DOM mutations enter trusted
   parsing code. Existing control values must not enter the sanitized registry.
2. **Profile store → privacy engine:** raw values enter only local leak comparison and final resolution.
3. **Extension → planner API:** only a validated, serialized, zero-match `PlanningRequest` may cross.
4. **Backend → remote model:** the server-only key and already-sanitized request may cross HTTPS.
5. **Planner → extension executor:** all returned data is untrusted until schema, correlation and local
   action-policy validation succeed against a fresh scan.
6. **Extension executor → page:** approved values become visible to the destination DOM by design.
7. **Execution → logs/audit/UI:** only bounded metadata and safe error summaries may cross.

## Threats, mitigations and residual risk

| ID | Threat | Implemented mitigation | Residual risk |
| --- | --- | --- | --- |
| T01 | Scanner includes prefilled/current values | Allowlist projection excludes `value`, HTML, screenshots, arbitrary attributes and selectors; tests seed values and assert absence | A future scanner change could add a revealing property; contract/static tests must remain required |
| T02 | External label, helper text or option contains a saved/private-looking value | Bounded accessible names, category-token replacement, pattern redaction, external option omission and exact/normalized leak scan before HTTP | Encoding, semantic inference and unknown transformations are not comprehensive DLP |
| T03 | Planner returns raw private data | Strict response keys plus a second leak scan; `fill_private` accepts only a supported `profileKey` | Non-profile sensitive data not present in the local profile is outside value-match coverage |
| T04 | Prompt/model injects click, navigation, script or submit actions | Five-action allowlist, strict per-action keys, no `eval`/`new Function`, no planner-provided selectors | Logic errors inside an allowed action remain possible and require tests |
| T05 | Page changes after planning (TOCTOU) | Value-independent snapshot correlation, fresh rescan, live target/type/state validation | Highly dynamic pages can cause safe false rejections and need rescanning |
| T06 | Critical identifier is filled silently | Aadhaar/PAN risk is `critical`; execution requires explicit critical approval | Approval fatigue or misleading surrounding page content can influence the user |
| T07 | Form submits without review | Guard is armed on successful fill, intercepts normal form submission, reveals only safe metadata and grants one-use bypass | A hostile page may submit through mechanisms outside normal form submit handling; support must not be claimed when interception cannot be verified |
| T08 | OTP/password is treated as ordinary profile data | Sensitive keyword/type classification produces `UNKNOWN_SENSITIVE`; no corresponding profile key exists; local validator rejects | Novel wording may evade deterministic classification |
| T09 | API key leaks into extension or Git | `.env` ignored; server-only config; extension/provider-string static scan and repository secret scan | Secrets pasted into screenshots, shell history or external tools are an operational risk |
| T10 | Backend logs private content | Logger constructs a new allowlisted record from request ID, count, planner, duration, outcome and safe code | Hosting/proxy logs would need separate review outside localhost MVP |
| T11 | Cross-origin site abuses local planner | CORS accepts only Chrome-extension or loopback origins, JSON body limited to 32 KB, per-client rate limit | CORS is a browser control, not authentication; another local process can call loopback directly |
| T12 | Profile persists longer than described | Uses restricted `chrome.storage.session`; UI supports clear/delete and states the limitation | Session storage is not an encrypted production vault; browser/OS compromise is out of scope |
| T13 | Audit records reveal values | Entry schema stores bounded IDs, category/action/status/timing/code only; popup does not render profile values | Category availability and action history are metadata and may themselves be sensitive |
| T14 | Malformed or oversized input exhausts the service | 32 KB JSON limit, strict contract sizes (100 fields/actions), safe errors and rate limiting | Local denial of service remains possible; MVP has no authentication or distributed controls |
| T15 | Remote planner fails during presentation | Timeout and validated deterministic fallback preserve the demo | Fallback proves the architecture, not remote model intelligence |
| T16 | Broad extension permissions or background scanning increase exposure | There is no static content script; all page access uses user-triggered `activeTab`, packaged top-frame injection and no `<all_urls>` | The invoked destination page receives filled values by design; user selection can still be mistaken |
| T17 | Dependency/build supply-chain compromise | Lockfile, reproducible `npm ci`, self-only extension CSP and no remote scripts | The MVP does not sign artifacts or audit all transitive dependencies |
| T18 | Site-specific/custom widgets cause unsafe clicks or false success | Generic/native adapter contract, conservative Google subset, unsupported count and no planner-provided click/navigation action | Live site markup can change; false rejection is preferred and manual Chrome retesting is mandatory |
| T19 | Account identity, page URL/title or neighboring page text reaches the planner | Page-wide text is never collected; location selects an adapter locally only; request contract rejects origin/URL/account/HTML properties | Safe semantic labels and category availability remain metadata and may still reveal form purpose |

## Security invariants and evidence

| Invariant | Evidence |
| --- | --- |
| Planner request contains zero seeded profile values | `tests/integration/privacy-boundary.test.js`, `tests/integration/release-flow.test.js` |
| Planner response contains typed references, not profile values | Contract, fallback, route and privacy-boundary tests |
| Every action is validated before execution | `tests/unit/action-validator.test.js`, `tests/integration/local-fill-flow.test.js` |
| Stale plans and targets are rejected | Snapshot/action-validator integration tests |
| Critical disclosure requires approval | Action-validator/release-flow tests; external manual X10 |
| OTP remains empty | Classifier/release-flow tests; external manual X09 |
| Submission is not silent where guarded submission is supported | Confirmation-overlay/release-flow tests; external manual X11 |
| Unselected tabs and protected pages are not scanned | Eligibility/injector/manifest tests; external manual X12–X13 |
| Unsupported Google widgets are reported and untouched | Adapter tests; external manual X04–X06 |
| Audit/log records contain no seeded values | Audit, safe-logger, privacy-boundary and release-flow tests |
| Extension has no broad hosts, dynamic code or provider secret | `npm run verify:static` and `npm run verify:secrets` |

Run the complete automated gate with `npm run verify`. Chrome-only evidence is recorded in
`tests/manual/acceptance-checklist.md` and `tests/manual/external-page-checklist.md`.

## Privacy properties the team may claim

- Raw values in the seven saved profile categories are kept out of the documented planning request and
  response on tested flows.
- The planner receives category availability and safe form metadata, which are still metadata and not
  “no data.”
- Unknown or malformed planner actions fail closed before value resolution.
- Selected standard native forms can complete the tested scan-to-local-fill flow without adding persistent
  all-sites access. Google Forms support must always be qualified as experimental.
- Final form submission remains under explicit user control in controlled and explicitly verified guarded flows.

## Claims the team must not make

- Formal, mathematical or universal zero-leakage guarantees.
- Protection from a destination page after an approved fill.
- Production-grade encryption, authentication or safety/compatibility on every website or Google Form.
- Detection of every possible sensitive field or encoded/derived private value.
- CAPTCHA/OTP/password automation or autonomous final submission.

## Release review triggers

Repeat the threat-model review before adding a profile category, planner action, persistent storage,
website permission, screenshot/OCR input, public deployment, provider, page-navigation feature or any
property to either planning contract.
