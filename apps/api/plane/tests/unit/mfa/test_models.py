# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""MFA model persistence tests (R8, NFR1)."""

import pytest

from plane.authentication.utils import mfa as mfa_utils
from plane.db.models import MFADevice, MFARecoveryCode, UserMFA


@pytest.mark.unit
class TestMFAModels:
    def test_table_names(self):
        assert UserMFA._meta.db_table == "user_mfa"
        assert MFADevice._meta.db_table == "mfa_devices"
        assert MFARecoveryCode._meta.db_table == "mfa_recovery_codes"

    @pytest.mark.django_db
    def test_user_mfa_defaults(self, create_user):
        user_mfa = UserMFA.objects.create(user=create_user)
        assert user_mfa.is_enabled is False
        assert user_mfa.is_enforced is False
        assert user_mfa.enabled_at is None
        assert user_mfa.step_up_at is None

    @pytest.mark.django_db
    def test_totp_secret_stored_encrypted(self, create_user):
        secret = mfa_utils.generate_totp_secret()
        device = MFADevice.objects.create(
            user=create_user,
            device_type=MFADevice.DeviceType.TOTP,
            secret_encrypted=mfa_utils.encrypt_secret(secret),
        )
        device.refresh_from_db()
        # The raw column must contain ciphertext, not the base32 secret.
        assert device.secret_encrypted != secret
        assert secret not in device.secret_encrypted
        # ... but it round-trips back to the original secret.
        assert mfa_utils.decrypt_secret(device.secret_encrypted) == secret

    @pytest.mark.django_db
    def test_webauthn_device_defaults(self, create_user):
        device = MFADevice.objects.create(
            user=create_user,
            device_type=MFADevice.DeviceType.WEBAUTHN,
            credential_id="cred-1",
            public_key="pub-1",
        )
        assert device.sign_count == 0
        assert device.transports == []
        assert device.is_hardware_security_key is False

    @pytest.mark.django_db
    def test_recovery_code_single_use_flag(self, create_user):
        rc = MFARecoveryCode.objects.create(
            user=create_user,
            code_hash=mfa_utils.hash_recovery_code("AAAAA-BBBBB"),
        )
        assert rc.used_at is None

    @pytest.mark.django_db
    def test_hard_delete_removes_row(self, create_user):
        device = MFADevice.objects.create(
            user=create_user,
            device_type=MFADevice.DeviceType.TOTP,
        )
        device_id = device.id
        device.delete(soft=False)
        # Hard delete: not retrievable via the all_objects manager either.
        assert not MFADevice.all_objects.filter(id=device_id).exists()
