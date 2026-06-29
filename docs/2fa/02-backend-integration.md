# 2FA / MFA — Backend Integration Plan (Django / `apps/api`)

> **Scope.** This is a read-only investigation of the existing Plane Django
> backend (`apps/api`) to plan integration of **local** Two-Factor / Multi-Factor
> authentication (TOTP authenticator apps + WebAuthn/passkeys), with a mandatory
> "set up 2FA during onboarding" requirement. No code is changed here — this
> document maps the existing architecture to the concrete models, endpoints, and
> middleware we will need to add.
>
> All paths are relative to the monorepo root
> (`/home/frannas/.cursor/worktrees/plane__SSH__ubuntu-24-dev.netbird.selfhosted_/wrrw`).
> The backend package root is `apps/api/plane`.

---

## 0. Executive summary of the architecture

- **Auth is custom, not allauth/DRF-token based.** The `plane.authentication`
  Django app implements its own provider/adapter pattern. Credential login
  (`email`+`password`, `magic-code`) and OAuth (Google/GitHub/GitLab/Gitea) all
  funnel through one method: `Adapter.complete_login_or_signup()`
  (`apps/api/plane/authentication/adapter/base.py`).
- **Sessions are Django server-side DB sessions** (custom `Session` model and
  `SessionStore`), set by `django.contrib.auth.login()` wrapped in
  `plane.authentication.utils.login.user_login()`. There is **no JWT / DRF token**
  for the first-party web/admin apps. (A separate `plane.api` app uses API keys,
  out of scope for 2FA.)
- **The credential sign-in/sign-up endpoints are plain `django.views.View`**
  that return `HttpResponseRedirect` (form-POST → redirect-with-querystring-error
  flow), **not** DRF `APIView`. This matters a lot: the 2FA challenge step for the
  password flow must be injected into these redirect views, while the 2FA
  _management_ endpoints (setup/verify/list/delete) should be DRF `APIView`s like
  the rest of the app.
- **Onboarding state lives on `Profile.is_onboarded` / `Profile.onboarding_step`**
  (`apps/api/plane/db/models/user.py`), and post-login redirection keys off
  `is_onboarded` in `get_redirection_path()`.
- **Feature flags / instance config** are stored in the `InstanceConfiguration`
  key/value table and read via `get_configuration_value()`
  (`apps/api/plane/license/utils/instance_value.py`), with optional Fernet
  encryption (`plane/license/utils/encryption.py`).

The cleanest integration points are therefore:

1. A **new related model** `UserMFA` (per-user 2FA state) + `MFADevice`
   (TOTP secrets / WebAuthn credentials) + `MFARecoveryCode`, in
   `apps/api/plane/db/models/`.
2. A **partial-auth state** stored in the Django session
   (`request.session["mfa_pending_user_id"]`) so that "password OK, 2FA pending"
   is **not** a full login.
3. A **new middleware** that forces 2FA setup for any fully-authenticated user
   whose `UserMFA` is not yet configured, allowing only the 2FA-setup endpoints +
   sign-out through.
4. New **DRF endpoints** under `auth/mfa/...` (and management under `api/users/me/mfa/...`).

---

## 1. User model & ORM

### 1.1 Where the models live

`apps/api/plane/db/models/user.py` defines three relevant models:

- `User(AbstractBaseUser, PermissionsMixin)` — `db_table = "users"`, PK is a UUID.
- `Profile(TimeAuditModel)` — `db_table = "profiles"`, one-to-one with `User`.
- `Account(TimeAuditModel)` — `db_table = "accounts"`, OAuth provider linkage.

The custom user model is wired in settings:

```180:180:apps/api/plane/settings/common.py
AUTH_USER_MODEL = "db.User"
```

#### Relevant `User` fields (auth-related)

```56:131:apps/api/plane/db/models/user.py
class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True, primary_key=True)
    username = models.CharField(max_length=128, unique=True)
    email = models.CharField(max_length=255, null=True, blank=True, unique=True)
    ...
    is_active = models.BooleanField(default=True)
    is_email_verified = models.BooleanField(default=False)
    is_password_autoset = models.BooleanField(default=False)
    is_password_reset_required = models.BooleanField(default=False)
    token = models.CharField(max_length=64, blank=True)
    last_login_time = models.DateTimeField(null=True)
    last_login_medium = models.CharField(max_length=20, default="email")
    ...
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]
    objects = UserManager()
```

Notes:

- `User` extends `AbstractBaseUser`, so `set_password()` / `check_password()` are
  available and already used (`apps/api/plane/authentication/provider/credentials/email.py`,
  `views/common.py`).
- `is_password_autoset = True` means the user signed up via magic-link/OAuth and
  has no real password — important for 2FA UX (such a user may only have WebAuthn
  or magic-link as a "first factor").

#### `Profile` — onboarding is modeled here, **not** on `User`

```206:264:apps/api/plane/db/models/user.py
class Profile(TimeAuditModel):
    ...
    user = models.OneToOneField("db.User", on_delete=models.CASCADE, related_name="profile")
    # Onboarding
    is_tour_completed = models.BooleanField(default=False)
    onboarding_step = models.JSONField(default=get_default_onboarding)
    use_case = models.TextField(blank=True, null=True)
    role = models.CharField(max_length=300, null=True, blank=True)
    is_onboarded = models.BooleanField(default=False)
    last_workspace_id = models.UUIDField(null=True)
    ...
```

`onboarding_step` default:

