# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging
from datetime import timedelta

# Django imports
from django.conf import settings
from django.db import transaction
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.serializers import MFADeviceSerializer, UserMFASerializer
from plane.app.views.base import BaseAPIView
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)
from plane.authentication.rate_limit import MFAVerifyThrottle
from plane.authentication.utils import mfa as mfa_utils
from plane.db.models import MFADevice, MFARecoveryCode, User, UserMFA

logger = logging.getLogger("plane.authentication")


def _error(code, status_code=status.HTTP_400_BAD_REQUEST, **payload):
    exc = AuthenticationException(
        error_code=AUTHENTICATION_ERROR_CODES[code],
        error_message=code,
        payload=payload,
    )
    return Response(exc.get_error_dict(), status=status_code)


def get_or_create_user_mfa(user):
    user_mfa, _ = UserMFA.objects.get_or_create(user=user)
    return user_mfa


def confirmed_hardware_key_count(user):
    return MFADevice.objects.filter(
        user=user,
        device_type=MFADevice.DeviceType.WEBAUTHN,
        is_confirmed=True,
        is_hardware_security_key=True,
    ).count()


def issue_recovery_codes(user):
    """Replace any existing recovery codes with a fresh single-use set.

    Returns the plaintext codes (shown to the user exactly once); only hashes
    are persisted.
    """
    codes = mfa_utils.generate_recovery_codes()
    with transaction.atomic():
        MFARecoveryCode.objects.filter(user=user).delete(soft=False)
        MFARecoveryCode.objects.bulk_create(
            [MFARecoveryCode(user=user, code_hash=mfa_utils.hash_recovery_code(code)) for code in codes]
        )
    return codes


def has_recent_step_up(user_mfa):
    if not user_mfa.step_up_at:
        return False
    window = timedelta(seconds=settings.MFA_STEP_UP_TTL_SECONDS)
    return timezone.now() - user_mfa.step_up_at <= window


class UserMFAEndpoint(BaseAPIView):
    """GET current MFA state (status + device list + lockdown eligibility)."""

    def get(self, request):
        user_mfa = get_or_create_user_mfa(request.user)
        devices = list(MFADevice.objects.filter(user=request.user, is_confirmed=True))
        serializer = UserMFASerializer(user_mfa, context={"devices": devices})
        return Response(serializer.data, status=status.HTTP_200_OK)


class MFATOTPSetupEndpoint(BaseAPIView):
    """Create an unconfirmed TOTP device and return its provisioning URI."""

    def post(self, request):
        name = request.data.get("name", "") or "Authenticator app"
        secret = mfa_utils.generate_totp_secret()
        account_name = request.user.email or str(request.user.id)
        otpauth_uri = mfa_utils.get_totp_provisioning_uri(secret, account_name)

        device = MFADevice.objects.create(
            user=request.user,
            device_type=MFADevice.DeviceType.TOTP,
            name=name,
            is_confirmed=False,
            secret_encrypted=mfa_utils.encrypt_secret(secret),
        )
        return Response(
            {"otpauth_uri": otpauth_uri, "secret": secret, "device_id": str(device.id)},
            status=status.HTTP_200_OK,
        )


class MFATOTPVerifyEndpoint(BaseAPIView):
    """Confirm a TOTP device; on first factor, enable MFA + issue recovery codes."""

    throttle_classes = [MFAVerifyThrottle]

    def post(self, request):
        device_id = request.data.get("device_id")
        code = request.data.get("code")
        if not device_id or not code:
            return _error("MFA_INVALID_CODE")

        device = MFADevice.objects.filter(
            id=device_id,
            user=request.user,
            device_type=MFADevice.DeviceType.TOTP,
        ).first()
        if not device:
            return _error("MFA_INVALID_CODE", status_code=status.HTTP_404_NOT_FOUND)

        secret = mfa_utils.decrypt_secret(device.secret_encrypted)
        if not mfa_utils.verify_totp(secret, code):
            return _error("MFA_INVALID_CODE")

        user_mfa = get_or_create_user_mfa(request.user)
        first_factor = not user_mfa.is_enabled

        with transaction.atomic():
            device.is_confirmed = True
            device.last_used_at = timezone.now()
            device.save(update_fields=["is_confirmed", "last_used_at", "updated_at"])

            recovery_codes = None
            if first_factor:
                user_mfa.is_enabled = True
                user_mfa.enabled_at = timezone.now()
                user_mfa.save(update_fields=["is_enabled", "enabled_at", "updated_at"])
                recovery_codes = issue_recovery_codes(request.user)

        response = {"device": MFADeviceSerializer(device).data}
        if recovery_codes is not None:
            response["recovery_codes"] = recovery_codes
        return Response(response, status=status.HTTP_200_OK)


