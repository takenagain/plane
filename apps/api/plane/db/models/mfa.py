# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class UserMFA(BaseModel):
    """Per-user MFA enrollment state (one row per user).

    Source of truth for the forced-setup gate (``is_enabled``) and for the
    FIDO2 hardware-security-key lockdown (``is_enforced``).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa",
    )
    # True once at least one factor has been confirmed (drives the gate).
    is_enabled = models.BooleanField(default=False)
    # Lockdown: only hardware security keys are accepted at login. Only
    # settable when the user has >= 2 confirmed hardware security keys.
    is_enforced = models.BooleanField(default=False)
    enabled_at = models.DateTimeField(null=True, blank=True)
    last_verified_at = models.DateTimeField(null=True, blank=True)
    # Timestamp of the last re-auth; gates sensitive management operations.
    step_up_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_mfa"
        verbose_name = "User MFA"
        verbose_name_plural = "User MFA"

    def __str__(self):
        return f"{self.user_id} <{self.is_enabled}>"


class MFADevice(BaseModel):
    """A single second factor: a TOTP secret or a WebAuthn credential."""

    class DeviceType(models.TextChoices):
        TOTP = "TOTP", "Authenticator app (TOTP)"
        WEBAUTHN = "WEBAUTHN", "Security key / passkey (WebAuthn)"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa_devices",
    )
    device_type = models.CharField(max_length=20, choices=DeviceType.choices)
    # User-friendly label, e.g. "YubiKey 5C — work".
    name = models.CharField(max_length=255, blank=True)
    # Two-phase enrollment guard.
    is_confirmed = models.BooleanField(default=False)

    # TOTP: Fernet-encrypted base32 secret. Empty for WebAuthn.
    secret_encrypted = models.TextField(blank=True, default="")

    # WebAuthn specifics
    credential_id = models.TextField(blank=True, default="")  # base64url
    public_key = models.TextField(blank=True, default="")  # base64url COSE
    sign_count = models.PositiveBigIntegerField(default=0)  # replay protection
    transports = models.JSONField(default=list)  # e.g. ["usb", "nfc"]
    attachment = models.CharField(max_length=20, blank=True)  # platform | cross-platform
    aaguid = models.CharField(max_length=64, blank=True)  # authenticator model id
    device_class = models.CharField(max_length=10, blank=True)  # single | multi
    backed_up = models.BooleanField(default=False)
    # Resolved server-side (never trusts the client); counts toward the
    # lockdown threshold.
    is_hardware_security_key = models.BooleanField(default=False)

    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mfa_devices"
        verbose_name = "MFA Device"
        verbose_name_plural = "MFA Devices"
        constraints = [
            models.UniqueConstraint(
                fields=["credential_id"],
                condition=models.Q(device_type="WEBAUTHN"),
                name="uq_mfa_webauthn_credential_id",
            )
        ]
        indexes = [
            models.Index(fields=["user", "device_type"], name="mfa_device_user_type_idx"),
            models.Index(fields=["user", "is_confirmed"], name="mfa_device_user_conf_idx"),
        ]

    def __str__(self):
        return f"{self.user_id} <{self.device_type}> {self.name}"


class MFARecoveryCode(BaseModel):
    """One-time backup codes — only salted hashes are stored, never plaintext."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa_recovery_codes",
    )
    code_hash = models.CharField(max_length=128)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mfa_recovery_codes"
        verbose_name = "MFA Recovery Code"
        verbose_name_plural = "MFA Recovery Codes"
        indexes = [
            models.Index(fields=["user", "used_at"], name="mfa_recovery_user_used_idx"),
        ]

    def __str__(self):
        return f"{self.user_id} <{bool(self.used_at)}>"
