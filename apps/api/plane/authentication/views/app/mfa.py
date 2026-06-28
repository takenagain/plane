# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Login-flow (partial-auth) MFA challenge endpoints.

These views operate on the partial-auth session state
(``mfa_pending_user_id``) established by the first-factor login views. They run
as ``AllowAny`` (the user is *not* logged in yet) and only finalise a real
session via ``user_login()`` once the second factor verifies.
"""

# Python imports
from datetime import datetime

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# Module imports
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)
from plane.authentication.rate_limit import MFAVerifyThrottle
from plane.authentication.utils import mfa as mfa_utils
from plane.authentication.utils.login import user_login
from plane.authentication.utils.redirection_path import get_redirection_path
from plane.db.models import MFADevice, MFARecoveryCode, User, UserMFA


def _error(code, status_code=status.HTTP_400_BAD_REQUEST, **payload):
    exc = AuthenticationException(
        error_code=AUTHENTICATION_ERROR_CODES[code],
        error_message=code,
        payload=payload,
    )
    return Response(exc.get_error_dict(), status=status_code)


class MFAPendingMixin:
    permission_classes = [AllowAny]

    def get_pending_user(self, request):
        """Resolve the partial-auth user, or return (None, error_response)."""
        pending_id = request.session.get("mfa_pending_user_id")
        if not pending_id:
            return None, _error("MFA_REQUIRED", status_code=status.HTTP_401_UNAUTHORIZED)

        pending_until = request.session.get("mfa_pending_until")
        if pending_until:
            try:
                if timezone.now() > datetime.fromisoformat(pending_until):
                    self.clear_pending(request)
                    return None, _error("MFA_CODE_EXPIRED", status_code=status.HTTP_401_UNAUTHORIZED)
            except ValueError:
                pass

        user = User.objects.filter(id=pending_id, is_active=True).first()
        if not user:
            self.clear_pending(request)
            return None, _error("MFA_REQUIRED", status_code=status.HTTP_401_UNAUTHORIZED)
        return user, None

    @staticmethod
    def clear_pending(request):
        for key in ("mfa_pending_user_id", "mfa_pending_until"):
            request.session.pop(key, None)

    def finalize_login(self, request, user):
        """Upgrade the partial-auth session into a real authenticated session."""
        self.clear_pending(request)
        user_login(request=request, user=user, is_app=True)
        request.session["mfa_authenticated_at"] = timezone.now().isoformat()
        request.session.save()

        user_mfa = UserMFA.objects.filter(user=user).first()
        if user_mfa:
            user_mfa.last_verified_at = timezone.now()
            user_mfa.save(update_fields=["last_verified_at", "updated_at"])

        path = request.data.get("next_path") or get_redirection_path(user=user)
        return Response({"success": True, "redirect": str(path)}, status=status.HTTP_200_OK)


class MFAVerifyEndpoint(MFAPendingMixin, APIView):
    """Verify a TOTP code or a recovery code during login."""

    throttle_classes = [MFAVerifyThrottle]

    def post(self, request):
        user, error = self.get_pending_user(request)
        if error:
            return error

        user_mfa = UserMFA.objects.filter(user=user).first()
        if not user_mfa or not user_mfa.is_enabled:
            return _error("MFA_NOT_ENABLED")

        code = request.data.get("code")
        recovery_code = request.data.get("recovery_code")

        if not code and not recovery_code:
            return _error("MFA_INVALID_CODE")

        # Under lockdown only hardware security keys are accepted.
        if user_mfa.is_enforced:
            return _error("MFA_LOCKDOWN_ACTIVE", status_code=status.HTTP_403_FORBIDDEN)

        # Brute-force protection (per pending user).
        if mfa_utils.attempts_exhausted(f"login:{user.id}"):
            self.clear_pending(request)
            return _error("MFA_ATTEMPTS_EXHAUSTED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

        if recovery_code:
            return self._verify_recovery(request, user, recovery_code)
        return self._verify_totp(request, user, code)

    def _verify_totp(self, request, user, code):
        for device in MFADevice.objects.filter(
            user=user, device_type=MFADevice.DeviceType.TOTP, is_confirmed=True
        ):
            secret = mfa_utils.decrypt_secret(device.secret_encrypted)
            if mfa_utils.verify_totp(secret, code):
                device.last_used_at = timezone.now()
                device.save(update_fields=["last_used_at", "updated_at"])
                mfa_utils.reset_verify_attempts(f"login:{user.id}")
                return self.finalize_login(request, user)
        return _error("MFA_INVALID_CODE")

    def _verify_recovery(self, request, user, recovery_code):
        for rc in MFARecoveryCode.objects.filter(user=user, used_at__isnull=True):
            if mfa_utils.verify_recovery_code(recovery_code, rc.code_hash):
                rc.used_at = timezone.now()
                rc.save(update_fields=["used_at", "updated_at"])
                mfa_utils.reset_verify_attempts(f"login:{user.id}")
                return self.finalize_login(request, user)
        return _error("MFA_INVALID_RECOVERY_CODE")


class MFAWebAuthnAuthenticateBeginEndpoint(MFAPendingMixin, APIView):
    """Start a WebAuthn assertion for the partial-auth user."""

    def post(self, request):
        user, error = self.get_pending_user(request)
        if error:
            return error

        user_mfa = UserMFA.objects.filter(user=user).first()
        if not user_mfa or not user_mfa.is_enabled:
            return _error("MFA_NOT_ENABLED")

        devices = MFADevice.objects.filter(
            user=user, device_type=MFADevice.DeviceType.WEBAUTHN, is_confirmed=True
        ).exclude(credential_id="")

        # Under lockdown, only hardware security keys may be used.
        if user_mfa.is_enforced:
            devices = devices.filter(is_hardware_security_key=True)

        descriptors = [
            {"credential_id": d.credential_id, "transports": d.transports} for d in devices
        ]
        if not descriptors:
            return _error("WEBAUTHN_AUTH_FAILED")

        user_verification = "required" if user_mfa.is_enforced else "preferred"
        try:
            options, challenge = mfa_utils.build_authentication_options(
                descriptors, user_verification=user_verification
            )
        except Exception:
            return _error("WEBAUTHN_AUTH_FAILED")

        # Bind the challenge to this (partial-auth) session.
        if not request.session.session_key:
            request.session.save()
        mfa_utils.store_challenge("authenticate", request.session.session_key, challenge)

        return Response(mfa_utils.options_to_dict(options), status=status.HTTP_200_OK)


class MFAWebAuthnAuthenticateCompleteEndpoint(MFAPendingMixin, APIView):
    """Verify a WebAuthn assertion and finalise login."""

    throttle_classes = [MFAVerifyThrottle]

    def post(self, request):
        user, error = self.get_pending_user(request)
        if error:
            return error

        user_mfa = UserMFA.objects.filter(user=user).first()
        if not user_mfa or not user_mfa.is_enabled:
            return _error("MFA_NOT_ENABLED")

        credential = request.data.get("credential", request.data)
        challenge = mfa_utils.consume_challenge("authenticate", request.session.session_key or "")
        if challenge is None:
            return _error("MFA_CODE_EXPIRED")

        credential_id = mfa_utils.extract_credential_id(credential)
        if not credential_id:
            return _error("WEBAUTHN_AUTH_FAILED")

        device = MFADevice.objects.filter(
            user=user,
            device_type=MFADevice.DeviceType.WEBAUTHN,
            is_confirmed=True,
            credential_id=credential_id,
        ).first()
        if not device:
            return _error("WEBAUTHN_AUTH_FAILED")

        # Under lockdown, the matched device must be a hardware security key.
        if user_mfa.is_enforced and not device.is_hardware_security_key:
            return _error("MFA_LOCKDOWN_ACTIVE", status_code=status.HTTP_403_FORBIDDEN)

        require_uv = user_mfa.is_enforced or device.attachment == "platform"
        try:
            new_sign_count = mfa_utils.verify_authentication(
                credential=credential,
                expected_challenge=challenge,
                public_key=device.public_key,
                current_sign_count=device.sign_count,
                require_user_verification=require_uv,
            )
        except Exception:
            return _error("WEBAUTHN_AUTH_FAILED")

        device.sign_count = new_sign_count
        device.last_used_at = timezone.now()
        device.save(update_fields=["sign_count", "last_used_at", "updated_at"])

        return self.finalize_login(request, user)
