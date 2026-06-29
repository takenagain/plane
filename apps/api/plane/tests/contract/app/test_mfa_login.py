# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Login-flow partial-auth gate + challenge tests (R10, R11, R13)."""

import json
import uuid

import pyotp
import pytest
from django.core.cache import cache
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from plane.authentication.utils import mfa as mfa_utils
from plane.db.models import MFADevice, MFARecoveryCode, User, UserMFA
from plane.license.models import Instance


@pytest.fixture
def setup_instance(db):
    instance, _ = Instance.objects.update_or_create(
        id=uuid.uuid4() if not Instance.objects.exists() else Instance.objects.first().id,
        defaults={
            "instance_name": "Test Instance",
            "instance_id": str(uuid.uuid4()),
            "current_version": "1.0.0",
            "domain": "http://localhost:8000",
            "last_checked_at": timezone.now(),
            "is_setup_done": True,
        },
    )
    return instance


@pytest.fixture
def django_client():
    return Client(HTTP_USER_AGENT="Mozilla/5.0")


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def mfa_user(db):
    """A user with a confirmed TOTP factor; returns (user, secret)."""
    user = User.objects.create(email="mfa-user@plane.so", username="mfa-user@plane.so")
    user.set_password("user@123")
    user.save()
    secret = mfa_utils.generate_totp_secret()
    MFADevice.objects.create(
        user=user,
        device_type=MFADevice.DeviceType.TOTP,
        is_confirmed=True,
        secret_encrypted=mfa_utils.encrypt_secret(secret),
    )
    UserMFA.objects.create(user=user, is_enabled=True)
    return user, secret


@pytest.mark.contract
class TestLoginGate:
    @pytest.mark.django_db
    def test_password_ok_sets_pending_not_session(self, django_client, mfa_user, setup_instance):
        user, _secret = mfa_user
        response = django_client.post(
            reverse("sign-in"),
            {"email": "mfa-user@plane.so", "password": "user@123"},
            follow=False,
        )
        assert response.status_code == 302
        # Marker tells the SPA to switch to the challenge step.
        assert "mfa=required" in response.url
        # Genuinely NOT logged in yet.
        assert "_auth_user_id" not in django_client.session
        assert django_client.session.get("mfa_pending_user_id") == str(user.id)

    @pytest.mark.django_db
    def test_totp_verify_finalizes_session(self, django_client, mfa_user, setup_instance):
        user, secret = mfa_user
        django_client.post(
            reverse("sign-in"),
            {"email": "mfa-user@plane.so", "password": "user@123"},
            follow=False,
        )
        assert "_auth_user_id" not in django_client.session

        code = pyotp.TOTP(secret).now()
        response = django_client.post(
            reverse("mfa-verify"),
            data=json.dumps({"code": code}),
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["success"] is True
        # Full session established only after the second factor.
        assert "_auth_user_id" in django_client.session
        assert django_client.session.get("mfa_pending_user_id") is None

    @pytest.mark.django_db
    def test_invalid_totp_rejected(self, django_client, mfa_user, setup_instance):
        django_client.post(
            reverse("sign-in"),
            {"email": "mfa-user@plane.so", "password": "user@123"},
            follow=False,
        )
        response = django_client.post(
            reverse("mfa-verify"),
            data=json.dumps({"code": "000000"}),
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "_auth_user_id" not in django_client.session

    @pytest.mark.django_db
    def test_verify_without_pending_state(self, django_client, mfa_user, setup_instance):
        # No prior sign-in → no pending state → unauthorized.
        response = django_client.post(
            reverse("mfa-verify"),
            data=json.dumps({"code": "000000"}),
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.django_db
    def test_recovery_code_login(self, django_client, mfa_user, setup_instance):
        user, _secret = mfa_user
        plaintext = "ZZZZZ-YYYYY"
        MFARecoveryCode.objects.create(user=user, code_hash=mfa_utils.hash_recovery_code(plaintext))

        django_client.post(
            reverse("sign-in"),
            {"email": "mfa-user@plane.so", "password": "user@123"},
            follow=False,
        )
        response = django_client.post(
            reverse("mfa-verify"),
            data=json.dumps({"recovery_code": plaintext}),
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "_auth_user_id" in django_client.session
        # Single-use: the code is now consumed.
        rc = MFARecoveryCode.objects.get(user=user)
        assert rc.used_at is not None

    @pytest.mark.django_db
    def test_recovery_code_reuse_rejected(self, django_client, mfa_user, setup_instance):
        user, _secret = mfa_user
        plaintext = "ZZZZZ-YYYYY"
        MFARecoveryCode.objects.create(
            user=user, code_hash=mfa_utils.hash_recovery_code(plaintext), used_at=timezone.now()
        )
        django_client.post(
            reverse("sign-in"),
            {"email": "mfa-user@plane.so", "password": "user@123"},
            follow=False,
        )
        response = django_client.post(
            reverse("mfa-verify"),
            data=json.dumps({"recovery_code": plaintext}),
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_lockdown_rejects_totp(self, django_client, mfa_user, setup_instance):
        user, secret = mfa_user
        # Under FIDO2 lockdown only hardware keys are accepted at login.
        UserMFA.objects.filter(user=user).update(is_enforced=True)
        django_client.post(
            reverse("sign-in"),
            {"email": "mfa-user@plane.so", "password": "user@123"},
            follow=False,
        )
        response = django_client.post(
            reverse("mfa-verify"),
            data=json.dumps({"code": pyotp.TOTP(secret).now()}),
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "_auth_user_id" not in django_client.session

    @pytest.mark.django_db
    def test_user_without_mfa_logs_in_directly(self, django_client, db, setup_instance):
        user = User.objects.create(email="plain@plane.so", username="plain@plane.so")
        user.set_password("user@123")
        user.save()
        response = django_client.post(
            reverse("sign-in"),
            {"email": "plain@plane.so", "password": "user@123"},
            follow=False,
        )
        assert response.status_code == 302
        assert "mfa=required" not in response.url
        assert "_auth_user_id" in django_client.session