```25:31:apps/api/plane/db/models/user.py
def get_default_onboarding():
    return {
        "profile_complete": False,
        "workspace_create": False,
        "workspace_invite": False,
        "workspace_join": False,
    }
```

> **2FA + onboarding requirement.** Because onboarding completion is a single
> boolean `Profile.is_onboarded` plus a JSON `onboarding_step`, making "2FA set up"
> a required onboarding step has two clean options:
>
> 1. Add a `"mfa_setup": False` key to `get_default_onboarding()` (and the mobile
>    variant) and gate `is_onboarded=True` on it in the frontend onboarding flow;
>    **and/or**
> 2. Rely on the new `UserMFA.is_configured` flag (preferred, see §1.3) so the
>    middleware can enforce it independently of the JSON blob. Recommended: use
>    `UserMFA` as the source of truth and keep `onboarding_step` purely for UI
>    progress.

#### `Account` — the OAuth pattern to mirror for "credential storage"

```277:301:apps/api/plane/db/models/user.py
class Account(TimeAuditModel):
    PROVIDER_CHOICES = (("google", "Google"), ("github", "Github"), ("gitlab", "GitLab"))
    id = models.UUIDField(default=uuid.uuid4, ...)
    user = models.ForeignKey("db.User", on_delete=models.CASCADE, related_name="accounts")
    provider_account_id = models.CharField(max_length=255)
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    access_token = models.TextField()
    ...
    metadata = models.JSONField(default=dict)
    class Meta:
        unique_together = ["provider", "provider_account_id"]
        db_table = "accounts"
```

`Account` is the closest analog to what an `MFADevice` table should look like:
per-user FK, a small choices field for type, secret/credential blobs, and a
`metadata` JSON. **Important:** `Account` stores tokens in plaintext `TextField`s.
For 2FA secrets we should do better and encrypt them (see §6.3).

### 1.2 Base model / mixins available

New 2FA models should extend the project's `BaseModel`
(`apps/api/plane/db/models/base.py`), which is `AuditModel` + UUID PK:

```17:21:apps/api/plane/db/models/base.py
class BaseModel(AuditModel):
    id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True, primary_key=True)
    class Meta:
        abstract = True
```

`AuditModel` (`apps/api/plane/db/mixins.py`) composes `TimeAuditModel`
(`created_at`/`updated_at`), `UserAuditModel` (`created_by`/`updated_by`), and
`SoftDeleteModel` (`deleted_at` + soft-delete manager). `BaseModel.save()` auto-sets
`created_by`/`updated_by` from `crum.get_current_user()`.

> ⚠️ **Soft delete caveat for 2FA.** `BaseModel.objects` is a `SoftDeletionManager`
> that hides `deleted_at != null` rows, and `.delete()` is soft by default. For a
> security feature, "delete this TOTP device" should ideally be a **hard delete**
> (call `instance.delete(soft=False)`), otherwise a soft-deleted secret lingers in
> the DB and any `unique_together` constraints will be evaluated only against
> non-deleted rows. Decide per-model; `Profile`/`Account` extend `TimeAuditModel`
> (no soft delete) — a 2FA credential model could likewise extend `TimeAuditModel`
> to keep semantics simple, while still getting `created_at`/`updated_at`.

### 1.3 Proposed new models (location: `apps/api/plane/db/models/mfa.py`)

```python
# apps/api/plane/db/models/mfa.py  (proposed)
import uuid
from django.db import models
from django.conf import settings
from .base import BaseModel


class UserMFA(BaseModel):
    """Per-user MFA enrollment state (one row per user)."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mfa")
    is_enabled = models.BooleanField(default=False)          # at least one verified factor
    is_enforced = models.BooleanField(default=False)         # "lockdown": require 2FA on every login
    enabled_at = models.DateTimeField(null=True, blank=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_mfa"


class MFADevice(BaseModel):
    """A single second factor: a TOTP secret or a WebAuthn credential."""
    class DeviceType(models.TextChoices):
        TOTP = "TOTP", "Authenticator app (TOTP)"
        WEBAUTHN = "WEBAUTHN", "Security key / passkey (WebAuthn)"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mfa_devices")
    device_type = models.CharField(max_length=20, choices=DeviceType.choices)
    name = models.CharField(max_length=255, blank=True)       # user-friendly label
    is_confirmed = models.BooleanField(default=False)         # verified during setup
    # TOTP: encrypted base32 secret. WebAuthn: encrypted credential private metadata.
    secret_encrypted = models.TextField(blank=True, default="")
    # WebAuthn specifics
    credential_id = models.TextField(blank=True, default="")  # base64url
    public_key = models.TextField(blank=True, default="")
    sign_count = models.PositiveBigIntegerField(default=0)
    transports = models.JSONField(default=list)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mfa_devices"


class MFARecoveryCode(BaseModel):
    """One-time backup codes (store only hashes)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mfa_recovery_codes")
    code_hash = models.CharField(max_length=128)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mfa_recovery_codes"
```

### 1.4 Migrations setup & how to add a model

- Migrations live in `apps/api/plane/db/migrations/`. The latest is
  `0129_sentry_integration.py` (the suite is numbered `0001` … `0129`).
- Models are registered by importing them in `apps/api/plane/db/models/__init__.py`.
  Existing examples (line numbers approximate):
  - `from .device import Device, DeviceSession`
  - `from .session import Session`
  - `from .user import Account, BotTypeEnum, Profile, User`
    Add: `from .mfa import UserMFA, MFADevice, MFARecoveryCode`.