class MFAWebAuthnRegisterBeginEndpoint(BaseAPIView):
    """Return WebAuthn registration options for a passkey or security key."""

    def post(self, request):
        attachment = request.data.get("attachment", "cross-platform")
        if attachment not in ("platform", "cross-platform"):
            attachment = "cross-platform"

        # Exclude already-registered credentials to prevent duplicates.
        exclude = list(
            MFADevice.objects.filter(
                user=request.user,
                device_type=MFADevice.DeviceType.WEBAUTHN,
                is_confirmed=True,
            )
            .exclude(credential_id="")
            .values_list("credential_id", flat=True)
        )

        display_name = (
            " ".join(filter(None, [request.user.first_name, request.user.last_name])).strip()
            or request.user.email
            or str(request.user.id)
        )
        try:
            options, challenge = mfa_utils.build_registration_options(
                user_id=request.user.id,
                user_name=request.user.email or str(request.user.id),
                user_display_name=display_name,
                attachment=attachment,
                exclude_credentials=exclude,
            )
        except Exception:
            return _error("WEBAUTHN_REGISTRATION_FAILED")

        mfa_utils.store_challenge("register", str(request.user.id), challenge)
        # Stash the requested attachment so complete can label correctly.
        request.session["mfa_register_attachment"] = attachment
        request.session["mfa_register_name"] = request.data.get("name", "")
        request.session.save()

        return Response(mfa_utils.options_to_dict(options), status=status.HTTP_200_OK)


class MFAWebAuthnRegisterCompleteEndpoint(BaseAPIView):
    """Verify and persist a WebAuthn credential, resolving its classification."""

    def post(self, request):
        credential = request.data.get("credential", request.data)
        challenge = mfa_utils.consume_challenge("register", str(request.user.id))
        if challenge is None:
            return _error("MFA_CODE_EXPIRED")

        attachment = request.session.get("mfa_register_attachment", "cross-platform")
        name = request.session.get("mfa_register_name", "") or (
            "Passkey" if attachment == "platform" else "Security key"
        )
        # Passkeys require user verification; second-factor keys prefer it.
        require_uv = attachment == "platform"

        try:
            result = mfa_utils.verify_registration(
                credential=credential,
                expected_challenge=challenge,
                require_user_verification=require_uv,
            )
        except Exception as exc:
            logger.exception("WebAuthn registration verification failed: %s", exc)
            return _error("WEBAUTHN_REGISTRATION_FAILED")

        # Read client-reported signals from the raw payload, then resolve the
        # authoritative classification server-side.
        transports = []
        client_attachment = attachment
        if isinstance(credential, dict):
            response_obj = credential.get("response", {}) or {}
            transports = response_obj.get("transports", []) or []
            client_attachment = credential.get("authenticatorAttachment") or attachment

        is_hardware = mfa_utils.classify_authenticator(
            attachment=client_attachment,
            transports=transports,
            device_class=result["device_class"],
            backed_up=result["backed_up"],
        )

        user_mfa = get_or_create_user_mfa(request.user)
        first_factor = not user_mfa.is_enabled

        with transaction.atomic():
            device = MFADevice.objects.create(
                user=request.user,
                device_type=MFADevice.DeviceType.WEBAUTHN,
                name=name,
                is_confirmed=True,
                credential_id=result["credential_id"],
                public_key=result["public_key"],
                sign_count=result["sign_count"],
                transports=transports,
                attachment=client_attachment if client_attachment in ("platform", "cross-platform") else "",
                aaguid=result["aaguid"],
                device_class=result["device_class"],
                backed_up=result["backed_up"],
                is_hardware_security_key=is_hardware,
                last_used_at=timezone.now(),
            )

            recovery_codes = None
            if first_factor:
                user_mfa.is_enabled = True
                user_mfa.enabled_at = timezone.now()
                user_mfa.save(update_fields=["is_enabled", "enabled_at", "updated_at"])
                recovery_codes = issue_recovery_codes(request.user)

        response = MFADeviceSerializer(device).data
        if recovery_codes is not None:
            response = {"device": response, "recovery_codes": recovery_codes}
        return Response(response, status=status.HTTP_200_OK)


class MFADeviceListEndpoint(BaseAPIView):
    """List the user's factors."""

    def get(self, request):
        devices = MFADevice.objects.filter(user=request.user).order_by("-created_at")
        return Response(MFADeviceSerializer(devices, many=True).data, status=status.HTTP_200_OK)


