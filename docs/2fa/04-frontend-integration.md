# 2FA / MFA — Frontend Integration Plan

> Read-only investigation of the Plane frontend (`apps/web`, `apps/admin`, shared `packages/*`)
> to plan local 2FA/MFA. All file paths are relative to the monorepo root
> `/home/frannas/.cursor/worktrees/plane__SSH__ubuntu-24-dev.netbird.selfhosted_/wrrw`.
>
> **Backend contract assumed** (from sibling investigations): server-side Django DB session
> (`session-id` cookie, no JWT), a 2FA challenge injected between password verify and session
> finalize, a forced-setup middleware returning `403 {error_code: MFA_SETUP_REQUIRED}`, and new
> endpoints `auth/mfa/*` (login challenge) + `api/users/me/mfa/*` (management).
>
> **Recommended libs**: `@simplewebauthn/browser@13.3.0`, `qrcode.react@4.2.0`. Reusable
> `<TwoFactorSetup variant=onboarding|forced|settings|admin />` and `<TwoFactorVerify />`.

## 0. Key architectural facts (read this first)

These facts dictate _how_ 2FA must be wired in — they differ from the "Next.js" framing in the brief:

1. **Both apps are Vite + React Router v7 SPAs**, not Next.js. Routing is declared in
   `apps/web/app/routes/core.ts` (+ `extended`) via `route()`/`layout()`/`index()` from
   `@react-router/dev/routes`. There is **no `middleware.ts`** (only `packages/logger/src/middleware.ts`,
   unrelated). The only `next/*` imports are shims for `next/navigation` / `next/link` used by legacy code.
2. **Password sign-in / sign-up is a native HTML `<form method="POST">`** that posts _directly to Django_
   (`${API_BASE_URL}/auth/sign-in/` etc.) and relies on a **full-page redirect** back to the SPA. It is
   **not** an XHR/`fetch`. Errors come back as `?error_code=...` query params, parsed on mount. This is the
   single most important constraint for the login-challenge UX (see §1).
3. **Auth state is read from `/api/users/me/`** (axios, `withCredentials: true`) after the redirect, via the
   MobX user store. There is no client-held token.
4. **Route protection is a React component wrapper** (`AuthenticationWrapper`), not server middleware. The
   global forced-2FA gate belongs here (see §3).
5. A **`security` tab already exists** in profile settings (currently change-password only) — the natural
   home for the device-management UI (see §5).

---

## 1. Auth / login & sign-up flow

### 1.1 Entry points & routing