- Generate the migration with `makemigrations` (run inside the API container /
  venv): `python manage.py makemigrations db` then `migrate`. The next file would
  be e.g. `0130_user_mfa.py` with `dependencies = [("db", "0129_sentry_integration")]`.
- A `migrations.CreateModel` example to mirror (UUID PK + audit fields):
  `apps/api/plane/db/migrations/0127_agent_models.py` shows the canonical generated
  shape (`created_at`/`updated_at`/`deleted_at`/UUID `id`/`created_by` FK to
  `settings.AUTH_USER_MODEL`).

> The backend test stack is Dockerized (`docker-compose-test.yml`, see root
> `AGENTS.md`); migrations should be created/applied there or in the API service.

---

## 2. Authentication flow (login / registration trace)

### 2.1 Provider → Adapter → session: the spine

All credential and OAuth flows converge on the adapter base class
`apps/api/plane/authentication/adapter/base.py`:

```304:375:apps/api/plane/authentication/adapter/base.py
    def complete_login_or_signup(self):
        email = self.user_data.get("email")
        email = self.sanitize_email(email)
        user = User.objects.filter(email=email).first()
        is_signup = bool(user)
        if not user:
            self.__check_signup(email)
            user = User(email=email, username=uuid.uuid4().hex)
            ...
            user.save()
            ...
            Profile.objects.create(user=user)
        ...
        user = self.save_user_data(user=user)        # sets last_login_*, is_active=True, saves
        if self.callback:
            self.callback(user, is_signup, self.request)   # post_user_auth_workflow
        if self.token_data:
            self.create_update_account(user=user)
        return user
```

Key sub-classes:

- `CredentialAdapter` (`adapter/credential.py`) — `authenticate()` calls
  `self.set_user_data()` then `complete_login_or_signup()`.
- `EmailProvider` (`provider/credentials/email.py`) — `set_user_data()` is where
  **the password is actually checked**:

```77:88:apps/api/plane/authentication/provider/credentials/email.py
            # Check user password
            if not user.check_password(self.code):
                raise AuthenticationException(
                    error_message=("AUTHENTICATION_FAILED_SIGN_UP" if self.is_signup else "AUTHENTICATION_FAILED_SIGN_IN"),
                    error_code=AUTHENTICATION_ERROR_CODES[...],
                    payload={"email": self.key},
                )
```

- `MagicCodeProvider` (`provider/credentials/magic_code.py`) — Redis-backed OTP
  email code (this is _first-factor_ magic link, **not** the 2FA TOTP; don't
  confuse them).

### 2.2 How a session is created

`apps/api/plane/authentication/utils/login.py`:

```14:28:apps/api/plane/authentication/utils/login.py
def user_login(request, user, is_app=False, is_admin=False, is_space=False):
    login(request=request, user=user)               # django.contrib.auth.login → server session
    if is_admin:
        request.session.set_expiry(settings.ADMIN_SESSION_COOKIE_AGE)
    device_info = {"user_agent": ..., "ip_address": ..., "domain": ...}
    request.session["device_info"] = device_info
    request.session.save()
    return
```

- Sessions are **server-side DB sessions** via the custom engine
  `SESSION_ENGINE = "plane.db.models.session"` (`settings/common.py`), backed by
  the `Session` model (`apps/api/plane/db/models/session.py`,
  `db_table = "sessions"`), which also persists `device_info` and `user_id`.
- The cookie is `session-id` (`SESSION_COOKIE_NAME`), HttpOnly, 7-day age.
- A separate admin cookie (`admin-session-id`) is selected by the custom
  `SessionMiddleware` (`apps/api/plane/authentication/middleware/session.py`) based
  on whether `"instances"` is in the path.
- DRF auth uses `SessionAuthentication` (CSRF-disabled subclass
  `BaseSessionAuthentication`, `apps/api/plane/authentication/session.py`).

### 2.3 The password sign-in endpoint (exact injection point)

`apps/api/plane/authentication/views/app/email.py`, `SignInAuthEndpoint.post()`:

```101:124:apps/api/plane/authentication/views/app/email.py
        try:
            provider = EmailProvider(request=request, key=email, code=password, is_signup=False, callback=post_user_auth_workflow)
            user = provider.authenticate()           # <-- password verified here
            # Login the user and record his device info
            user_login(request=request, user=user, is_app=True)   # <-- FULL session created here
            if next_path:
                path = next_path
            else:
                path = get_redirection_path(user=user)
            url = get_safe_redirect_url(base_url=base_host(request=request, is_app=True), next_path=path, params={})
            return HttpResponseRedirect(url)
        except AuthenticationException as e:
            params = e.get_error_dict()
            url = get_safe_redirect_url(...)
            return HttpResponseRedirect(url)
```

> **2FA challenge injection (post-password, pre-session-finalization).**
> Between `provider.authenticate()` (line 109) and `user_login(...)` (line 111),
> insert a check: _if the user has MFA enabled (`UserMFA.is_enabled`) and this
> session has not just satisfied 2FA_, then **do not** call `user_login`. Instead
> store partial-auth state in the session (§4b) and redirect to the 2FA challenge
> page. Only after the TOTP/WebAuthn verify endpoint succeeds do we call
> `user_login()` to finalize the real session.

The same structure exists in:

- `SignUpAuthEndpoint.post()` (same file, lines 135–238) — new users won't have
  MFA yet, so they flow straight to login, then the **forced-setup middleware**
  (§4) pushes them into 2FA enrollment during onboarding.