class MFADeviceDetailEndpoint(BaseAPIView):
    """Rename (PATCH) or hard-delete (DELETE) a single factor."""

    def patch(self, request, pk):
        device = MFADevice.objects.filter(id=pk, user=request.user).first()
        if not device:
            return _error("MFA_NOT_ENABLED", status_code=status.HTTP_404_NOT_FOUND)
        name = request.data.get("name")
        if name is not None:
            device.name = name
            device.save(update_fields=["name", "updated_at"])
        return Response(MFADeviceSerializer(device).data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        user_mfa = get_or_create_user_mfa(request.user)
        # Sensitive operation: require a recent step-up re-auth.
        if not has_recent_step_up(user_mfa):
            return _error("MFA_STEP_UP_REQUIRED", status_code=status.HTTP_403_FORBIDDEN)

        device = MFADevice.objects.filter(id=pk, user=request.user).first()
        if not device:
            return _error("MFA_NOT_ENABLED", status_code=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            # Hard delete so secrets do not linger and unique constraints hold.
            device.delete(soft=False)

            # Auto-disable lockdown if hardware keys drop below the threshold.
            if user_mfa.is_enforced and confirmed_hardware_key_count(request.user) < 2:
                user_mfa.is_enforced = False
                user_mfa.save(update_fields=["is_enforced", "updated_at"])

            # If no confirmed factors remain, the account is no longer enrolled.
            if not MFADevice.objects.filter(user=request.user, is_confirmed=True).exists():
                user_mfa.is_enabled = False
                user_mfa.is_enforced = False
                user_mfa.save(update_fields=["is_enabled", "is_enforced", "updated_at"])
                MFARecoveryCode.objects.filter(user=request.user).delete(soft=False)

        return Response(status=status.HTTP_204_NO_CONTENT)


class MFARecoveryCodesRegenerateEndpoint(BaseAPIView):
    """Re-issue recovery codes (invalidating the old set). Requires step-up."""

    def post(self, request):
        user_mfa = get_or_create_user_mfa(request.user)
        if not user_mfa.is_enabled:
            return _error("MFA_NOT_ENABLED")
        if not has_recent_step_up(user_mfa):
            return _error("MFA_STEP_UP_REQUIRED", status_code=status.HTTP_403_FORBIDDEN)
        codes = issue_recovery_codes(request.user)
        return Response({"recovery_codes": codes}, status=status.HTTP_200_OK)


class MFALockdownEndpoint(BaseAPIView):
    """Toggle FIDO2 lockdown. Requires step-up and >= 2 hardware keys to enable."""

    def post(self, request):
        user_mfa = get_or_create_user_mfa(request.user)
        if not user_mfa.is_enabled:
            return _error("MFA_NOT_ENABLED")
        if not has_recent_step_up(user_mfa):
            return _error("MFA_STEP_UP_REQUIRED", status_code=status.HTTP_403_FORBIDDEN)

        enable = bool(request.data.get("enable", False))
        if enable and confirmed_hardware_key_count(request.user) < 2:
            return _error("MFA_LOCKDOWN_ACTIVE")

        user_mfa.is_enforced = enable
        user_mfa.save(update_fields=["is_enforced", "updated_at"])
        devices = list(MFADevice.objects.filter(user=request.user, is_confirmed=True))
        return Response(
            UserMFASerializer(user_mfa, context={"devices": devices}).data,
            status=status.HTTP_200_OK,
        )


class MFAStepUpEndpoint(BaseAPIView):
    """Establish a recent re-auth (password or current TOTP) for sensitive ops."""

    throttle_classes = [MFAVerifyThrottle]

    def post(self, request):
        user = User.objects.get(pk=request.user.id)
        user_mfa = get_or_create_user_mfa(user)

        password = request.data.get("password")
        code = request.data.get("code")

        verified = False
        if password and not user.is_password_autoset and user.check_password(password):
            verified = True
        elif code:
            for device in MFADevice.objects.filter(
                user=user, device_type=MFADevice.DeviceType.TOTP, is_confirmed=True
            ):
                if mfa_utils.verify_totp(mfa_utils.decrypt_secret(device.secret_encrypted), code):
                    verified = True
                    break

        if not verified:
            return _error("MFA_INVALID_CODE", status_code=status.HTTP_403_FORBIDDEN)

        user_mfa.step_up_at = timezone.now()
        user_mfa.save(update_fields=["step_up_at", "updated_at"])
        return Response({"step_up_at": user_mfa.step_up_at.isoformat()}, status=status.HTTP_200_OK)
