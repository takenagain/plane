# 2FA / MFA — Frontend UI/UX Research

> **Scope:** Browser-side libraries and UI/UX patterns for a 2FA system supporting **three methods only — no email/SMS**:
>
> 1. **Authenticator app (TOTP)**
> 2. **Passkeys (WebAuthn platform authenticators)**
> 3. **FIDO2 hardware security keys (cross-platform / roaming, e.g. YubiKey)**
>
> **Stack:** Next.js + React + Tailwind, with the in-repo `@plane/ui` / `@plane/propel` component libraries.
> **Date of research:** June 2026. Versions and browser-support claims below were verified against npm and vendor docs at that time.
> **Constraint:** This is research only — no application code is changed by this document.

---

## 0. Executive summary

| Concern               | Recommendation                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebAuthn browser glue | **`@simplewebauthn/browser@13.3.0`** — pairs 1:1 with the Python `webauthn` / `py_webauthn` server library                                                                                                                |
| TOTP QR rendering     | Render the **server-provided `otpauth://` URI** as a QR client-side with **`qrcode.react@4.2.0`**, plus always show the manual Base32 secret                                                                              |
| OTP / 6-digit input   | **`input-otp@1.4.2`** (segmented, accessible, autofill-friendly) or the existing `@plane/ui` `Input`                                                                                                                      |
| Reusable components   | `<TwoFactorSetup />`, `<TwoFactorVerify />`, `<MethodCard />`, `<TwoFactorDeviceList />`, `<RecoveryCodesPanel />`, `<LockdownModeToggle />`                                                                              |
| Platform vs roaming   | Drive via server's `authenticatorSelection.authenticatorAttachment` (`"platform"` for passkeys, `"cross-platform"` for security keys); **label the credential after registration via `response.authenticatorAttachment`** |
| Lockdown mode         | Surface a toggle only when **≥2 `cross-platform` credentials** are registered; when on, login offers **security keys only**                                                                                               |

**Dependencies to add (frontend):**

```jsonc
"@simplewebauthn/browser": "13.3.0",
"qrcode.react": "4.2.0",
"input-otp": "1.4.2"
```

> The TOTP secret/QR data and all WebAuthn challenges are produced **server-side**. The frontend never generates secrets; `qrcode.react` only _renders_ an `otpauth://` string the server returns.

---

## 1. Browser WebAuthn libraries

### 1.1 `@simplewebauthn/browser`