- Magic flows: `views/app/magic.py` (`MagicSignInEndpoint`, `MagicSignUpEndpoint`)
  call `user_login()` after `provider.authenticate()` — same injection logic
  needed before `user_login`.
- OAuth callbacks (`views/app/google.py`, `github.py`, `gitlab.py`, `gitea.py`)
  also end in `user_login()`. **Policy decision:** typically OAuth/SSO users are
  considered to already have a strong IdP and may be exempted, OR you can still
  enforce local 2FA. Whatever the policy, the gate is again "right before
  `user_login`".

There is a parallel set of `views/space/*` endpoints for the public "Spaces"
deploy app; mirror whatever app-side decisions are appropriate there.

### 2.4 Post-auth workflow callback

`apps/api/plane/authentication/utils/user_auth_workflow.py`:

```8:9:apps/api/plane/authentication/utils/user_auth_workflow.py
def post_user_auth_workflow(user, is_signup, request):
    process_workspace_project_invitations(user=user)
```

This callback fires inside `complete_login_or_signup()` (before `user_login`). It
is **not** a good place for the 2FA gate (it runs during provider auth, has no
clean way to short-circuit the redirect view). Keep the 2FA gate in the view.

---

## 3. Registration / sign-up & onboarding

- **Sign-up endpoints**:
  - `auth/sign-up/` → `SignUpAuthEndpoint` (`views/app/email.py`)
  - `auth/magic-sign-up/` → `MagicSignUpEndpoint` (`views/app/magic.py`)
  - `auth/spaces/sign-up/` → `SignUpAuthSpaceEndpoint` (`views/space/email.py`)
  - OAuth "sign up" is implicit in the callback (new user created in
    `complete_login_or_signup`).
  - Registered in `apps/api/plane/authentication/urls.py` (mounted at `auth/` by
    `apps/api/plane/urls.py`: `path("auth/", include("plane.authentication.urls"))`).
- **Email existence pre-check**: `auth/email-check/` → `EmailCheckEndpoint`
  (`views/app/check.py`) tells the frontend whether to show password vs magic-code.
- **`__check_signup`** in `adapter/base.py` enforces `ENABLE_SIGNUP` and invite
  presence.

### 3.1 Onboarding state & endpoints

Onboarding is tracked on `Profile` and toggled by dedicated endpoints in
`apps/api/plane/app/views/user/base.py`:

```364:377:apps/api/plane/app/views/user/base.py
class UpdateUserOnBoardedEndpoint(BaseAPIView):
    def patch(self, request):
        profile = Profile.objects.get(user_id=request.user.id)
        profile.is_onboarded = request.data.get("is_onboarded", False)
        profile.save()
        return Response({"message": "Updated successfully"}, status=status.HTTP_200_OK)
```

URLs (`apps/api/plane/app/urls/user.py`):

- `api/users/me/onboard/` → `UpdateUserOnBoardedEndpoint`
- `api/users/me/tour-completed/` → `UpdateUserTourCompletedEndpoint`
- `api/users/me/profile/` → `ProfileEndpoint` (GET/PATCH the whole `Profile`)

Post-login redirection keys off onboarding:

```8:14:apps/api/plane/authentication/utils/redirection_path.py
def get_redirection_path(user):
    profile, _ = Profile.objects.get_or_create(user=user)
    if not profile.is_onboarded:
        return "onboarding"
    ...
```

> **2FA-as-onboarding-step.** Two coordinated changes:
>
> 1. The frontend onboarding wizard adds a "Secure your account" step that calls
>    the new TOTP/WebAuthn setup endpoints (§7) before allowing `is_onboarded=True`.
> 2. The **forced-setup middleware** (§4) is the server-side guarantee: even if
>    onboarding is somehow skipped, any authenticated request from a user without a
>    configured `UserMFA` is redirected/blocked until 2FA is set up. This makes the
>    requirement enforceable rather than advisory. Whether 2FA is _globally
>    mandatory_ should be gated by an instance config flag (§6) such as
>    `MFA_ENFORCED`.

---

## 4. Middleware

### 4.1 Existing middleware

`MIDDLEWARE` (`apps/api/plane/settings/common.py`):

```99:113:apps/api/plane/settings/common.py
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "plane.authentication.middleware.session.SessionMiddleware",   # custom: app vs admin cookie
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",     # sets request.user
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "crum.CurrentRequestUserMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "plane.middleware.request_body_size.RequestBodySizeLimitMiddleware",
    "plane.middleware.logger.APITokenLogMiddleware",
    "plane.middleware.logger.RequestLoggerMiddleware",
]
```

- The only auth-specific custom middleware today is
  `plane.authentication.middleware.session.SessionMiddleware`
  (`apps/api/plane/authentication/middleware/session.py`) — it picks the admin vs
  app session cookie by path and saves the cookie on response. It does **not**
  enforce any policy.
- There is a second middleware package `plane.middleware` (note: different from
  `plane.authentication.middleware`) holding `request_body_size`, `logger`,
  `db_routing`. New cross-cutting middleware can live in either; for a 2FA policy
  gate, **`plane.authentication.middleware.mfa_enforcement`** keeps it close to the
  auth code.

### 4.2 Proposed forced-2FA-setup middleware

Add `apps/api/plane/authentication/middleware/mfa_enforcement.py` and register it
**after** `AuthenticationMiddleware` (so `request.user` is populated), e.g. right
after `crum.CurrentRequestUserMiddleware`.

Behavior:

- If `request.user` is anonymous → pass through (login flow handles it).
- If MFA is **not globally enforced** (`MFA_ENFORCED` config off) and the user has
  not opted in → pass through.
- If the user is authenticated and (`MFA_ENFORCED` is on **or** the user opted into
  enforcement) and `UserMFA.is_enabled is False` → only allow:
  - the 2FA setup/verify endpoints (`auth/mfa/...`, `api/users/me/mfa/...`),
  - sign-out (`auth/sign-out/`), CSRF token (`auth/get-csrf-token/`),
  - the `users/me` read endpoints needed to render the setup page.
    Everything else returns a structured JSON error (for API/XHR) or a redirect
    (for browser navigations) pointing to the 2FA setup page.

Response convention so the **frontend can detect & redirect** (mirror the existing
`AuthenticationException` shape, see §5.2):

```python
# Proposed: for XHR/API requests
return JsonResponse(
    {"error_code": AUTHENTICATION_ERROR_CODES["MFA_SETUP_REQUIRED"],   # new code, e.g. 5200
     "error_message": "MFA_SETUP_REQUIRED"},
    status=403,
)
```

The frontend already special-cases auth error codes returned as querystring params
on redirects; for in-app XHR, a dedicated `403 + error_code=MFA_SETUP_REQUIRED`
(or `MFA_REQUIRED` for the challenge step) lets the SPA route to the setup/challenge
screens. Choose a distinct numeric code range (e.g. `5200`–`5230`) added to
`AUTHENTICATION_ERROR_CODES` in `apps/api/plane/authentication/adapter/error.py`.

> **Path allowlist tip.** Build the allowlist from URL names (via `resolve`) rather
> than raw path string matching where possible, to be robust to `APP_BASE_PATH`
> prefixes. The existing `SessionMiddleware` uses crude `"instances" in request.path`
> matching, which is the in-repo precedent but is fragile — prefer `resolve()`.

---

## 4b. Session / state for partial auth ("password verified, 2FA pending")

There is **no existing partial-auth concept** — `user_login()` immediately creates
a fully authenticated session. We must introduce a "pending" state that is **not**
a logged-in session.

Recommended approach (server-side session, consistent with the codebase):

1. In `SignInAuthEndpoint` (and magic/oauth equivalents), after the first factor
   succeeds but **before** `user_login()`, if `UserMFA.is_enabled`:
   ```python
   request.session["mfa_pending_user_id"] = str(user.id)
   request.session["mfa_pending_until"] = (timezone.now() + timedelta(minutes=5)).isoformat()
   request.session.save()
   # redirect to the 2FA challenge page (no auth user set yet)
   ```
   Because `django.contrib.auth.login()` is **not** called, `request.user` stays
   anonymous and `_auth_user_id` is absent — the user is genuinely not logged in.
   The session row exists (to carry the pending state) but is not an authenticated
   session.
2. New endpoint `auth/mfa/verify/` (DRF `APIView`, `AllowAny`) reads
   `mfa_pending_user_id` from the session, validates the TOTP code / WebAuthn
   assertion against the user's `MFADevice`, checks `mfa_pending_until` for
   expiry, and **only then** calls `user_login(request=request, user=user, is_app=True)`
   to upgrade to a real session, clearing the pending keys.
3. Add throttling (§5.3) to the verify endpoint to prevent TOTP brute force
   (TOTP is a 6-digit space → must be rate limited / attempt-capped, like the
   magic-code provider already does with its Redis `MAX_VERIFY_ATTEMPTS`).
4. Optionally mark the finalized session as "2FA-satisfied" by storing
   `request.session["mfa_authenticated_at"]` so step-up flows / "remember this
   device" can be added later.

Alternative (heavier, not recommended initially): a short-lived signed token (e.g.
`itsdangerous`/JWT) returned to the client instead of session state. The session
approach is simpler and matches the existing cookie/session model.

Pending-state cleanup: the magic-code provider's Redis pattern
(`provider/credentials/magic_code.py`, `MAX_VERIFY_ATTEMPTS`, Lua INCR+EXPIRE) is a
good template if you prefer Redis over the DB session for the pending counter.

---

## 5. API conventions (for the new 2FA endpoints)

### 5.1 View / serializer / URL structure

- **Two endpoint styles coexist** and you must pick correctly:
  - **DRF `APIView`/`ViewSet`** for "logged-in management" endpoints — base classes
    `BaseAPIView` / `BaseViewSet` in `apps/api/plane/app/views/base.py`:

    ```149:160:apps/api/plane/app/views/base.py
    class BaseAPIView(TimezoneMixin, ReadReplicaControlMixin, APIView, BasePaginator):
        permission_classes = [IsAuthenticated]
        filter_backends = (DjangoFilterBackend, SearchFilter)
        authentication_classes = [BaseSessionAuthentication]
        ...
    ```

    These default to `IsAuthenticated` + session auth + structured
    `handle_exception`. The MFA _management_ endpoints (TOTP setup, list/delete
    devices, regenerate recovery codes, enable lockdown) should subclass
    `BaseAPIView`. The `password_management`/`check` auth views show the DRF
    `APIView` + `AllowAny` + `AuthenticationException`/`Response` pattern
    (`views/common.py`, `views/app/check.py`).

  - **Plain `django.views.View` returning `HttpResponseRedirect`** for the
    browser-form login/challenge flow (sign-in/up, magic, oauth). The MFA
    **challenge during login** (`auth/mfa/verify/`) can be either: a DRF `APIView`
    returning JSON (if the SPA drives it via XHR — preferred), or a `View` returning
    a redirect (if it must match the existing form-post redirect flow). Given the
    SPA, prefer DRF JSON for the verify endpoint, and reserve redirects only for the
    initial sign-in views you're modifying.

