# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Forced-2FA-setup enforcement middleware.

When 2FA is enabled and enforced (the shipped default), any fully-authenticated
user who has not yet configured a second factor is blocked from every route
except an allowlist of setup / verify / sign-out endpoints. This is the
server-side guarantee that the SPA gate cannot be bypassed.

Registered after ``AuthenticationMiddleware`` / ``crum`` so ``request.user`` is
populated.
"""

# Django imports
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import Resolver404, resolve

# Module imports
from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES

# URL names that an un-enrolled user is always allowed to reach so they can
# complete setup (and sign out / fetch CSRF / read their own profile).
ALLOWLISTED_URL_NAMES = {
    # MFA management (setup)
    "user-mfa",
    "mfa-totp-setup",
    "mfa-totp-verify",
    "mfa-webauthn-register-begin",
    "mfa-webauthn-register-complete",
    "mfa-devices",
    "mfa-device-detail",
    "mfa-recovery-codes-regenerate",
    "mfa-lockdown",
    "mfa-step-up",
    # MFA login-flow challenge
    "mfa-verify",
    "mfa-webauthn-authenticate-begin",
    "mfa-webauthn-authenticate-complete",
    # Session / CSRF
    "sign-out",
    "space-sign-out",
    "get_csrf_token",
    # Profile reads needed to render the setup / onboarding shell
    "users",
    "accounts",
    "user-session",
    "user-onboard",
}


class MFAEnforcementMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._should_block(request):
            return self._blocked_response(request)
        return self.get_response(request)

    def _should_block(self, request):
        user = getattr(request, "user", None)
        # Anonymous (incl. API-key requests at middleware time) → login flow
        # handles it.
        if user is None or not user.is_authenticated:
            return False

        # Bots are not interactive users.
        if getattr(user, "is_bot", False):
            return False

        if not self._is_enforced():
            return False

        # Source of truth for the gate: UserMFA.is_enabled.
        from plane.db.models import UserMFA

        if not hasattr(request, "_mfa_enrolled"):
            request._mfa_enrolled = UserMFA.objects.filter(user=user, is_enabled=True).exists()
        if request._mfa_enrolled:
            return False

        # Allow the setup / verify / sign-out endpoints through.
        try:
            match = resolve(request.path_info)
        except Resolver404:
            # Unknown route (e.g. static asset) → don't interfere.
            return False
        if match.url_name in ALLOWLISTED_URL_NAMES:
            return False

        return True

    @staticmethod
    def _is_enforced():
        from plane.authentication.utils.mfa import is_mfa_enforced_globally

        return is_mfa_enforced_globally()

    @staticmethod
    def _wants_json(request):
        if request.path_info.startswith("/api/") or request.path_info.startswith("/auth/"):
            return True
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return True
        accept = request.headers.get("accept", "")
        return "application/json" in accept and "text/html" not in accept

    def _blocked_response(self, request):
        if self._wants_json(request):
            return JsonResponse(
                {
                    "error_code": AUTHENTICATION_ERROR_CODES["MFA_SETUP_REQUIRED"],
                    "error_message": "MFA_SETUP_REQUIRED",
                },
                status=403,
            )
        # Browser navigation → route to the SPA setup gate.
        from django.conf import settings

        base = (getattr(settings, "WEB_URL", None) or "").rstrip("/")
        return redirect(f"{base}/accounts/setup-2fa")