- **Latest version (June 2026): `13.3.0`** (published 2026-03-10). Verified on the [npm registry](https://registry.npmjs.org/@simplewebauthn/browser), [npm page](https://www.npmjs.com/package/@simplewebauthn/browser), and [JSR](https://jsr.io/@simplewebauthn/browser/doc).
- Docs: <https://simplewebauthn.dev/docs/packages/browser>. Changelog: <https://github.com/MasterKale/SimpleWebAuthn/blob/master/CHANGELOG.md>.
- Tiny, dependency-free, framework-agnostic (works directly in React). Installs from npm for Node LTS 20.x+; also available via JSR and a UMD bundle.

**Why this library:** it wraps the awkward `ArrayBuffer ↔ base64url` encoding that raw `navigator.credentials` forces on you, normalizes error handling (`WebAuthnError`), and the request/response JSON shapes line up **exactly** with the matching server library, so you can pass options straight through and post responses straight back.

#### API — the two calls you need

Since **v11**, both methods take a **single object** argument with an `optionsJSON` property (passing options positionally is the most common upgrade bug — it throws `TypeError: Cannot read properties of undefined (reading 'challenge')`).

**Registration (add a passkey or security key):**

```ts
import { startRegistration, WebAuthnError } from "@simplewebauthn/browser";

// 1. GET creation options from the server (server lib: generate_registration_options)
const optionsJSON = await api.get("/2fa/webauthn/register/options");

// 2. Invoke the authenticator
let attResp;
try {
  attResp = await startRegistration({ optionsJSON });
} catch (err) {
  if (err instanceof WebAuthnError) {
    // err.name / err.code / err.message / err.cause — see §1.5
    if (err.name === "InvalidStateError") {
      // This authenticator is already registered for the user
    }
  }
  throw err;
}

// 3. POST attResp to the server for verification (server lib: verify_registration_response)
await api.post("/2fa/webauthn/register/verify", attResp);
```

**Authentication (challenge at login):**

```ts
import { startAuthentication } from "@simplewebauthn/browser";

const optionsJSON = await api.post("/2fa/webauthn/auth/options", { email });
const asseResp = await startAuthentication({ optionsJSON });
await api.post("/2fa/webauthn/auth/verify", asseResp);
```

Other exported helpers used in the components below:

| Export                                  | Use                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `browserSupportsWebAuthn()`             | Hide/disable passkey & security-key options when unsupported                 |
| `browserSupportsWebAuthnAutofill()`     | Detect Conditional UI support before wiring autofill                         |
| `platformAuthenticatorIsAvailable()`    | Detect Touch ID / Face ID / Windows Hello to prioritize the **passkey** card |
| `WebAuthnError`                         | `instanceof` checks for precise, friendly error copy                         |
| `WebAuthnAbortService.cancelCeremony()` | Cancel a pending ceremony on client-side route change / modal close          |

`startAuthentication({ optionsJSON, useBrowserAutofill: true })` enables **Conditional UI** (passkey autofill). It requires an `<input autocomplete="webauthn">` (or `"username webauthn"`) in the DOM. Useful on the password/email screen, less relevant to a pure second-factor challenge — noted as a future enhancement, not a v1 requirement.

#### 1.2 Pairing with the Python server library

`@simplewebauthn/browser` is the JS half of the SimpleWebAuthn project, designed to pair with **`@simplewebauthn/server`**. For a Python backend the equivalent is the **`webauthn` / `py_webauthn`** package (`pip install webauthn`), which mirrors the same ceremony:

| Step               | Server (Python `webauthn`)                    | Browser (`@simplewebauthn/browser`)    |
| ------------------ | --------------------------------------------- | -------------------------------------- |
| Register — options | `generate_registration_options(...)` → JSON   | `startRegistration({ optionsJSON })`   |
| Register — verify  | `verify_registration_response(...)`           | (posts `attResp` back)                 |
| Auth — options     | `generate_authentication_options(...)` → JSON | `startAuthentication({ optionsJSON })` |
| Auth — verify      | `verify_authentication_response(...)`         | (posts `asseResp` back)                |

The contract is **JSON passthrough**: the server emits `PublicKeyCredentialCreationOptionsJSON` / `PublicKeyCredentialRequestOptionsJSON`, the browser returns `RegistrationResponseJSON` / `AuthenticationResponseJSON`. Don't reshape the payloads in the frontend.

#### 1.3 Cross-platform (security key) vs platform (passkey)

The selection is dictated **server-side** in the options object via `authenticatorSelection`, then handed to the browser as part of `optionsJSON`:

```jsonc
// Passkey (platform authenticator: Touch ID / Face ID / Windows Hello)
"authenticatorSelection": {
  "authenticatorAttachment": "platform",
  "residentKey": "preferred",      // discoverable credential for passwordless / autofill
  "userVerification": "preferred"
}
```

```jsonc
// FIDO2 hardware security key (cross-platform / roaming, e.g. YubiKey)
"authenticatorSelection": {
  "authenticatorAttachment": "cross-platform",
  "residentKey": "discouraged",    // don't burn limited resident-key slots on the key
  "userVerification": "preferred"
}
```

- `"platform"` → integrated, non-removable authenticator (biometrics). UI label: **Passkey**.
- `"cross-platform"` → roaming authenticator over USB / NFC / Bluetooth. UI label: **Security key**.
- Omitting `authenticatorAttachment` lets the browser offer both — we deliberately set it because the user has already _chosen a method card_, and we want the browser UI to jump straight to the right ceremony.
- **Guidance from vendor docs:** prefer `userVerification: "preferred"` and `residentKey: "preferred"`/`"discouraged"` rather than `"required"`, to avoid blocking users with otherwise-valid authenticators (per the [veduis WebAuthn guide](https://veduis.com/blog/passkeys-passwordless-authentication-webauthn/) and [Corbado's `authenticatorSelection` glossary](https://www.corbado.com/glossary/authenticatorselection)).
- Chrome 129+ also accepts WebAuthn **`hints`** (e.g. `"security-key"`, `"client-device"`, `"hybrid"`) which can further steer the native UI; these are optional sugar on top of `authenticatorAttachment`.

#### 1.4 Detecting / labeling the credential type after registration (for lockdown)

After a successful ceremony, the response carries an **`authenticatorAttachment`** field that tells you what was actually used — this is exactly what lockdown mode needs.

```ts
const attResp = await startRegistration({ optionsJSON });
// attResp.authenticatorAttachment === "platform" | "cross-platform" | undefined
```

- `"platform"` → store/label as a **Passkey**.
- `"cross-platform"` → store/label as a **Security key** → counts toward the **"≥2 hardware keys"** lockdown threshold.
- `undefined` → not all authenticators report it; fall back to server-side signals (the attestation's `transports` — `"usb"`/`"nfc"`/`"ble"`/`"hybrid"` vs `"internal"`, and AAGUID) to classify. **Persist the resolved type server-side**; never let the client be the source of truth for a security decision like lockdown.
- This field has been returned by the library since v6 (changelog: _"`startRegistration()` and `startAuthentication()` will return a new `authenticatorAttachment` value when present"_), and the native equivalent — [`PublicKeyCredential.authenticatorAttachment`](https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/authenticatorAttachment) — has been Baseline across browsers since **November 2023**.

> **Lockdown rule of thumb:** classification for _counting_ should be done on the server from attestation data (`transports`/AAGUID), with `authenticatorAttachment` as a strong hint. The frontend reads back the server's resolved `type` to render the badge and to decide whether to show the lockdown toggle.

#### 1.5 Error handling (`WebAuthnError`)

`WebAuthnError` exposes `.name` (mirrors the DOM exception), `.message` (friendlier), `.code` (programmatic), and `.cause` (the raw `DOMException`). Map common cases to copy:

| `name` / situation                        | User-facing copy                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `NotAllowedError` (cancelled / timed out) | "Setup was cancelled or timed out. Try again."                                              |
| `InvalidStateError` (already registered)  | "This device is already registered on your account."                                        |
| `ERROR_CEREMONY_ABORTED` (`code`)         | Silent — fired by `WebAuthnAbortService` on route change                                    |
| `!browserSupportsWebAuthn()`              | "This browser doesn't support passkeys or security keys. Use an authenticator app instead." |

#### 1.6 Native `navigator.credentials` (fallback reference)

The library is sugar over the native [Web Authentication API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API): `navigator.credentials.create({ publicKey })` for registration and `navigator.credentials.get({ publicKey })` for authentication. Going native means you own all base64url ↔ `ArrayBuffer` encoding and error normalization yourself — not recommended, but useful to know for debugging or a zero-dependency stance. `PublicKeyCredential.getClientCapabilities()` can also probe feature/extension support directly.

#### 1.7 Browser support (June 2026)

- WebAuthn is **Baseline / universally supported** across evergreen Chrome, Edge, Firefox, and Safari, and on iOS 16+, Android 9+, and Windows 10/11 (Windows Hello). Available across browsers since **Sept 2021**.
- **Secure context required:** WebAuthn only works over **HTTPS** (or `localhost`). Gate the UI accordingly in dev.
- **Conditional UI (passkey autofill):** supported in Safari, Chrome, Edge (since ~2025).
- **Coverage gaps:** older Android, locked-down enterprise browser builds, shared/kiosk devices without biometrics. → This is the UX argument for **always keeping the TOTP authenticator-app method available** as the universally-supported fallback. Use `browserSupportsWebAuthn()` / `platformAuthenticatorIsAvailable()` to disable or de-emphasize unavailable method cards with an explanation (never silently grey them out).

Sources: [MDN Web Authentication API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API), [MDN `authenticatorAttachment`](https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/authenticatorAttachment), [Passkeys & WebAuthn complete guide (2026)](https://dev.to/pockit_tools/passkeys-and-webauthn-the-complete-guide-to-killing-passwords-in-your-web-app-22f1), [veduis WebAuthn implementation guide](https://veduis.com/blog/passkeys-passwordless-authentication-webauthn/).

---

## 2. TOTP UX

Primary reference: [How to Create Two-Factor Authentication (2FA) and Best Practices — dev.to](https://dev.to/wesleyisr4/how-to-create-two-factor-authentication-2fa-and-best-practices-4mjl). Supporting: [UX Patterns for Developers — Two-Factor](https://uxpatterns.dev/patterns/authentication/two-factor).

### 2.1 QR code + manual secret entry

- The **server** generates the secret and an `otpauth://totp/Issuer:label?secret=...&issuer=...` URI (e.g. via Python `pyotp`). The frontend renders that URI as a QR with `qrcode.react`, or simply displays a server-rendered QR data-URL `<img>`.
- **Always provide manual entry** alongside the QR — this is both an accessibility requirement (screen readers / users who can't scan) and a fallback for desktop authenticators. Show the **Base32 secret in a monospace, chunked, copy-to-clipboard** field behind a "Can't scan? Enter the code manually" `<details>`/disclosure.
- Give the QR a meaningful `alt` (e.g. `"QR code to add this account to your authenticator app"`).
- Don't expose jargon (TOTP, RFC 6238) in primary copy; say "authenticator app (Google Authenticator, 1Password, Authy…)".

```tsx
import { QRCodeSVG } from "qrcode.react";

<QRCodeSVG value={otpauthUri} size={176} includeMargin aria-hidden="true" />;
// plus a visible, copyable manual secret for a11y
```

### 2.2 Verifying the 6-digit code

- Use a dedicated numeric input with autofill hints. With `input-otp` (segmented) or a plain input:

```tsx
<input
  inputMode="numeric"
  autoComplete="one-time-code"
  pattern="[0-9]{6}"
  maxLength={6}
  aria-describedby="totp-error"
/>
```

- **`autoComplete="one-time-code"`** + **`inputMode="numeric"`** trigger the numeric keypad and OS one-time-code suggestions on mobile.
- **Auto-focus** the field, support **paste**, and **auto-submit** once 6 digits are present. TOTP rotates every 30s, so minimize typing latency.
- On error, announce via `role="alert"` (`aria-describedby`), keep the entered value, and don't wipe the field silently.
- Verify only against the **server** (which allows a ±1 step window for clock drift); never validate TOTP client-side.

### 2.3 Backup / recovery codes

- After TOTP (or first factor) is enabled, **force the user to view and save recovery codes** as a required step — frame "Save your backup codes" as step _N of N_, with the final confirmation button disabled until they confirm they've saved them.
- Provide **Copy all**, **Download `.txt`** (label the file clearly, e.g. `appname-recovery-codes.txt`), and **Print**.
- Generate **multiple single-use codes** (typically 8–10), allow **regeneration** without disabling 2FA (regeneration invalidates the old set), and warn that each code works once.
- At login, offer a clear **"Use a recovery code"** link beneath the verification form.

---

## 3. UI/UX patterns

References:

- [LogRocket — 2FA UX patterns: setup flows](https://blog.logrocket.com/ux-design/2fa-user-flow-best-practices/)
- [LogRocket — 10 usability heuristics for 2FA](https://blog.logrocket.com/ux-design/2fa-design-heuristics/)
- [SaaSFrame — The 2FA UX Paradox](https://www.saasframe.io/blog/the-2fa-ux-paradox-how-to-design-security-that-users-actually-enable)
- [Ihor Chyshkala — The Multi-Method Setup Pattern](https://chyshkala.com/blog/stop-building-2fa-that-users-abandon-the-multi-method-setup-pattern-that-actually-works)
- [UX Patterns for Developers — Two-Factor](https://uxpatterns.dev/patterns/authentication/two-factor)

### 3.1 Setup-wizard pattern (method selection → step-by-step → success)

A linear, progress-indicated wizard reduces abandonment. Generic phases (LogRocket heuristics):

1. **Educate** — one sentence on _what changes_: "We'll ask for a second step only when you sign in on a new device."
2. **Choose method** — method cards (see §4); highlight one as **Recommended**.
3. **Link / enroll** — scan QR (TOTP) or run the WebAuthn ceremony (passkey/security key).
4. **Verify** — enter the 6-digit code (TOTP) or complete the authenticator prompt.
5. **Recovery setup** — view & save backup codes (required).
6. **Success confirmation** — explicit "Two-factor authentication is on" state, what to do next, and a link to manage devices.

Show a **progress indicator** with labeled steps ("Step 3 of 4 — Save backup codes"). Keep QR and verification in the **same logical flow** to minimize context switching. SaaSFrame notes a one-sentence mechanism explanation in the primary CTA reduces perceived burden substantially.

### 3.2 Forced-enrollment pattern (blocking the app until configured)

For onboarding end-step / forced setup for existing users / admin-mandated 2FA:

- Render an **interstitial gate** that blocks the app shell until at least one method is configured. The same `<TwoFactorSetup />` is reused here with a `variant="forced"` (no dismiss / no "skip").
- Be explicit about _why now_ ("Your administrator requires two-factor authentication") and what's required to continue.
- If 2FA is _optional_ (e.g. consumer Settings prompt), use **opinionated, de-emphasized** dismissal — a subtle gray "Not now" rather than a prominent button (SaaSFrame: this nudges fence-sitters without trapping them). For the **forced** variant there is no skip.
- Still surface recovery setup inside the forced flow so users aren't one lost device away from lockout.

### 3.3 Device-management list (Settings)

A list of registered factors, each row showing:

- **Type badge** (Authenticator app / Passkey / Security key) with an icon.
- **Friendly name** (user-editable, e.g. "YubiKey 5C — work").
- **Metadata**: date added, last used.
- **Row actions**: Rename / Reconfigure / **Delete** (with confirmation; deleting the last factor must warn/– or be blocked depending on policy).
- A primary **"Add method"** button opening the setup wizard scoped to a chosen method.
- The **lockdown toggle** lives here (see §4.3).

The [UX Patterns two-factor reference](https://uxpatterns.dev/patterns/authentication/two-factor) shows a clean center-constrained (~24rem) layout for the forms and a "Use a backup code" affordance below the verify form — a good baseline visual spec.

### 3.4 Accessibility, error, loading & copy

- **Accessibility:** label every input; QR always has a manual-entry equivalent; errors via `role="alert"`; full keyboard operability of method cards (they are buttons/radios, not just clickable `div`s); respect focus order through wizard steps; meaningful `alt` text; sufficient contrast on badges.
- **Error states:** specific, recoverable messages (see §1.5 table and §2.2); preserve user input; never blame the user.
- **Loading / pending states:** WebAuthn ceremonies can hang on the OS prompt — show a **"Waiting for your device…"** pending state with the ability to cancel (`WebAuthnAbortService.cancelCeremony()`), and disable duplicate submits. Use `@plane/ui` `Spinner`/`Button` loading props.
- **Copy/tone:** benefit-framed, jargon-free, reassuring. Explain mechanism, recovery, and _why now_ before the user has to ask (SaaSFrame's three questions).

---

## 4. Multi-method UX

### 4.1 Method picker (Authenticator / Passkey / Security key)

Present three **method cards** in a radio-group/list:

| Card                  | Subtitle                                      | Recommended?                                               | Availability gate           |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| **Passkey**           | "Use Face ID, Touch ID, or Windows Hello"     | ✅ Recommended (when `platformAuthenticatorIsAvailable()`) | `browserSupportsWebAuthn()` |
| **Security key**      | "Use a hardware key like YubiKey (USB / NFC)" | —                                                          | `browserSupportsWebAuthn()` |
| **Authenticator app** | "Use a TOTP app — works on any device"        | Universal fallback                                         | Always available            |

- Highlight **one** recommended option rather than presenting three equal choices (reduces decision paralysis — SaaSFrame).
- Treat methods as **cumulative layers**, not exclusive choices: encourage adding more than one (e.g. an authenticator app _and_ a security key) in a single session (Chyshkala's multi-method pattern). This also makes lockdown reachable (needs ≥2 keys).
- Disable unavailable cards **with an inline explanation** (e.g. "Not supported in this browser") instead of hiding or silently greying them.

### 4.2 How login chooses among configured methods

- The challenge screen (`<TwoFactorVerify />`) shows the user's **default/preferred** method first, with a **"Use another method"** switcher listing only the methods they've actually registered.
- For WebAuthn methods the server sends `allowCredentials` (the user's credential IDs + `transports`), so the browser prompts the right authenticator(s). For TOTP it's the 6-digit input. Recovery code is always reachable via a secondary link.
- Default ordering suggestion: most-secure-available first (Security key → Passkey → Authenticator app), but respect a user-set preferred method.

### 4.3 How lockdown mode changes options

- **Lockdown toggle** appears in device management **only when the account has ≥2 registered `cross-platform` (hardware security key) credentials** — gating on two avoids a single-point-of-failure lockout.
- When **lockdown is ON**:
  - Login's method switcher is **restricted to hardware security keys only**; Passkey, Authenticator app, and (per policy) recovery codes are hidden/disabled at the challenge step.
  - The setup/device UI should warn clearly: _"With lockdown on, you can only sign in with a registered hardware security key. Keep at least two keys in safe places."_
  - Disabling lockdown / removing keys below the threshold should require re-authentication (step-up) and auto-disable lockdown if keys drop below 2.
- Because this is a security-critical mode, the **server enforces** lockdown; the frontend only reflects and toggles it. The "≥2 hardware keys" count comes from the server-resolved credential `type` (see §1.4).

---

## 5. Component breakdown & dependencies

### 5.1 Recommended React components

All built on the in-repo `@plane/ui` / `@plane/propel` primitives (`Button`, `Input`, `Spinner`, `Card`, `Badge`, `Tabs`, `modals`, `form-fields`) and Tailwind. The repo already has an analogous segmented-code flow in `apps/web/core/components/account/auth-forms/unique-code.tsx` to model the TOTP input after.

| Component                 | Responsibility                                                                                                                              | Key props / notes                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `<TwoFactorSetup />`      | The reusable wizard (method picker → enroll → verify → recovery → success). Used in onboarding end-step, forced setup, admin, and Settings. | `variant: "onboarding" \| "forced" \| "settings" \| "admin"`; `allowedMethods`; `onComplete`. Forced variant hides skip/dismiss. |
| `<MethodCard />`          | Selectable card for Authenticator / Passkey / Security key.                                                                                 | `type`, `recommended`, `disabled`, `disabledReason`, radio semantics, keyboard-operable.                                         |
| `<TotpEnroll />`          | QR (`qrcode.react`) + copyable manual secret + 6-digit verify.                                                                              | Renders server `otpauthUri`; `autoComplete="one-time-code"`.                                                                     |
| `<WebAuthnEnroll />`      | Runs `startRegistration`; handles platform vs cross-platform, pending/cancel, errors.                                                       | `attachment: "platform" \| "cross-platform"`; reports back `authenticatorAttachment`.                                            |
| `<TwoFactorVerify />`     | Login-time challenge form; chooses among configured methods; "Use another method" + "Use a recovery code".                                  | `availableMethods`, `lockdown`, `onVerified`. Honors lockdown (security-key-only).                                               |
| `<TwoFactorDeviceList />` | Settings list of factors: type badge, name, added/last-used, rename/reconfigure/delete, "Add method".                                       | Hosts `<LockdownModeToggle />`.                                                                                                  |
| `<RecoveryCodesPanel />`  | Display/copy/download/print recovery codes; required-save confirmation; regenerate.                                                         | Blocks wizard completion until confirmed saved.                                                                                  |
| `<LockdownModeToggle />`  | Toggle restricting login to hardware keys; visible only when ≥2 security keys.                                                              | Server-enforced; step-up to change.                                                                                              |
| `useWebAuthn()` (hook)    | Wraps `browserSupportsWebAuthn` / `platformAuthenticatorIsAvailable` / `startRegistration` / `startAuthentication` / abort/error mapping.   | Centralizes capability detection + error→copy mapping.                                                                           |

### 5.2 npm dependencies to add (frontend)

Exact versions verified against npm in June 2026:

```sh
pnpm --filter web add @simplewebauthn/browser@13.3.0 qrcode.react@4.2.0 input-otp@1.4.2
```

```jsonc
// package.json (apps/web)
"@simplewebauthn/browser": "13.3.0",  // WebAuthn passkeys + FIDO2 security keys
"qrcode.react": "4.2.0",              // render server-provided otpauth:// URI as a QR
"input-otp": "1.4.2"                  // optional: segmented, accessible 6-digit input
```

- `@simplewebauthn/browser@13.3.0` — passkey + security-key ceremonies.
- `qrcode.react@4.2.0` — client-side QR rendering (`<QRCodeSVG>` / `<QRCodeCanvas>`). Alternative with **zero new deps**: render a server-generated QR `data:` URL in an `<img>`.
- `input-otp@1.4.2` — optional; the existing `@plane/ui` `Input` (see `unique-code.tsx`) can also serve the 6-digit field.
- **No frontend dependency** is needed for TOTP secret generation or recovery codes — those are server responsibilities (Python `pyotp` / `webauthn`).

---

## 6. Source list

- SimpleWebAuthn browser docs — <https://simplewebauthn.dev/docs/packages/browser>
- SimpleWebAuthn npm — <https://www.npmjs.com/package/@simplewebauthn/browser> (v13.3.0, 2026-03-10)
- SimpleWebAuthn JSR — <https://jsr.io/@simplewebauthn/browser/doc>
- SimpleWebAuthn CHANGELOG — <https://github.com/MasterKale/SimpleWebAuthn/blob/master/CHANGELOG.md>
- MDN Web Authentication API — <https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API>
- MDN `PublicKeyCredential.authenticatorAttachment` — <https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredential/authenticatorAttachment>
- Corbado — `authenticatorSelection` glossary — <https://www.corbado.com/glossary/authenticatorselection>
- Passkeys & WebAuthn complete guide (2026) — <https://dev.to/pockit_tools/passkeys-and-webauthn-the-complete-guide-to-killing-passwords-in-your-web-app-22f1>
- veduis — WebAuthn implementation guide — <https://veduis.com/blog/passkeys-passwordless-authentication-webauthn/>
- dev.to (Wesley) — 2FA & best practices — <https://dev.to/wesleyisr4/how-to-create-two-factor-authentication-2fa-and-best-practices-4mjl>
- UX Patterns for Developers — Two-Factor — <https://uxpatterns.dev/patterns/authentication/two-factor>
- LogRocket — 2FA UX patterns — <https://blog.logrocket.com/ux-design/2fa-user-flow-best-practices/>
- LogRocket — 10 usability heuristics for 2FA — <https://blog.logrocket.com/ux-design/2fa-design-heuristics/>
- SaaSFrame — The 2FA UX Paradox — <https://www.saasframe.io/blog/the-2fa-ux-paradox-how-to-design-security-that-users-actually-enable>
- Ihor Chyshkala — Multi-method setup pattern — <https://chyshkala.com/blog/stop-building-2fa-that-users-abandon-the-multi-method-setup-pattern-that-actually-works>
- npm versions verified: `qrcode.react@4.2.0`, `input-otp@1.4.2`, `@simplewebauthn/browser@13.3.0`