- **Serializers**: `BaseSerializer` (`apps/api/plane/app/serializers/base.py`) with
  per-model `Meta`. See `ProfileSerializer`, `AccountSerializer`, plain
  `serializers.Serializer` like `ChangePasswordSerializer`
  (`apps/api/plane/app/serializers/user.py`). New `MFADeviceSerializer`,
  `UserMFASerializer` go in `apps/api/plane/app/serializers/` (and be exported from
  its `__init__`).

- **URLs**: management endpoints under `apps/api/plane/app/urls/user.py`
  (mounted at `api/` by `plane/urls.py` → `path("api/", include("plane.app.urls"))`).
  Login-flow endpoints under `apps/api/plane/authentication/urls.py` (mounted at
  `auth/`). Pattern: one `path(...)` per route, view via `.as_view(...)`.

### 5.2 Error / response conventions

- Auth errors use `AuthenticationException` + a numeric `error_code` from the
  central registry `AUTHENTICATION_ERROR_CODES`
  (`apps/api/plane/authentication/adapter/error.py`):

  ```77:92:apps/api/plane/authentication/adapter/error.py
  class AuthenticationException(Exception):
      def __init__(self, error_code, error_message, payload={}):
          self.error_code = error_code
          self.error_message = error_message
          self.payload = payload
      def get_error_dict(self):
          error = {"error_code": self.error_code, "error_message": self.error_message}
          for key in self.payload:
              error[key] = self.payload[key]
          return error
  ```

  - In **redirect views**: errors are serialized to querystring params via
    `get_error_dict()` and appended by `get_safe_redirect_url(...)`.
  - In **DRF views**: `return Response(exc.get_error_dict(), status=...)`.
  - The DRF exception handler `auth_exception_handler`
    (`apps/api/plane/authentication/adapter/exception.py`, wired via
    `REST_FRAMEWORK["EXCEPTION_HANDLER"]`) maps `NotAuthenticated→401` and
    `Throttled→429` (returning the `RATE_LIMIT_EXCEEDED` error dict).

  → **Add new MFA error codes** (e.g. `MFA_REQUIRED`, `MFA_SETUP_REQUIRED`,
  `MFA_INVALID_CODE`, `MFA_CODE_EXPIRED`, `MFA_ATTEMPTS_EXHAUSTED`,
  `MFA_ALREADY_ENABLED`, `MFA_NOT_ENABLED`, `MFA_INVALID_RECOVERY_CODE`,
  `WEBAUTHN_REGISTRATION_FAILED`, `WEBAUTHN_AUTH_FAILED`) to
  `AUTHENTICATION_ERROR_CODES` so frontend error handling is uniform.

### 5.3 Rate limiting

`apps/api/plane/authentication/rate_limit.py` provides DRF throttles and a helper
for plain `View`s:

```20:49:apps/api/plane/authentication/rate_limit.py
class AuthenticationThrottle(AnonRateThrottle):
    rate = os.environ.get("AUTHENTICATION_RATE_LIMIT", "10/minute")
    scope = "authentication"
    def throttle_failure_view(self, request, *args, **kwargs):
        ...  # returns 429 with RATE_LIMIT_EXCEEDED

def authentication_throttle_allows(request):
    """Manual throttle check for plain django.views.View (returns bool)."""
    throttle = AuthenticationThrottle()
    return throttle.allow_request(request, None)
```

- DRF MFA endpoints: set `throttle_classes = [AuthenticationThrottle]` (or a new
  dedicated `MFAVerifyThrottle(UserRateThrottle)` similar to
  `EmailVerificationThrottle` which is `3/hour`).
- If the verify step is a plain `View`, call `authentication_throttle_allows(request)`
  exactly like `MagicSignInEndpoint` does.
- **Defense in depth**: also implement a per-user/per-device attempt counter
  (Redis, like `MagicCodeProvider.MAX_VERIFY_ATTEMPTS` + Lua `INCR`/`EXPIRE`) so
  TOTP codes can't be brute-forced within the throttle window.

---

## 6. Settings & config / feature flags

### 6.1 Instance configuration table (the feature-flag mechanism)

Feature flags are key/value rows in `InstanceConfiguration`
(`apps/api/plane/license/models/instance.py`):

```72:83:apps/api/plane/license/models/instance.py
class InstanceConfiguration(BaseModel):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(null=True, blank=True, default=None)
    category = models.TextField()
    is_encrypted = models.BooleanField(default=False)
    class Meta:
        db_table = "instance_configurations"
```

Read via `get_configuration_value()`
(`apps/api/plane/license/utils/instance_value.py`) — when `settings.SKIP_ENV_VAR`
is true (default `"1"`), it reads from the DB table (decrypting if
`is_encrypted`), else from `os.environ`:

```17:39:apps/api/plane/license/utils/instance_value.py
def get_configuration_value(keys):
    environment_list = []
    if settings.SKIP_ENV_VAR:
        instance_configuration = InstanceConfiguration.objects.values("key", "value", "is_encrypted")
        for key in keys:
            for item in instance_configuration:
                if key.get("key") == item.get("key"):
                    if item.get("is_encrypted", False):
                        environment_list.append(decrypt_data(item.get("value")))
                    else:
                        environment_list.append(item.get("value"))
                    break
            else:
                environment_list.append(key.get("default"))
    else:
        for key in keys:
            environment_list.append(os.environ.get(key.get("key"), key.get("default")))
    return tuple(environment_list)
```