| Route                                                                             | File                                   | Notes                                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/` (sign-in, home)                                                               | `apps/web/app/(home)/page.tsx`         | Renders `<AuthBase authType={SIGN_IN}/>` inside `AuthenticationWrapper pageType=NON_AUTHENTICATED` |
| `/sign-up`                                                                        | `apps/web/app/(all)/sign-up/page.tsx`  | Sign-up variant of `AuthBase`                                                                      |
| `/accounts/forgot-password`, `/accounts/reset-password`, `/accounts/set-password` | `apps/web/app/(all)/accounts/*`        | Password lifecycle                                                                                 |
| `sign-in`, `signin`, `login`, `register`                                          | `apps/web/app/routes/redirects/core/*` | Legacy redirects to `/`                                                                            |

Route table: `apps/web/app/routes/core.ts` (lines 15–44 for the auth block).

### 1.2 Component tree

```
(home)/page.tsx
  └─ AuthenticationWrapper (pageType=NON_AUTHENTICATED)
       └─ AuthBase                          core/components/auth-screens/auth-base.tsx
            └─ AuthRoot                      core/components/account/auth-forms/auth-root.tsx
                 ├─ OAuthOptions (@plane/ui)
                 └─ AuthFormRoot             core/components/account/auth-forms/form-root.tsx
                      ├─ AuthEmailForm       ./email.tsx       (step EMAIL)
                      ├─ AuthUniqueCodeForm  ./unique-code.tsx (step UNIQUE_CODE — magic link)
                      └─ AuthPasswordForm    ./password.tsx    (step PASSWORD)
```

`AuthRoot` is a **client-driven step machine** (`EAuthSteps.EMAIL → PASSWORD | UNIQUE_CODE`) holding
`authMode`, `authStep`, `email`, `errorInfo` in `useState`. Steps & error codes:
`apps/web/helpers/authentication.helper.tsx` (`EAuthSteps`, `EAuthModes`, `EAuthenticationErrorCodes`,
`authErrorHandler`).

### 1.3 How credentials are actually submitted

`AuthFormRoot` first calls the **XHR** `AuthService.emailCheck()` to decide the next step (magic vs
credential). The **password step itself is a native form POST** — see
`core/components/account/auth-forms/password.tsx`:

```147:172:apps/web/core/components/account/auth-forms/password.tsx
      <form
        ref={formRef}
        className="space-y-4"
        method="POST"
        action={`${API_BASE_URL}/auth/${mode === EAuthModes.SIGN_IN ? "sign-in" : "sign-up"}/`}
        onSubmit={async (event) => {
          event.preventDefault(); // Prevent form from submitting by default
          await handleCSRFToken();
          ...
          if (isPasswordValid) {
            setIsSubmitting(true);
            if (formRef.current) formRef.current.submit(); // Manually submit the form if the condition is met
          } else {
            setBannerMessage(true);
          }
        }}
```

CSRF is fetched via `AuthService.requestCSRFToken()` and injected into a hidden
`csrfmiddlewaretoken` input. A hidden `next_path` is forwarded for post-login redirect.

The XHR auth service (`apps/web/core/services/auth.service.ts`):

```19:33:apps/web/core/services/auth.service.ts
  async requestCSRFToken(): Promise<ICsrfTokenData> {
    return this.get("/auth/get-csrf-token/")...
  }

  emailCheck = async (data: IEmailCheckData): Promise<IEmailCheckResponse> =>
    this.post("/auth/email-check/", data, { headers: {} })...
```

(`signOut`, `generateUniqueCode`, `setPassword`, `sendResetPasswordLink` also live here; `signOut` builds a
throwaway form POST to `/auth/sign-out/`.)

### 1.4 Post-login redirect logic

Because login is a full-page POST, Django redirects the browser back to the SPA. The SPA then loads `/`,
`AuthenticationWrapper` (pageType `NON_AUTHENTICATED`) fetches `/api/users/me/`, sees an authenticated user,
and **redirects to the workspace** via `getWorkspaceRedirectionUrl()` (honors `next_path`, then
`last_workspace_slug`/`fallback_workspace_slug`, else `/create-workspace` or `/onboarding`). See
`apps/web/core/lib/wrappers/authentication-wrapper.tsx` lines 58–101.

### 1.5 Where to inject the 2FA _verify_ step

There are two viable shapes; pick based on how the backend implements the challenge:

- **(A) Server-rendered/redirect challenge (recommended, matches existing pattern).** After password verify,
  Django does not finalize the session; instead it redirects the browser back to the SPA with a marker
  (e.g. `?mfa=required&challenge=...` or `?error_code=MFA_REQUIRED`). Add a new **`EAuthSteps.MFA_VERIFY`**
  to `authentication.helper.tsx`, and have `AuthRoot` (which already reads `error_code` from search params,
  lines 41–101) switch to a new `<TwoFactorVerify/>` rendered by `AuthFormRoot`. `<TwoFactorVerify/>` then
  POSTs the OTP/passkey assertion to `auth/mfa/verify` (native form POST or XHR that returns a redirect),
  reusing the same hidden-CSRF + `next_path` mechanics as `password.tsx`.
- **(B) XHR challenge.** If sign-in becomes an XHR returning `{mfa_required, ephemeral_token}`, convert the
  password step to XHR and drive the step machine entirely client-side. Higher blast radius (rewrites the
  native-form contract) — only do this if the backend can't 302.

New error codes (`MFA_REQUIRED`, `INVALID_MFA_CODE`, `MFA_CODE_EXPIRED`, …) should be appended to
`EAuthenticationErrorCodes` + `errorCodeMessages` + `bannerAlertErrorCodes` in
`apps/web/helpers/authentication.helper.tsx` so they render through the existing banner machinery.

### 1.6 Handling `403 {error_code: MFA_SETUP_REQUIRED}` in the SPA

Centralize it in the **axios response interceptor** that already exists in
`apps/web/core/services/api.service.ts` (today it only handles 401):

```25:36:apps/web/core/services/api.service.ts
  private setupInterceptors() {
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          const currentPath = window.location.pathname;
          window.location.replace(`/${currentPath ? `?next_path=${currentPath}` : ``}`);
        }
        return Promise.reject(error);
      }
    );
  }
```

Add a branch: `if (status === 403 && data?.error_code === "MFA_SETUP_REQUIRED")` → set a flag in the user
store / redirect to `/onboarding` (or a dedicated `/account/setup-2fa`) so the forced-setup gate (§3) takes
over. **Caveat:** the shared package `packages/services/src/api.service.ts` has **no interceptor** — services
that extend it (e.g. `packages/services/src/user/user.service.ts`) won't auto-handle the 403, so the gate in
§3 (component-level, driven by store state) is the reliable enforcement point; the interceptor is a UX
convenience.

### 1.7 Admin app (`apps/admin`)

Same native-form-POST pattern, posting to `${API_BASE_URL}/api/instances/admins/sign-in/`, errors via
`?error_code`/`?error_message`:

```120:134:apps/admin/app/(all)/(home)/sign-in-form.tsx
          <form
            className="space-y-4"
            method="POST"
            action={`${API_BASE_URL}/api/instances/admins/sign-in/`}
            onSubmit={() => setIsSubmitting(true)}
            onError={() => setIsSubmitting(false)}
          >
```

The `variant="admin"` of the shared component would render here. Admin uses `AuthService` from the shared
`@plane/services` package (not the web-local one).

---

## 2. Onboarding flow

### 2.1 Files & step machine

- Route: `apps/web/app/(all)/onboarding/page.tsx` → wraps `<OnboardingRoot/>` in
  `AuthenticationWrapper pageType=ONBOARDING`.
- Orchestrator: `apps/web/core/components/onboarding/root.tsx`.
- Step switch: `apps/web/core/components/onboarding/steps/root.tsx`.
- Steps live under `apps/web/core/components/onboarding/steps/{profile,role,usecase,workspace,team}/`.

Steps enum (`packages/types/src/workspace.ts` 255–261):

```255:261:packages/types/src/workspace.ts
export enum EOnboardingSteps {
  PROFILE_SETUP = "PROFILE_SETUP",
  ROLE_SETUP = "ROLE_SETUP",
  USE_CASE_SETUP = "USE_CASE_SETUP",
  WORKSPACE_CREATE_OR_JOIN = "WORKSPACE_CREATE_OR_JOIN",
  INVITE_MEMBERS = "INVITE_MEMBERS",
}
```

### 2.2 How step state is tracked

`OnboardingRoot` keeps the active step in local `useState` (`currentStep`) and **persists progress to the
backend** via `updateUserProfile({ onboarding_step: {...} })`. The flags are booleans on the user profile:
`onboarding_step.{profile_complete, workspace_create, workspace_invite, workspace_join}` plus top-level
`is_onboarded`. See `apps/web/core/components/onboarding/root.tsx` (`stepChange`, `handleStepChange`,
`finishOnboarding`).

"Onboarded" is computed in `AuthenticationWrapper` (lines 50–56):

```50:56:apps/web/core/lib/wrappers/authentication-wrapper.tsx
  const isUserOnboard =
    currentUserProfile?.is_onboarded ||
    (currentUserProfile?.onboarding_step?.profile_complete &&
      currentUserProfile?.onboarding_step?.workspace_create &&
      currentUserProfile?.onboarding_step?.workspace_invite &&
      currentUserProfile?.onboarding_step?.workspace_join) ||
    false;
```

`finishUserOnboarding()` (in `apps/web/core/store/user/profile.store.ts` 163–201) sets all four flags +
calls `updateUserOnBoard()` and refetches profile/settings.

### 2.3 Where to insert a "Set up 2FA" step

Two options:

- **Onboarding step (variant `onboarding`, optional/skippable).** Add `MFA_SETUP = "MFA_SETUP"` to
  `EOnboardingSteps`, a case in `steps/root.tsx`, a folder `steps/mfa/`, and route it in
  `handleStepChange` (e.g. after `USE_CASE_SETUP`/`PROFILE_SETUP`, before workspace creation, or as the very
  last step before `finishOnboarding`). Track completion with a new profile flag
  (`onboarding_step.mfa_setup`) — but **do not** add it to the `isUserOnboard` AND-clause unless 2FA is
  mandatory for _all_ users (that would lock out instances with MFA disabled). Gate inclusion on an instance
  config flag (see `useInstance()` / `config` already consumed in `auth-root.tsx`).
- **Forced-setup (variant `forced`).** For "must set up before using the app", don't rely on the onboarding
  step machine — use the global gate in §3 which short-circuits _any_ authenticated route.

---

## 3. Route protection / app shell — the forced-2FA gate

### 3.1 How auth routes are guarded today

`AuthenticationWrapper` (`apps/web/core/lib/wrappers/authentication-wrapper.tsx`) is the single guard. It is
applied at:

- Public/auth pages: `(home)/page.tsx`, `sign-up`, `onboarding` (each passes a `pageType`).
- **All app routes**: `apps/web/app/(all)/[workspaceSlug]/layout.tsx` wraps everything in
  `<AuthenticationWrapper>` (default `pageType=AUTHENTICATED`) → `<WorkspaceAuthWrapper>`:

```17:33:apps/web/app/(all)/[workspaceSlug]/layout.tsx
export default function WorkspaceLayout(props: Route.ComponentProps) {
  const { workspaceSlug } = props.params;
  return (
    <AuthenticationWrapper>
      <WorkspaceAuthWrapper>
        ...
        <Outlet />
      </WorkspaceAuthWrapper>
    </AuthenticationWrapper>
  );
}
```

The `AUTHENTICATED` branch (lines 130–141) redirects un-onboarded users to `/onboarding` and
unauthenticated users to `/`.

### 3.2 Where to add the global 2FA gate

`AuthenticationWrapper`'s `AUTHENTICATED` branch is the **correct chokepoint** — it runs on every protected
page and already has `currentUser` + `currentUserProfile` loaded. Add a check **before** returning children:

```tsx
// pseudo, inside the EPageTypes.AUTHENTICATED branch, after isUserOnboard passes
if (mfaSetupRequired && pathname !== "/account/setup-2fa") {
  router.push("/account/setup-2fa");
  return <></>;
}
```

`mfaSetupRequired` should be a computed value from the user store (§4), seeded from `/api/users/me/`
(e.g. a `mfa_setup_required` field) and/or the `403 MFA_SETUP_REQUIRED` flag set by the interceptor (§1.6).
Mirror the existing onboarding short-circuit pattern (lines 130–141). Because every workspace route nests
under this wrapper, one edit covers the whole app shell; add a sibling `EPageTypes.MFA_SETUP` (parallel to
`SET_PASSWORD`) if a dedicated standalone route is preferred over reusing `/onboarding`.

> Note: there is no server middleware to update — enforcement is purely this component plus the backend
> middleware returning 403. Keep the backend as the source of truth; the wrapper is for UX redirection.

---

## 4. State management (MobX) & types

### 4.1 Store layout

```
apps/web/core/store/user/
  index.ts          UserStore     → data: IUser, isAuthenticated, fetchCurrentUser(), updateCurrentUser(),
                                     changePassword(), handleSetPassword(), signOut(), reset()
  profile.store.ts  ProfileStore  → data: TUserProfile, fetchUserProfile(), updateUserProfile(),
                                     finishUserOnboarding()
  settings.store.ts UserSettingsStore
  account.store.ts  AccountStore  → linked OAuth accounts (provider, provider_account_id)
```

`UserStore` (`apps/web/core/store/user/index.ts`) composes `userProfile`, `userSettings`, `accounts`,
`permission`. `fetchCurrentUser()` (lines 112–148) loads `me` then fan-outs to profile/settings/workspaces.
Access in components via hooks `useUser`, `useUserProfile`, `useUserSettings` (`@/hooks/store/user`).

### 4.2 Where 2FA state should live

Add a dedicated **`MfaStore`** (e.g. `apps/web/core/store/user/mfa.store.ts`) composed into `UserStore`
alongside `accounts`, holding:

- `methods` — enrolled factors (TOTP / WebAuthn passkeys / recovery codes), with add/remove/reconfigure.
- `devices` — registered authenticators (WebAuthn credentials list).
- `lockdown` / `isMfaEnforced` — instance- or user-level enforcement flag.
- `setupRequired` (computed) — drives the §3 gate.

Follow the existing store conventions: `makeObservable` with `observable`/`action`/`computed`, optimistic
mutation + rollback in `catch` (see `updateCurrentUser` 155–181 and `profile.store.ts` `mutateUserProfile`).
Inject a new `MfaService` (§6). Simpler-state alternative: add `mfa` fields directly to `IUser` and a few
actions on `UserStore`, but a sub-store keeps device lists/observables isolated.

### 4.3 Types (`packages/types`)

- `IUser` / `IUserLite`: `packages/types/src/users.ts` (lines 25–53). Already has
  `is_email_verified`, `is_password_autoset`. **Add** `mfa_enabled?: boolean`,
  `mfa_setup_required?: boolean`, etc. here.
- `TUserProfile`: `packages/types/src/users.ts` (62+) — add `onboarding_step.mfa_setup?` if using the
  onboarding-step route.
- Auth payload types: `packages/types/src/auth.ts` (`IEmailCheckData`, `ICsrfTokenData`, …) — add
  `IMfaChallenge`, `IMfaVerifyPayload`, `TMfaMethod`, `IWebAuthnRegistrationOptions`, etc.
- `TProfileSettingsTabs`: `packages/types/src/settings.ts` line 11 (currently
  `"general" | "preferences" | "notifications" | "security" | "api-tokens"`).

---

## 5. Settings page — Security / Two-factor section

### 5.1 Existing security tab (reuse it)

Profile settings already has a **`security`** tab — currently change-password only:
`apps/web/core/components/settings/profile/content/pages/security.tsx` (`SecurityProfileSettings`, uses
`react-hook-form` `useForm`/`Controller`, `@plane/ui` `Input`, `@plane/propel/button`,
`@plane/propel/toast`, calls `useUser().changePassword`).

Tab plumbing:

- Page route: `apps/web/app/(all)/settings/profile/[profileTabId]/page.tsx` → `ProfileSettingsContent`.
- Tab→component map: `apps/web/core/components/settings/profile/content/pages/index.ts`:

```11:17:apps/web/core/components/settings/profile/content/pages/index.ts
export const PROFILE_SETTINGS_PAGES_MAP: Record<TProfileSettingsTabs, React.LazyExoticComponent<React.FC>> = {
  general: lazy(() => import("./general")...),
  preferences: lazy(() => import("./preferences")...),
  notifications: lazy(() => import("./notifications")...),
  security: lazy(() => import("./security")...),
  "api-tokens": lazy(() => import("./api-tokens")...),
};
```

- Tab metadata/order/labels: `packages/constants/src/settings/profile.ts` (`PROFILE_SETTINGS`,
  `GROUPED_PROFILE_SETTINGS` — `security` already grouped under `YOUR_PROFILE`).
- Sidebar icons: `apps/web/core/components/settings/profile/sidebar/item-categories.tsx`
  (`security: LockIcon`).

### 5.2 Recommended placement

Render a **Two-factor authentication** block inside the existing `security.tsx` page (below change-password),
or split `security.tsx` into sub-sections (`ChangePasswordSection`, `TwoFactorSection`). The 2FA section
hosts: list/add/delete/reconfigure devices (TOTP + WebAuthn), recovery-code regeneration, and a
lockdown/enforce toggle. It renders `<TwoFactorSetup variant="settings" />` (§6) in a modal/inline flow.

If a _separate_ tab is preferred instead of extending `security`, add a `"two-factor"` key to:
`TProfileSettingsTabs` (types), `PROFILE_SETTINGS` + `GROUPED_PROFILE_SETTINGS` (constants),
`PROFILE_SETTINGS_PAGES_MAP` (pages map), and `ICONS` (sidebar). Reusing `security` is lower-friction.

---

## 6. Reusable form placement & conventions

### 6.1 Where the reusable component lives

The component is consumed by web onboarding, web forced-setup, web settings, and **admin** → it must be
importable across apps. Options:

- **Preferred for shared logic/types/service**: put the headless pieces (the `MfaService`, hooks like
  `useTwoFactorSetup`, types) in shared packages (`packages/services`, `packages/types`), and the **presentational
  components in `@plane/ui`** (`packages/ui/src/`). `@plane/ui` already hosts an `auth-form/` family
  (`packages/ui/src/auth-form/{auth-form,auth-input,auth-password-input,auth-confirm-password-input,auth-forgot-password}.tsx`)
  and an `oauth/` folder — a `packages/ui/src/two-factor/` (`two-factor-setup.tsx`, `two-factor-verify.tsx`,
  `qr-code.tsx`, `recovery-codes.tsx`) fits the established convention and is reusable by both apps.
- **If it needs app stores/hooks** (e.g. `useUser`, MobX `MfaStore`): keep the _container_ in
  `apps/web/core/components/account/two-factor/` (web) and a thin admin wrapper in `apps/admin/components/`,
  both rendering the presentational `@plane/ui` pieces. Container injects store/service; `@plane/ui` stays
  dependency-free of MobX. This split matches how `auth-forms/*` (app) wrap `@plane/ui` primitives.

`@plane/ui` is exported via `packages/ui/src/index.ts` and imported as `@plane/ui` (e.g.
`import { OAuthOptions } from "@plane/ui"`). UI primitives also come from `@plane/propel`
(`@plane/propel/button`, `@plane/propel/toast`, `@plane/propel/icons`, `@plane/propel/scrollarea`).

### 6.2 Form library convention

`react-hook-form` (`useForm` + `Controller`) is the standard for XHR-driven forms — see
`security.tsx` (change-password) and most settings pages. Inputs: `@plane/ui` `Input`,
`PasswordStrengthIndicator`; buttons: `@plane/propel/button`; toasts: `setToast`/`TOAST_TYPE` from
`@plane/propel/toast`. Use this for the TOTP-code / recovery-code entry forms.

Exception: the **login challenge** may need a native-form POST (§1.5 option A) to match the existing
redirect-based session flow rather than RHF + XHR.

### 6.3 API service layer pattern for new 2FA methods

Follow `apps/web/core/services/auth.service.ts`: a class `extends APIService` (which sets
`withCredentials: true` and the 401/MFA interceptor), one method per endpoint, returning `response.data`,
`throw error?.response?.data` on failure. Create:

```ts
// apps/web/core/services/mfa.service.ts  (or packages/services/src/auth/mfa.service.ts for cross-app reuse)
export class MfaService extends APIService {
  constructor() { super(API_BASE_URL); }
  // login challenge
  startChallenge = (data) => this.post("/auth/mfa/challenge/", data).then(r => r.data) ...
  verify        = (data) => this.post("/auth/mfa/verify/", data).then(r => r.data) ...
  // management (session-authed)
  listMethods   = () => this.get("/api/users/me/mfa/").then(r => r.data) ...
  enrollTotp    = (data) => this.post("/api/users/me/mfa/totp/", data) ...
  webauthnRegisterOptions = () => this.post("/api/users/me/mfa/webauthn/register/options/", {}) ...
  webauthnRegisterVerify  = (data) => this.post("/api/users/me/mfa/webauthn/register/verify/", data) ...
  deleteMethod  = (id) => this.delete(`/api/users/me/mfa/${id}/`) ...
  regenerateRecoveryCodes = () => this.post("/api/users/me/mfa/recovery-codes/", {}) ...
}
```

WebAuthn ceremonies use `startRegistration`/`startAuthentication` from `@simplewebauthn/browser@13.3.0`
(browser lib) between the `options` and `verify` calls. TOTP enrollment renders the `otpauth://` URI with
`qrcode.react@4.2.0` (`<QRCodeSVG value={otpauthUri} />`). Both deps must be added to
`apps/web/package.json` (and `apps/admin/package.json` if used there), and `qrcode.react` could instead be a
dep of `@plane/ui` if the QR component lives there. Note CSRF: management `POST/DELETE` go through the same
session/CSRF flow — fetch via `requestCSRFToken()` and send `X-CSRFTOKEN` like `AuthService.setPassword`.

---

## 7. i18n conventions

- Locale files: `packages/i18n/src/locales/<lang>/<namespace>.json` (e.g.
  `packages/i18n/src/locales/en/auth.json`). Namespaces are registered in
  `packages/i18n/src/constants/namespaces.ts` (`auth`, `settings`, `common`, … already present).
- Loading: `packages/i18n/src/core/instance.ts` lazily imports `../locales/${language}/${namespace}.json`
  via `i18next-resources-to-backend`, with `fallbackNS` over all namespaces (so a key in any namespace
  resolves without specifying it). ICU message format is enabled (`i18next-icu`).
- Usage: `const { t } = useTranslation();` from `@plane/i18n`, then `t("auth.common.password.label")`. Keys
  are dot-separated and `nsSeparator` is **off** (don't use `ns:key`).

**For 2FA strings**: add a `two_factor` (or `mfa`) subtree to **`packages/i18n/src/locales/en/auth.json`**
(login challenge + setup, reused by both apps) and/or `settings.json` (management section), mirroring the
existing `auth.common.password.*` structure. Add the same keys to every locale under
`packages/i18n/src/locales/*/` (the repo ships many languages). The repo provides a **`translate` skill**
(`.claude/skills/translate/SKILL.md`) that enforces do-not-translate terms, placeholder preservation, and
the AI-translation review workflow — follow it when adding keys to non-English locales. Some legacy auth
error strings in `authentication.helper.tsx` are still hardcoded English (with a `// TODO: move all error
messages to translation files`) — new MFA error messages should go straight into `auth.json`.

---

## 8. Summary — key integration points (checklist)

| Area                       | File(s) to touch                                                                                                   | Action                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Login verify step          | `apps/web/helpers/authentication.helper.tsx`, `.../auth-forms/{auth-root,form-root}.tsx` + new `two-factor-verify` | Add `MFA_VERIFY` step + new error codes; render `<TwoFactorVerify/>` on backend marker |
| Login form POST            | `.../auth-forms/password.tsx`, `apps/admin/.../sign-in-form.tsx`                                                   | Keep native form POST; handle 302→challenge redirect                                   |
| 403 MFA_SETUP_REQUIRED     | `apps/web/core/services/api.service.ts` (interceptor)                                                              | Add 403/`MFA_SETUP_REQUIRED` branch → set store flag / redirect                        |
| Forced-setup gate          | `apps/web/core/lib/wrappers/authentication-wrapper.tsx` (AUTHENTICATED branch)                                     | Redirect users with `mfa_setup_required` to setup route                                |
| Onboarding step (optional) | `packages/types/src/workspace.ts`, `.../onboarding/{root,steps/root}.tsx`                                          | Add optional `MFA_SETUP` step gated by instance config                                 |
| State                      | `apps/web/core/store/user/index.ts` + new `mfa.store.ts`                                                           | Add `MfaStore` (methods, devices, lockdown, setupRequired)                             |
| Types                      | `packages/types/src/{users,auth,settings}.ts`                                                                      | Add MFA fields + payload/method types                                                  |
| Settings UI                | `apps/web/core/components/settings/profile/content/pages/security.tsx`                                             | Add Two-factor section (devices/recovery/lockdown)                                     |
| Reusable component         | `packages/ui/src/two-factor/*` (+ web/admin containers)                                                            | Presentational `<TwoFactorSetup variant=...>` / `<TwoFactorVerify/>`                   |
| Service                    | `apps/web/core/services/mfa.service.ts` (or `packages/services`)                                                   | `extends APIService`; `auth/mfa/*` + `api/users/me/mfa/*`                              |
| Deps                       | `apps/web/package.json` (+ admin / `@plane/ui`)                                                                    | `@simplewebauthn/browser@13.3.0`, `qrcode.react@4.2.0`                                 |
| i18n                       | `packages/i18n/src/locales/*/auth.json` (+ `settings.json`)                                                        | Add `two_factor` keys across locales (use `translate` skill)                           |

**Single most important point:** the existing **`AuthenticationWrapper`** is the only auth gate (no server
middleware), and password auth is a **native form POST + redirect** (not XHR). 2FA must therefore (a) hook the
login challenge into the redirect/`error_code` flow, and (b) enforce forced-setup through the
`AuthenticationWrapper` AUTHENTICATED branch + the axios 403 interceptor, with the backend 403 as source of truth.
