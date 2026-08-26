# PrivacyFill AI five-minute demo

## Demo objective

Show one complete proof: the planner can decide *where* a private category belongs without receiving
the category's real value, while the extension validates and resolves it locally and keeps submission
under user control.

Use fallback mode for the judged demo. It is deterministic, requires no API key and exercises the same
privacy request/response boundary as remote mode.

## Team roles

| Member | Primary role | One-sentence ownership |
| --- | --- | --- |
| 1 | Presenter | Explain the problem, user benefit and research boundary |
| 2 | Operator | Drive Chrome and follow the exact click sequence |
| 3 | Architecture lead | Explain the trust boundary, contracts and local resolution |
| 4 | Evidence/recovery lead | Watch server/health, call out test evidence and recover if needed |

All four members should be able to draw the same three-part boundary: **untrusted page → trusted local
extension → value-blind planner**, followed by **local validation and resolution → reviewed page**.

## Pre-demo setup (10 minutes before judging)

1. Use the presentation laptop and checkout `codex/mvp-implementation` at the intended release commit.
2. Ensure `.env` is absent or has `PLANNER_MODE=fallback`. Never present with a visible API key.
3. From the repository root run:

   ```powershell
   npm ci
   npm run verify
   npm run build:extension
   npm run server
   ```

4. Confirm `http://localhost:8787/api/health` reports fallback as the effective planner.
5. In `chrome://extensions`, reload the unpacked `dist/extension` build and confirm no errors.
6. Open the profile page, select **Use fictional demo profile**, and save it to the session.
7. Reset both demo forms and clear the extension audit log.
8. Complete all rows in `tests/manual/acceptance-checklist.md` and record Chrome version/operator.
9. Close notifications, private tabs, password-manager prompts and unrelated applications.
10. Keep the backup recording and screenshots locally available without real PII.

## Five-minute primary script

### 0:00–0:35 — Problem and promise

**Presenter:** “Application forms repeatedly ask for high-value identity data. A normal cloud agent may
receive the same raw values it is trying to place. PrivacyFill AI separates reasoning from secret handling:
the planner sees anonymous fields and typed categories, while the value stays in a temporary local Chrome
profile until a validated local fill.”

Show the scholarship form and extension popup side by side. Do not open source code yet.

### 0:35–1:05 — Local profile boundary

Open the extension profile page.

**Operator:** Point to “Session profile,” the masked critical inputs and the local/privacy explanation.
Use the already-saved fictional profile; do not expose the values during the judged flow.

**Architecture lead:** “The popup knows that seven categories are available. The profile-to-value mapping
is in `chrome.storage.session`; it is temporary and we do not call it an encrypted vault.”

### 1:05–1:45 — Scan and classify

Return to `http://localhost:8787/demo/scholarship.html`. Open the popup and select **Scan**.

Expected: the scan reports supported fields and identifies Aadhaar as critical. Non-profile programme,
income and consent controls may remain for the user.

**Architecture lead:** “The page is treated as untrusted. We collect labels, types, required state and
safe options—never current field values, full HTML or a screenshot. Field IDs are anonymous.”

### 1:45–2:25 — Prove the privacy boundary

Select **View** under “Inspect safe payload,” expand **Exact checked JSON**, and pause on the JSON.

Point out:

- `availableProfileKeys` contains names such as `PROFILE.EMAIL`, not an email address;
- fields contain anonymous IDs and safe metadata;
- the privacy check reports zero matches;
- there are no `value`, HTML, selector or profile-object properties.

**Presenter:** “This is the exact object eligible to cross the boundary, not a mock diagram.”

### 2:25–3:15 — Plan, validate and fill locally

Select **Fill**. Approve the critical-identifier disclosure prompt when asked.

Expected: supported fields fill and highlight; the popup identifies the planner as fallback and reports
the local fill result.

**Architecture lead:** “The response contains actions such as `fill_private(field_4, PROFILE.AADHAAR)`.
It cannot carry the identifier itself. The extension checks the response schema, correlation IDs and a
fresh DOM snapshot, then resolves the value locally and dispatches normal input/change events.”