Existing flags read this way: `ENABLE_EMAIL_PASSWORD`, `ENABLE_MAGIC_LINK_LOGIN`,
`ENABLE_SIGNUP`, `IS_GOOGLE_ENABLED`, etc.

→ **Add 2FA flags** as `InstanceConfiguration` keys, e.g.:

- `MFA_ENABLED` ("is the 2FA feature available at all") — default `"1"`.
- `MFA_ENFORCED` ("force every user to configure 2FA") — default `"0"`.
- `MFA_ALLOW_TOTP` / `MFA_ALLOW_WEBAUTHN` — per-method toggles.
- `MFA_WEBAUTHN_RP_ID` / `MFA_WEBAUTHN_RP_NAME` / origin — WebAuthn relying-party
  config (can also be derived from `WEB_URL`/`APP_BASE_URL` in `settings/common.py`).

### 6.2 Exposing flags to the frontend

The unauthenticated instance endpoint `api/instances/` →
`InstanceEndpoint.get()` (`apps/api/plane/license/api/views/instance.py`) already
surfaces auth-related flags into its response (`enable_signup`,
`is_google_enabled`, `is_email_password_enabled`, …) via `get_configuration_value`.
Add `is_mfa_enabled` / `is_mfa_enforced` to that payload so the login UI knows to
expect a 2FA step. There's also an admin configuration endpoint
(`plane/license/api/views/configuration.py`) for the god-mode admin app to manage
these keys.

### 6.3 Secret storage / crypto already available

- `cryptography==48.0.1` is already a dependency (`apps/api/requirements/base.txt`).
- `apps/api/plane/license/utils/encryption.py` provides Fernet
  `encrypt_data()` / `decrypt_data()` keyed off `settings.SECRET_KEY`
  (PBKDF2-HMAC-SHA256). **Reuse this** to encrypt TOTP secrets before storing them
  in `MFADevice.secret_encrypted` (do not store raw base32 secrets).
- **No 2FA libraries are currently installed** (no `pyotp`, `qrcode`, `webauthn`,
  `fido2`, `pillow`). New deps to add to `apps/api/requirements/base.txt`:
  - `pyotp` (TOTP generation/verification),
  - `qrcode[pil]` or generate the `otpauth://` URI and let the frontend render the
    QR (avoids a `Pillow` dependency server-side — preferred),
  - `webauthn` (py_webauthn) for WebAuthn register/authenticate ceremonies.

### 6.4 Settings files map

`apps/api/plane/settings/`: `common.py` (the base — MIDDLEWARE, REST_FRAMEWORK,
AUTH_USER_MODEL, session/cookie config), `production.py`, `local.py`, `test.py`,
`redis.py`, `storage.py`, `openapi.py`. Any new Django-level constants
(e.g. `MFA_PENDING_TTL_SECONDS`, WebAuthn RP defaults) go in `common.py`.

---

## 7. Concrete deliverables: new models, endpoints, middleware

### 7.1 New models (`apps/api/plane/db/models/mfa.py`, migration `0130_*`)

| Model             | Table                | Purpose                                                                                                                                             |
| ----------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserMFA`         | `user_mfa`           | One row/user: `is_enabled`, `is_enforced`, timestamps. Source of truth for the gate.                                                                |
| `MFADevice`       | `mfa_devices`        | TOTP secret (encrypted) or WebAuthn credential (`credential_id`, `public_key`, `sign_count`, `transports`), `is_confirmed`, `name`, `last_used_at`. |
| `MFARecoveryCode` | `mfa_recovery_codes` | Hashed one-time backup codes, `used_at`.                                                                                                            |

Register in `apps/api/plane/db/models/__init__.py`; encrypt secrets with
`plane.license.utils.encryption`.

### 7.2 New endpoints

**Login-flow (under `auth/`, in `plane/authentication/urls.py` + new views in
`plane/authentication/views/app/mfa.py`):**

| Method/Path                                     | View style               | Auth                  | Purpose                                                                       |
| ----------------------------------------------- | ------------------------ | --------------------- | ----------------------------------------------------------------------------- |
| `POST auth/mfa/verify/`                         | DRF `APIView` `AllowAny` | session pending-state | Verify TOTP/recovery during login; on success call `user_login()`. Throttled. |
| `POST auth/mfa/webauthn/authenticate/begin/`    | DRF `APIView` `AllowAny` | pending-state         | Start WebAuthn assertion (challenge).                                         |
| `POST auth/mfa/webauthn/authenticate/complete/` | DRF `APIView` `AllowAny` | pending-state         | Finish WebAuthn assertion → `user_login()`.                                   |

**Management (under `api/users/me/mfa/`, in `plane/app/urls/user.py` + views in
`plane/app/views/user/mfa.py`, subclassing `BaseAPIView`, `IsAuthenticated`):**

| Method/Path                                          | Purpose                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET api/users/me/mfa/`                              | Current MFA status + device list (`UserMFASerializer`).                                   |
| `POST api/users/me/mfa/totp/setup/`                  | Generate + return `otpauth://` URI/secret; create unconfirmed `MFADevice`.                |
| `POST api/users/me/mfa/totp/verify/`                 | Confirm TOTP setup (mark `is_confirmed`, set `UserMFA.is_enabled`, issue recovery codes). |
| `POST api/users/me/mfa/webauthn/register/begin/`     | WebAuthn registration options.                                                            |
| `POST api/users/me/mfa/webauthn/register/complete/`  | Store verified WebAuthn credential.                                                       |
| `GET/DELETE api/users/me/mfa/devices/<uuid:pk>/`     | List / remove a device (hard delete; require step-up).                                    |
| `POST api/users/me/mfa/recovery-codes/regenerate/`   | Re-issue backup codes.                                                                    |
| `POST api/users/me/mfa/lockdown/` (enable) / disable | Toggle `UserMFA.is_enforced` ("lockdown").                                                |

