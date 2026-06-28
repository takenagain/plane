# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""MFA management endpoint tests (R9, R14, R16, R17)."""

import pyotp
import pytest
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES
from plane.authentication.utils import mfa as mfa_utils
from plane.db.models import MFADevice, MFARecoveryCode, UserMFA


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _set_step_up(user):
    user_mfa, _ = UserMFA.objects.get_or_create(user=user)
    user_mfa.step_up_at = timezone.now()
    user_mfa.save()
    return user_mfa


@pytest.mark.contract
class TestTOTPEnrollment:
    @pytest.mark.django_db
    def test_setup_returns_provisioning_uri(self, session_client, create_user):
        response = session_client.post(reverse("mfa-totp-setup"), {}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["otpauth_uri"].startswith("otpauth://totp/")
        assert "secret" in response.data
        assert "device_id" in response.data
        # An unconfirmed device exists; MFA is not yet enabled.
        device = MFADevice.objects.get(id=response.data["device_id"])
        assert device.is_confirmed is False
        assert not UserMFA.objects.filter(user=create_user, is_enabled=True).exists()

    @pytest.mark.django_db
    def test_wrong_code_does_not_enable(self, session_client, create_user):
        setup = session_client.post(reverse("mfa-totp-setup"), {}, format="json")
        response = session_client.post(
            reverse("mfa-totp-verify"),
            {"device_id": setup.data["device_id"], "code": "000000"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        device = MFADevice.objects.get(id=setup.data["device_id"])
        assert device.is_confirmed is False
        assert not UserMFA.objects.filter(user=create_user, is_enabled=True).exists()

    @pytest.mark.django_db
    def test_correct_code_enables_and_issues_recovery_codes(self, session_client, create_user):
        setup = session_client.post(reverse("mfa-totp-setup"), {}, format="json")
        code = pyotp.TOTP(setup.data["secret"]).now()
        response = session_client.post(
            reverse("mfa-totp-verify"),
            {"device_id": setup.data["device_id"], "code": code},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        # First factor → recovery codes issued exactly once.
        assert len(response.data["recovery_codes"]) == mfa_utils.RECOVERY_CODE_COUNT
        device = MFADevice.objects.get(id=setup.data["device_id"])
        assert device.is_confirmed is True
        assert UserMFA.objects.get(user=create_user).is_enabled is True
        # DB stores only hashes.
        stored = MFARecoveryCode.objects.filter(user=create_user)
        assert stored.count() == mfa_utils.RECOVERY_CODE_COUNT
        for rc in stored:
            assert rc.code_hash not in response.data["recovery_codes"]


@pytest.mark.contract
class TestStepUp:
    @pytest.mark.django_db
    def test_step_up_with_password(self, session_client, create_user):
        response = session_client.post(
            reverse("mfa-step-up"), {"password": "test-password"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert UserMFA.objects.get(user=create_user).step_up_at is not None

    @pytest.mark.django_db
    def test_step_up_wrong_password(self, session_client, create_user):
        response = session_client.post(
            reverse("mfa-step-up"), {"password": "wrong"}, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.contract
class TestRecoveryCodesRegenerate:
    @pytest.mark.django_db
    def test_requires_step_up(self, session_client, create_user):
        UserMFA.objects.create(user=create_user, is_enabled=True)
        response = session_client.post(reverse("mfa-recovery-codes-regenerate"), {}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data["error_code"] == AUTHENTICATION_ERROR_CODES["MFA_STEP_UP_REQUIRED"]

    @pytest.mark.django_db
    def test_regenerate_invalidates_old_set(self, session_client, create_user):
        UserMFA.objects.create(user=create_user, is_enabled=True)
        # Seed an old set.
        MFARecoveryCode.objects.create(
            user=create_user, code_hash=mfa_utils.hash_recovery_code("OLDAA-OLDBB")
        )
        _set_step_up(create_user)
        response = session_client.post(reverse("mfa-recovery-codes-regenerate"), {}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["recovery_codes"]) == mfa_utils.RECOVERY_CODE_COUNT
        # The old code is gone (replaced) — exactly the new set remains.
        assert MFARecoveryCode.objects.filter(user=create_user).count() == mfa_utils.RECOVERY_CODE_COUNT
        for rc in MFARecoveryCode.objects.filter(user=create_user):
            assert not mfa_utils.verify_recovery_code("OLDAA-OLDBB", rc.code_hash)


@pytest.mark.contract
class TestDeviceManagement:
    @pytest.mark.django_db
    def test_rename_device(self, session_client, create_user):
        device = MFADevice.objects.create(
            user=create_user, device_type=MFADevice.DeviceType.TOTP, is_confirmed=True, name="old"
        )
        response = session_client.patch(
            reverse("mfa-device-detail", args=[device.id]), {"name": "new name"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        device.refresh_from_db()
        assert device.name == "new name"

    @pytest.mark.django_db
    def test_delete_requires_step_up(self, session_client, create_user):
        device = MFADevice.objects.create(
            user=create_user, device_type=MFADevice.DeviceType.TOTP, is_confirmed=True
        )
        response = session_client.delete(reverse("mfa-device-detail", args=[device.id]))
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert MFADevice.all_objects.filter(id=device.id).exists()

    @pytest.mark.django_db
    def test_delete_with_step_up_hard_deletes(self, session_client, create_user):
        UserMFA.objects.create(user=create_user, is_enabled=True)
        device = MFADevice.objects.create(
            user=create_user, device_type=MFADevice.DeviceType.TOTP, is_confirmed=True
        )
        _set_step_up(create_user)
        response = session_client.delete(reverse("mfa-device-detail", args=[device.id]))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not MFADevice.all_objects.filter(id=device.id).exists()