Open **View privacy audit**. Point out field IDs, action/status/timing metadata and the absence of values.

### 3:15–4:05 — Human control at submission

Select the form's **Review and submit locally** button.

Expected: the extension-owned dialog shows the form name, filled count and critical category names but
no private values.

Select **Cancel** first and show that the form stays editable. Submit again, select **Submit once**, and
show the local completion message.

**Presenter:** “The planner never authorizes submission. Approval is explicit, scoped to one attempt and
immediately rearmed.”

### 4:05–4:35 — Generality and fail-closed behavior

Open `http://localhost:8787/demo/service-registration.html`, scan it, and point out the mixed label/ARIA
metadata and the OTP field.

**Operator:** Run **Fill** and approve PAN. Show that mapped fields fill but OTP remains empty.

**Architecture lead:** “Unknown sensitive fields have no fillable profile key. Unsupported, stale,
disabled, readonly or malformed targets are rejected locally.”

### 4:35–5:00 — Evidence, limitation and close

**Evidence lead:** “Our automated gate covers contracts, seeded-value leakage, local execution, remote
failure fallback, audit safety and submission interception. We also run 13 Chrome checks on the release
laptop.”

**Presenter:** “This prototype is intentionally localhost-only and label-driven. Our contribution is an
inspectable end-to-end web implementation of the available-but-invisible pattern—not a claim of universal
zero leakage or production encrypted storage.”

Close with: “The AI decides the category; trusted local code handles the secret; the user controls the
final disclosure.”

## Reset and repeat

Perform this sequence before every run:

1. Select **Reset form** on both demo forms.
2. Open the popup, select **View privacy audit**, then **Clear**.
3. Confirm the fictional session profile is ready; recreate it only if Chrome was restarted.
4. Refresh the target demo page so its field registry and submission state are clean.
5. Open a fresh popup and begin with **Scan**.

The release gate requires two consecutive clean runs on each form without code edits.

## Recovery paths

| Symptom | Say | Recovery |
| --- | --- | --- |
| Backend unavailable | “The extension fails closed when planning is unavailable.” | Run `npm run server`, refresh page, reopen popup and scan |
| Popup says profile missing | “Values are session-only by design.” | Open profile, **Use fictional demo profile**, save, return and scan |
| Extension not responding | “We will reload the locally built package.” | `npm run build:extension`, reload at `chrome://extensions`, refresh form |
| Stale-plan rejection | “The page changed after planning, so local validation rejected the old plan.” | Refresh or reset, then scan and plan again |
| Remote mode fails | “Remote output is not trusted; the backend is designed to fall back.” | Confirm fallback result or restart with `PLANNER_MODE=fallback` |
| Critical prompt dismissed | “Critical disclosure needs a positive decision.” | Select Fill again and approve only for fictional data |
| Browser demo cannot recover within 30 seconds | “Here is the same release flow recorded after the full gate.” | Play the backup recording, then answer from architecture/test evidence |

Never debug by pasting an API key, real identity data, complete profile object or raw provider response
into the browser console or presentation chat.

## Likely judge questions

**Is the planner seeing no data?** No. It sees minimized metadata: labels, types, category availability,
anonymous IDs, required state and safe options. It does not receive the saved category values in the
tested contract.

**How is this different from browser autofill?** The MVP demonstrates value-blind semantic planning,
strict action contracts, a visible outbound privacy proof, fresh local validation, audit metadata and
submission control. It is not proposed as a replacement for mature password managers.

**What if the AI is malicious?** Its output is untrusted. Only five action types and strict properties are
accepted; targets and snapshots are rechecked locally; literal private values cannot be used for a private
fill.

**What did the research paper contribute?** The paper motivates type-preserving “available but invisible”
GUI mediation across mobile screenshots/XML. This MVP adapts the separation to DOM forms and makes the
request, contract checks, fallback, audit and submission boundary directly inspectable.

**Can a website read a filled value?** Yes, after approved insertion the destination page can access its
own DOM. The protected boundary is planning, not intentional disclosure to the chosen destination.

**Is session storage encrypted?** The MVP makes no such claim. It uses temporary extension session
storage; production would require stronger platform-backed protection and lifecycle controls.