> Mirror existing patterns: `permission_classes`/`authentication_classes` from
> `BaseAPIView`, errors via `AuthenticationException.get_error_dict()`, throttles
> from `rate_limit.py`.

### 7.3 New middleware

`apps/api/plane/authentication/middleware/mfa_enforcement.py`, registered in
`MIDDLEWARE` after `AuthenticationMiddleware`/`crum`. Blocks all requests from
authenticated users whose `UserMFA.is_enabled` is False (when `MFA_ENFORCED` or the
user opted in), except the allowlisted setup/verify/sign-out/csrf/`users/me`
routes; returns `403 {error_code: MFA_SETUP_REQUIRED}` for XHR and a redirect for
browser navigations.

### 7.4 New error codes & flags

- Add `MFA_*` / `WEBAUTHN_*` codes to `AUTHENTICATION_ERROR_CODES`
  (`plane/authentication/adapter/error.py`), e.g. range `5200`–`5230`.
- Add `MFA_ENABLED`, `MFA_ENFORCED`, `MFA_ALLOW_TOTP`, `MFA_ALLOW_WEBAUTHN`,
  WebAuthn RP keys to `InstanceConfiguration`; surface `is_mfa_enabled` /
  `is_mfa_enforced` in `InstanceEndpoint.get()`.

### 7.5 Modified existing code (login gate)

- `plane/authentication/views/app/email.py` (`SignInAuthEndpoint`,
  `SignUpAuthEndpoint`) — insert the MFA gate between `provider.authenticate()` and
  `user_login()`; set session pending-state instead of logging in when MFA is
  required.
- `plane/authentication/views/app/magic.py`, and the OAuth callback views
  (`google.py`/`github.py`/`gitlab.py`/`gitea.py`) — same gate per policy.
- Optionally the `views/space/*` mirrors.
- `get_default_onboarding()` (`plane/db/models/user.py`) — optionally add
  `"mfa_setup": False` if onboarding UI should track it as a step.

---

## 8. Quick reference — key files

| Concern                                    | File                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| User/Profile/Account models                | `apps/api/plane/db/models/user.py`                                 |
| Base model + mixins                        | `apps/api/plane/db/models/base.py`, `apps/api/plane/db/mixins.py`  |
| Model registry                             | `apps/api/plane/db/models/__init__.py`                             |
| Migrations dir (latest `0129`)             | `apps/api/plane/db/migrations/`                                    |
| Adapter spine (`complete_login_or_signup`) | `apps/api/plane/authentication/adapter/base.py`                    |
| Credential adapter                         | `apps/api/plane/authentication/adapter/credential.py`              |
| Email password check                       | `apps/api/plane/authentication/provider/credentials/email.py`      |
| Magic code (OTP template)                  | `apps/api/plane/authentication/provider/credentials/magic_code.py` |
| Session creation                           | `apps/api/plane/authentication/utils/login.py`                     |
| Password sign-in/up views (gate here)      | `apps/api/plane/authentication/views/app/email.py`                 |
| Magic sign-in/up views                     | `apps/api/plane/authentication/views/app/magic.py`                 |
| Sign-out                                   | `apps/api/plane/authentication/views/app/signout.py`               |
| Email-check (existing user?)               | `apps/api/plane/authentication/views/app/check.py`                 |
| Auth URLs (mounted at `auth/`)             | `apps/api/plane/authentication/urls.py`                            |
| DRF auth views (change/set password, csrf) | `apps/api/plane/authentication/views/common.py`                    |
| Error codes registry                       | `apps/api/plane/authentication/adapter/error.py`                   |
| DRF exception handler                      | `apps/api/plane/authentication/adapter/exception.py`               |
| Rate limiting                              | `apps/api/plane/authentication/rate_limit.py`                      |
| Session cookie middleware                  | `apps/api/plane/authentication/middleware/session.py`              |
| Redirection after login                    | `apps/api/plane/authentication/utils/redirection_path.py`          |
| Post-auth callback                         | `apps/api/plane/authentication/utils/user_auth_workflow.py`        |
| DRF base view classes                      | `apps/api/plane/app/views/base.py`                                 |
| User/profile/onboarding endpoints          | `apps/api/plane/app/views/user/base.py`                            |
| User/profile serializers                   | `apps/api/plane/app/serializers/user.py`                           |
| User URLs                                  | `apps/api/plane/app/urls/user.py`                                  |
| Settings (MIDDLEWARE, DRF, sessions)       | `apps/api/plane/settings/common.py`                                |
| Instance config model                      | `apps/api/plane/license/models/instance.py`                        |
| Config read helper                         | `apps/api/plane/license/utils/instance_value.py`                   |
| Secret encryption (Fernet)                 | `apps/api/plane/license/utils/encryption.py`                       |
| Instance flags exposed to FE               | `apps/api/plane/license/api/views/instance.py`                     |
