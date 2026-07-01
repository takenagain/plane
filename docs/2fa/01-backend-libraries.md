# 2FA / MFA — Backend Library Research (Django / Python)

> Research document for implementing **local** two-factor authentication in Plane's
> Django backend (`apps/api`). No email / SMS factors. Three supported methods:
>
> 1. **Authenticator app (TOTP)**
> 2. **Passkeys** (WebAuthn — platform / synced credentials)
> 3. **FIDO2 security keys** (cross-platform hardware authenticators, e.g. YubiKey) —
>    must be **distinguishable** from passkeys so a _lockdown mode_ can restrict login
>    to hardware security keys only.
>
> Researched **June 2026**. Version numbers and release dates are taken from PyPI at
> time of writing — re-pin before merging.

---

## 0. Repository context (verified from the repo)

| Item                         | Value                                                           | Source                                                   |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Python runtime               | **3.13.2** (`python:3.13.2-alpine`)                             | `apps/api/Dockerfile.api:1`, `apps/api/Dockerfile.dev:1` |
| Django                       | **6.0.5**                                                       | `apps/api/requirements/base.txt:4`                       |
| DRF                          | 3.17.1                                                          | `apps/api/requirements/base.txt:6`                       |
| `cryptography`               | **48.0.1** (already a direct dep)                               | `apps/api/requirements/base.txt:56`                      |
| `PyJWT`                      | 2.13.0                                                          | `apps/api/requirements/base.txt:69`                      |
| Redis / django-redis         | 7.4.0 / 6.0.0 (available for challenge storage + rate limiting) | `apps/api/requirements/base.txt:15-16`                   |
| `zxcvbn` (password strength) | 4.5.0                                                           | `apps/api/requirements/base.txt:65`                      |

**Requirements layout** (where deps are declared and pinned):

- `apps/api/requirements/base.txt` — all shared runtime deps, **exact `==` pins**. New 2FA deps go here.
- `apps/api/requirements/production.txt` — `-r base.txt` + `gunicorn`.
- `apps/api/requirements/local.txt` — `-r base.txt` + dev tooling (`ruff`, debug toolbar).
- `apps/api/requirements/test.txt` — test deps.
- `apps/api/requirements.txt` (repo-root convenience) — `-r requirements/production.txt`.

**Docker build context** (`apps/api/Dockerfile.api`): builds inside Alpine with a
`.build-deps` virtual package that already includes `g++`, `gcc`, `cargo`, `make`,
`libffi-dev`, `postgresql-dev`, `libc-dev`, `linux-headers`. Runtime image keeps
`libpq`, `libxslt`, `xmlsec`, `ca-certificates`, `openssl`. This means the Rust/C
toolchain needed to build `cryptography` (and `cbor2`'s optional C extension) is
**already present**, so the recommended pure-Python/`cryptography`-based stack adds
**no new system packages**. (See §6 for the one caveat: avoid `Pillow`.)

---

## 1. TOTP — `PyOTP`

- **PyPI:** https://pypi.org/project/PyOTP/ · **Source:** https://github.com/pyauth/pyotp
- **Latest version:** **2.10.0** (released **2026-06-14**) — freshly updated, so the
  project is **actively maintained** (previous release 2.9.0 was 2023-07-27; 2.10.0
  brings it current).
- **License:** MIT · **Python:** `>=3.8` (works on 3.13) · **Status:** Production/Stable
- **Maintainer:** Andrey Kislyuk / the `pyauth` org (same org that publishes `django-otp`).
- **Dependencies:** none (pure Python).

### API usage

```python
import pyotp

# 1. Generate a per-user base32 secret (store ENCRYPTED at rest — see §4)
secret = pyotp.random_base32()            # 32-char base32, Google-Authenticator compatible

totp = pyotp.TOTP(secret)                 # defaults: SHA1, 6 digits, 30s period (RFC 6238)

# 2. Provisioning URI -> render as QR for the authenticator app
uri = totp.provisioning_uri(name="alice@example.com", issuer_name="Plane")
# 'otpauth://totp/Plane:alice%40example.com?secret=...&issuer=Plane'

# 3. Verification with a drift window (valid_window=1 -> accept +/-1 step = +/-30s)
totp.verify(user_supplied_code, valid_window=1)   # -> True / False
```

- **Provisioning URI:** `TOTP.provisioning_uri(name, issuer_name)` produces the
  standard `otpauth://totp/...` URI. `pyotp.parse_uri(...)` reverses it.
- **QR generation:** PyOTP **does not** render QR images — it only emits the
  `otpauth://` URI. You render the QR yourself (see QR libs below) **or** return the
  URI to the frontend and render it client-side. Either is fine; client-side rendering
  keeps the secret off any image pipeline.
- **Drift window:** `verify(code, valid_window=N)` checks `N` steps before/after the
  current step. `valid_window=1` (±30 s) is the common, recommended setting. There is
  also `totp.at(for_time)` for explicit time and `TOTP(secret, digits=, interval=, digest=)`
  for non-default parameters.
- **HOTP** is also supported (`pyotp.HOTP`) but is not needed here.

### QR code generation libraries (for the provisioning URI)

| Library     | Latest    | Released   | Deps                                                        | Notes                                                                                               |
| ----------- | --------- | ---------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **`segno`** | **1.6.6** | 2025-03-12 | **none (pure Python)**                                      | Recommended for server-side rendering. SVG/PNG without native libs. https://pypi.org/project/segno/ |
| `qrcode`    | 8.2       | 2025-05-01 | `colorama`; PNG via `pypng` or **`Pillow`** (`qrcode[pil]`) | https://pypi.org/project/qrcode/ — avoid `[pil]` on Alpine (Pillow needs `jpeg-dev`/`zlib-dev`).    |

> **Recommendation:** prefer **client-side QR rendering** from the `otpauth://` URI
> (e.g. a JS QR component) so the secret never touches an image pipeline. If you must
> render server-side, use **`segno`** (zero dependencies, no native build) rather than
> `qrcode[pil]`. `django-otp` itself ships optional `qrcode`/`segno` extras.

---

## 2. WebAuthn / FIDO2 / Passkeys

Three relevant options were evaluated.

### 2a. `py_webauthn` (PyPI package name: `webauthn`) — **recommended**

- **PyPI:** https://pypi.org/project/webauthn/ · **Source:** https://github.com/duo-labs/py_webauthn
- **Latest version:** **2.8.0** (released **2026-06-13**) · prior 2.7.1 (2026-02-11), 2.7.0 (2025-09-04).
- **License:** BSD-3-Clause · **Python:** `>=3.10` (works on 3.13) · **Status:** Production/Stable
- **Maintainer:** **Duo Labs (Cisco)** — very healthy: ~5.9M downloads/month, regular releases.
- **Dependencies:** `cryptography>=46.0.0`, `pyOpenSSL>=26.0.0`, `cbor2>=5.6.5,<6.0.0`,
  `pyasn1>=0.6.2`, `pyasn1-modules>=0.4.2`.
  - Repo already pins `cryptography==48.0.1` ✅ (satisfies `>=46`).
  - `pyOpenSSL`, `cbor2`, `pyasn1`, `pyasn1-modules` are **new transitive deps** (pin them — see §6).

**Scope:** server-side Relying Party (RP) implementation of the WebAuthn-2 API. It
supports _all_ FIDO2 authenticators — security keys, Touch ID / Face ID, Windows
Hello, Android, etc. It is framework-agnostic (no Django coupling), which is exactly
what we want for a custom integration with full control over credential storage and
lockdown logic.

**Core API (the entire surface is 4 functions + 2 helpers):**

```python
from webauthn import (
    generate_registration_options, verify_registration_response,
    generate_authentication_options, verify_authentication_response,
    options_to_json, base64url_to_bytes,
)
```

- **Registration ceremony:** `generate_registration_options(rp_id, rp_name, user_id,
user_name, attestation=..., authenticator_selection=..., exclude_credentials=...)`
  → `options_to_json(...)` to the browser → browser calls
  `navigator.credentials.create()` → `verify_registration_response(credential=...,
expected_challenge=..., expected_origin=..., expected_rp_id=...,
require_user_verification=...)`.
- **Authentication ceremony:** `generate_authentication_options(rp_id,
allow_credentials=..., user_verification=...)` → browser `navigator.credentials.get()`
  → `verify_authentication_response(credential=..., expected_challenge=...,
expected_rp_id=..., expected_origin=..., credential_public_key=...,
credential_current_sign_count=..., require_user_verification=...)`.
- **Attestation:** set `attestation=AttestationConveyancePreference.DIRECT` in
  registration options to receive an attestation statement (needed to read the AAGUID
  reliably and to validate hardware-key provenance for lockdown mode).

**`verify_registration_response(...)` returns a `VerifiedRegistration`** containing the
fields you persist and the signals used to classify the authenticator:

| Field                                                           | Use                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `credential_id` (bytes)                                         | Primary lookup key for the stored credential.                           |
| `credential_public_key` (bytes)                                 | Stored; used to verify future assertions.                               |
| `sign_count` (int)                                              | Stored; replay protection (see §4).                                     |
| `aaguid` (str)                                                  | Authenticator model id — map against FIDO MDS to identify e.g. YubiKey. |
| `credential_device_type`                                        | `CredentialDeviceType.SINGLE_DEVICE` vs `MULTI_DEVICE`.                 |
| `credential_backed_up` (bool)                                   | Whether the credential is backed up / synced.                           |
| `fmt`, `attestation_object`, `credential_type`, `user_verified` | Attestation/verification metadata.                                      |

#### Distinguishing **security keys** from **passkeys** (for lockdown mode)

This is the crux of the requirement. WebAuthn gives several signals; combine them:

1. **`authenticatorAttachment`** (on the credential response, surfaced as
   `RegistrationCredential.authenticator_attachment`):
   - `"platform"` → built-in authenticator (Touch ID, Windows Hello) → **passkey**.
   - `"cross-platform"` → roaming/removable authenticator → **likely a security key**.
2. **`transports`** (`AuthenticatorAttestationResponse.transports`):
   - `["internal"]` / `["hybrid"]` / `["cable"]` → platform or phone passkey.
   - includes `"usb"` / `"nfc"` / `"ble"` → roaming hardware key.
3. **Backup flags → `credential_device_type` + `credential_backed_up`** (derived from the
   `BE`/`BS` authenticator-data flags, exposed by py_webauthn as the
   `CredentialDeviceType` enum):
   - `MULTI_DEVICE` + `credential_backed_up == True` → **synced passkey** (iCloud / Google
     Password Manager). A discrete FIDO2 security key is **not** backup-eligible.
   - `SINGLE_DEVICE` + `credential_backed_up == False` → **device-bound** credential
     (a hardware security key, or a non-synced platform credential).
4. **`aaguid` + FIDO MDS** (most authoritative): with `attestation=DIRECT` you get the
   AAGUID, which you can match against the [FIDO Metadata Service](https://fidoalliance.org/metadata/)
   to positively identify the make/model (e.g. a specific YubiKey series) and read its
   certified authenticator characteristics.

**Recommended classification rule for "hardware security key" (lockdown-eligible):**

> `authenticator_attachment == "cross-platform"` **AND** transports include a roaming
> transport (`usb`/`nfc`/`ble`) **AND** `credential_device_type == SINGLE_DEVICE` /
> `credential_backed_up == False`. For a strict lockdown deployment, additionally
> require `attestation=DIRECT` and verify the `aaguid` against an allowlist of approved
> hardware-key models via FIDO MDS.

Persist a boolean like `is_hardware_security_key` (plus `aaguid`, `attachment`,
`transports`, `device_type`, `backed_up`) on the credential row at registration time so
lockdown mode can filter `allow_credentials` to only those rows.

**Steering registration toward a security key:** set
`authenticator_selection=AuthenticatorSelectionCriteria(authenticator_attachment=
AuthenticatorAttachment.CROSS_PLATFORM, resident_key=ResidentKeyRequirement.DISCOURAGED,
user_verification=REQUIRED)` and/or `hints=[PublicKeyCredentialHint.SECURITY_KEY]`.
For passkeys, use `PLATFORM` + `resident_key=REQUIRED` (discoverable credential) and
`hints=[CLIENT_DEVICE]`.

> **residentKey / discoverable credentials:** passkeys should be **discoverable**
> (`resident_key=REQUIRED`) so they enable usernameless login; a second-factor-only
> security key can use `resident_key=DISCOURAGED` to conserve the key's limited slot
> storage.

### 2b. `fido2` (Yubico `python-fido2`)

- **PyPI:** https://pypi.org/project/fido2/ · **Source:** https://github.com/Yubico/python-fido2
- **Latest version:** **2.2.0** (released **2026-04-15**) · prior 2.1.1 (2026-01-19), 2.0.0 (2025-05-20).
- **License:** BSD-2-Clause · **Python:** `>=3.10,<4` · **Status:** Production/Stable
- **Maintainer:** **Yubico** — actively maintained, ~2M downloads/month.
- **Dependencies:** `cryptography>=2.6,<49,!=35` (repo's 48.0.1 satisfies this); optional
  `pyscard` for NFC.

**Scope:** broader than `py_webauthn`. It implements both **client-side** CTAP1/CTAP2
device communication (talking to a USB/NFC authenticator directly) _and_ server-side
RP helpers (`fido2.server.Fido2Server`, `fido2.webauthn`). It is the most authoritative
library for FIDO2 internals and attestation/MDS handling.

**When to choose it:** if you need to talk to authenticators directly from Python
(desktop/CLI), or want Yubico's first-party attestation/MDS tooling. For a **web RP**
(our case), it is heavier and its server API is lower-level / more ceremony than
`py_webauthn`. It is a reasonable **alternative** to `py_webauthn`, and a useful
**companion** if you later want robust FIDO MDS / attestation-chain validation for
strict hardware-key allowlisting in lockdown mode.

### 2c. `django-otp` / `django-two-factor-auth` ecosystem

**`django-otp`** — https://pypi.org/project/django-otp/

- **Latest:** **1.7.0** (2026-01-07) · License: Unlicense · Python `>=3.8` · Django `>=4.2`.
- Pluggable OTP framework integrating with `django.contrib.auth`; ships TOTP/HOTP plugins
  and an `otp_required` decorator + middleware.
- **Maintenance status (important):** the README explicitly states the project is
  _"stable and maintained, but is no longer actively used by the author and is not
  seeing much ongoing investment."_ It accepts well-formed PRs but is in maintenance
  mode. It also has **no WebAuthn/passkey support** of its own.

**`django-two-factor-auth`** — https://pypi.org/project/django-two-factor-auth/

- **Latest:** **1.18.1** (2025-09-27) · License: MIT · **Jazzband** project · Python `>=3.9`.
- Opinionated, batteries-included 2FA on top of `django-otp`: full login flow, setup
  wizard, recovery codes, and an **optional `webauthn` extra** (`webauthn>=2.0,<2.99`).
- **Dependencies:** `django-otp>=0.8.0`, **`qrcode<9`**, **`django-phonenumber-field<9`**,
  `django-formtools` (i.e. it pulls phone-number machinery aimed at SMS/call factors we
  explicitly do **not** want).
- **Compatibility caveat (decisive):** its README states compatibility with **Django
  4.2 / 5.0 / 5.1 on Python 3.9–3.13**. This repo runs **Django 6.0.5**, which is
  **outside** the declared support matrix. Adopting it would mean betting on
  unverified Django 6 compatibility _and_ dragging in SMS/phone dependencies plus an
  opinionated UI/flow that doesn't match a custom DRF + SPA design.

> **Verdict on the Django ecosystem:** `django-two-factor-auth` is the fastest path for
> a _traditional server-rendered_ Django app that wants SMS/TOTP/limited WebAuthn out of
> the box — but it is the **wrong fit here** because of (a) the Django 6.0 support gap,
> (b) unwanted phone/SMS dependencies, (c) an opinionated UI flow, and (d) limited
> control over the security-key-vs-passkey distinction that _lockdown mode_ requires.
> `django-otp` is healthier as a _concept_ but is in low-investment maintenance mode and
> brings no WebAuthn. **Build directly on `PyOTP` + `py_webauthn`** for full control.

#### Comparison summary

| Capability                              | `py_webauthn` (`webauthn`) | `fido2` (Yubico)         | `django-two-factor-auth`              |
| --------------------------------------- | -------------------------- | ------------------------ | ------------------------------------- |
| Latest / date                           | 2.8.0 / 2026-06-13         | 2.2.0 / 2026-04-15       | 1.18.1 / 2025-09-27                   |
| Python                                  | ≥3.10                      | ≥3.10,<4                 | ≥3.9                                  |
| Django coupling                         | none (clean)               | none                     | tight (full app)                      |
| Reg + auth ceremonies                   | ✅ simple 4-fn API         | ✅ lower-level           | ✅ (built-in flow)                    |
| Attestation                             | ✅ (DIRECT)                | ✅ (best-in-class + MDS) | partial (via extra)                   |
| Platform vs cross-platform attachment   | ✅ exposed                 | ✅ exposed               | hidden behind flow                    |
| `credential_device_type` / backup flags | ✅ returned                | ✅ available             | not surfaced                          |
| Discoverable / resident keys            | ✅                         | ✅                       | limited                               |
| Client-side CTAP (talk to USB key)      | ❌ (server only)           | ✅                       | ❌                                    |
| Django 6.0 ready                        | ✅ (framework-agnostic)    | ✅                       | ⚠️ declared ≤5.1                      |
| Maintenance health                      | very active (Duo/Cisco)    | very active (Yubico)     | active (Jazzband)                     |
| Unwanted deps                           | none                       | optional `pyscard`       | `django-phonenumber-field`, phone/SMS |

---

## 3. Recommended library stack

| Concern                                       | Library                                                              | Version                    | Why                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TOTP**                                      | `pyotp`                                                              | 2.10.0                     | De-facto standard, zero deps, freshly maintained, RFC 6238, GA-compatible URIs.                                                                                                                       |
| **WebAuthn (registration + assertion)**       | `webauthn` (`py_webauthn`)                                           | 2.8.0                      | Clean framework-agnostic 4-function API; surfaces attachment, transports, AAGUID, device-type/backup flags needed to distinguish security keys from passkeys for lockdown mode; Duo/Cisco-maintained. |
| **Crypto primitives**                         | `cryptography`                                                       | 48.0.1 _(already present)_ | Required by `py_webauthn`; no new pin needed.                                                                                                                                                         |
| **QR rendering**                              | _client-side from `otpauth://` URI_ (preferred) **or** `segno` 1.6.6 | 1.6.6                      | Keep the secret off the server image pipeline; if server-side is required, `segno` is pure-Python (no Pillow / no native build on Alpine).                                                            |
| **Challenge management**                      | existing **Redis** (`django-redis` 6.0.0)                            | —                          | Store per-ceremony challenge + nonce with a short TTL; no new dep.                                                                                                                                    |
| **Credential / secret storage**               | Django ORM (Postgres) + `cryptography` Fernet                        | —                          | Encrypt TOTP secrets at rest; store WebAuthn public key, `sign_count`, AAGUID, attachment, transports, device-type, `is_hardware_security_key`.                                                       |
| **Rate limiting**                             | existing Redis + custom DRF throttle (or `django-redis`)             | —                          | Throttle TOTP/assertion verification; no new dep.                                                                                                                                                     |
| _(optional)_ **FIDO MDS / attestation depth** | `fido2` (Yubico)                                                     | 2.2.0                      | Add only if strict hardware-key allowlisting via FIDO Metadata Service is needed for lockdown mode.                                                                                                   |

**Net new third-party dependencies: `pyotp`, `webauthn` (+ its transitive
`pyOpenSSL`, `cbor2`, `pyasn1`, `pyasn1-modules`), and optionally `segno`.**
Everything else (crypto, Redis, Postgres) is already in the repo.

### Suggested data model sketch (no code written — for reference)

- `UserMFA`: `user`, `is_enabled`, `totp_secret_encrypted`, `totp_confirmed_at`,
  `lockdown_mode` (bool).
- `WebAuthnCredential`: `user`, `credential_id` (unique), `public_key`, `sign_count`,
  `aaguid`, `attachment` (`platform`/`cross-platform`), `transports`, `device_type`
  (`single`/`multi`), `backed_up` (bool), `is_hardware_security_key` (bool),
  `nickname`, `created_at`, `last_used_at`.
- `MFARecoveryCode`: `user`, `code_hash`, `used_at` (nullable).
- WebAuthn challenges kept in **Redis** keyed by session/user with a short TTL (not in DB).

---

## 4. Security best practices

Sourced from PyOTP's own RFC checklist, the dev.to "How to Create 2FA and Best
Practices" article (https://dev.to/wesleyisr4/how-to-create-two-factor-authentication-2fa-and-best-practices-4mjl),
the [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html),
and [Teleport's Authentication Best Practices](https://goteleport.com/blog/authentication-best-practices/).

- **Encrypt TOTP secrets at rest.** Never store the base32 secret in plaintext. Encrypt
  with `cryptography`'s Fernet (or a KMS) using a key from the environment/secret store,
  _not_ the Django `SECRET_KEY`. Decrypt only to verify a code / regenerate the QR.
- **Two-phase TOTP enrollment.** Store the candidate secret in a temporary field, require
  the user to confirm one valid code before marking 2FA enabled — proves the
  authenticator was provisioned correctly.
- **Backup / recovery codes.** Generate ~10 single-use, high-entropy codes; store only
  **hashes** (e.g. salted, like passwords). Mark used codes consumed. Show plaintext
  once. Recovery codes are the fallback when no factor is available — but in **lockdown
  mode** they must be disabled/disallowed (otherwise they bypass the hardware-key
  requirement).
- **WebAuthn replay protection (sign counter).** Persist `sign_count` per credential. On
  each assertion, `verify_authentication_response` checks the new counter; reject (or
  flag/clone-warn) if the returned counter is **not greater** than the stored value.
  Note: some authenticators (notably many passkeys/Touch ID) always report `0` — treat
  `0` as "counter unsupported" rather than a hard failure, but enforce monotonicity when
  the counter is non-zero.
- **Challenge expiry / nonce handling.** Generate a cryptographically random challenge
  per ceremony, bind it to the user's session, store server-side (Redis) with a **short
  TTL (≈2–5 min)**, and **consume it single-use** on verification. Always validate
  `expected_origin` and `expected_rp_id` to bind ceremonies to your domain (phishing
  resistance).
- **Session must be flagged 2FA-verified.** Only mark the session/JWT as fully
  authenticated _after_ the second factor verifies. Never issue a privileged session on
  password alone. Require re-authentication (password + current factor) to change or
  disable 2FA, add/remove credentials, or toggle lockdown mode.
- **Rate limiting.** Throttle failed TOTP and assertion attempts (per-user and per-IP)
  using Redis — TOTP has only a 6-digit space, so brute force is real. Use the existing
  Redis instance; add lockout/backoff after repeated failures.
- **User verification.** Set `require_user_verification=True` for passkeys (biometric/PIN
  gives a true second factor). For second-factor-only security keys, UV can be
  `preferred`. In strict lockdown, require UV + attestation.
- **Prefer phishing-resistant factors.** Both OWASP and Teleport recommend
  passkeys/hardware tokens over TOTP; offer all three and let high-privilege/lockdown
  accounts require hardware keys. (This is exactly what _lockdown mode_ enforces.)
- **Avoid SMS/email factors** — out of scope here by design, and discouraged by the
  sources (SIM-swap / interception).
- **Use maintained libraries** — the chosen stack (`pyotp` 2.10.0, `py_webauthn` 2.8.0)
  is current; avoid abandoned ones.

---

## 5. Docker / deployment notes

- **Python version:** the API image is `python:3.13.2-alpine`
  (`apps/api/Dockerfile.api:1`). All recommended libs support 3.13 (`pyotp` ≥3.8,
  `webauthn` ≥3.10, `segno` ≥3.5, `fido2` ≥3.10,<4).
- **System dependencies:** **none new required.** The build stage already installs the
  C/Rust toolchain (`gcc`, `g++`, `cargo`, `make`, `libffi-dev`, `postgresql-dev`,
  `libc-dev`, `linux-headers`) used to compile `cryptography`. `py_webauthn`'s new
  transitive deps are pure-Python (`pyOpenSSL`, `pyasn1`, `pyasn1-modules`) or build
  cleanly with the present toolchain (`cbor2` has an optional C extension with a
  pure-Python fallback). Runtime `openssl`/`ca-certificates` are already present.
- **Caveat — avoid `Pillow`:** do **not** add `qrcode[pil]`. On Alpine, Pillow needs
  extra native dev headers (`jpeg-dev`, `zlib-dev`, `freetype-dev`, …) and would bloat
  the image. Use **client-side QR rendering** or pure-Python **`segno`** instead.
- **How deps are added:** append exact `==` pins to
  `apps/api/requirements/base.txt` (the shared base that `production.txt`,
  `local.txt`, and `test.txt` all include via `-r base.txt`). The Dockerfiles install
  from these files (`pip install -r requirements.txt` for prod,
  `-r requirements/local.txt` for dev), so no Dockerfile change is needed — only a
  rebuild.
- **`cryptography` is already pinned** at 48.0.1 and satisfies `py_webauthn`'s
  `>=46.0.0` and `fido2`'s `<49` constraints — no bump needed.

---

## 6. Exact dependency lines to add

Append to **`apps/api/requirements/base.txt`** (versions current as of 2026-06; re-pin
at integration time):

```text
# 2FA — TOTP (authenticator apps)
pyotp==2.10.0
# 2FA — WebAuthn: passkeys + FIDO2 security keys (server-side RP)
webauthn==2.8.0
# 2FA — pin py_webauthn transitive deps for reproducible builds
pyOpenSSL==26.0.0
cbor2==5.6.5
pyasn1==0.6.2
pyasn1-modules==0.4.2
# 2FA — QR rendering for TOTP provisioning URIs (pure-Python; omit if rendering QR client-side)
segno==1.6.6
```

> Notes:
>
> - `cryptography==48.0.1` is **already present** — do not re-add.
> - The four transitive pins (`pyOpenSSL`, `cbor2`, `pyasn1`, `pyasn1-modules`) are
>   `py_webauthn`'s dependencies; pinning them keeps builds reproducible. Verify the
>   exact resolved versions with `pip install webauthn==2.8.0` in a 3.13 venv and pin to
>   whatever resolves at integration time (the values above are the current floors).
> - **Optional**, only if you implement strict FIDO-MDS hardware-key allowlisting in
>   lockdown mode:
>
> ```text
> # 2FA — optional: Yubico FIDO2 / attestation + MDS tooling
> fido2==2.2.0
> ```
>
> `fido2` requires `cryptography<49`, which the repo's 48.0.1 satisfies; if both
> `webauthn` and `fido2` are installed, `cryptography` must stay in `>=46,<49`.

---

## 7. Recommended stack — one-line summary

> **`pyotp==2.10.0`** for TOTP + **`webauthn` (py_webauthn) ==2.8.0** for both passkeys
> and FIDO2 security keys, reusing the repo's existing **`cryptography==48.0.1`**
> (encrypt TOTP secrets at rest) and **Redis** (challenge storage + rate limiting).
> Distinguish hardware security keys from passkeys using `py_webauthn`'s
> `authenticator_attachment` (`cross-platform`), `transports` (`usb`/`nfc`/`ble`),
> `credential_device_type`/`credential_backed_up` flags, and AAGUID — persisting an
> `is_hardware_security_key` flag so **lockdown mode** can restrict login to hardware
> keys only. Render TOTP QR codes client-side from the `otpauth://` URI (or with
> pure-Python **`segno`**); avoid `django-two-factor-auth` (Django-6.0 support gap +
> unwanted SMS/phone deps) and `qrcode[pil]` (Pillow native build on Alpine).
