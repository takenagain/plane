# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WebAuthn login-challenge flow tests (R12) — authenticator I/O mocked."""

import json
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from webauthn.helpers import bytes_to_base64url

from plane.db.models import MFADevice, User, UserMFA
from plane.license.models import Instance


@pytest.fixture
def setup_instance(db):
    instance_id = uuid.uuid4() if not Instance.objects.exists() else Instance.objects.first().id
    instance, _ = Instance.objects.update_or_create(
        id=instance_id,
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
def webauthn_user(db):
    user = User.objects.create(email="wa-user@plane.so", username="wa-user@plane.so")
    user.set_password("user@123")
    user.save()
    MFADevice.objects.create(
        user=user,
        device_type=MFADevice.DeviceType.WEBAUTHN,
        is_confirmed=True,
        name="YubiKey",
        credential_id=bytes_to_base64url(b"cred-1"),
        public_key=bytes_to_base64url(b"\x01\x02\x03"),
        sign_count=5,
        is_hardware_security_key=True,
        attachment="cross-platform",
        transports=["usb"],
    )
    UserMFA.objects.create(user=user, is_enabled=True)
    return user


def _sign_in(client):
    return client.post(
        reverse("sign-in"),
        {"email": "wa-user@plane.so", "password": "user@123"},
        follow=False,
    )


@pytest.mark.contract
class TestWebAuthnLogin:
    @pytest.mark.django_db
    def test_begin_returns_allow_credentials(self, django_client, webauthn_user, setup_instance):
        _sign_in(django_client)
        response = django_client.post(reverse("mfa-webauthn-authenticate-begin"))
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert "challenge" in body
        assert any(c["id"] == bytes_to_base64url(b"cred-1") for c in body.get("allowCredentials", []))

    @pytest.mark.django_db
    def test_complete_finalizes_and_updates_sign_count(
        self, django_client, webauthn_user, setup_instance
    ):
        _sign_in(django_client)
        django_client.post(reverse("mfa-webauthn-authenticate-begin"))

        with patch(
            "plane.authentication.utils.mfa.verify_authentication_response",
            return_value=SimpleNamespace(new_sign_count=6),
        ):
            response = django_client.post(
                reverse("mfa-webauthn-authenticate-complete"),
                data=json.dumps({"id": bytes_to_base64url(b"cred-1"), "response": {}}),
                content_type="application/json",
            )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["success"] is True
        assert "_auth_user_id" in django_client.session
        # Replay-protection counter advanced.
        device = MFADevice.objects.get(user=webauthn_user, credential_id=bytes_to_base64url(b"cred-1"))
        assert device.sign_count == 6

    @pytest.mark.django_db
    def test_complete_replay_rejected(self, django_client, webauthn_user, setup_instance):
        from webauthn.helpers.exceptions import InvalidAuthenticationResponse

        _sign_in(django_client)
        django_client.post(reverse("mfa-webauthn-authenticate-begin"))

        with patch(
            "plane.authentication.utils.mfa.verify_authentication_response",
            side_effect=InvalidAuthenticationResponse("counter did not increase"),
        ):
            response = django_client.post(
                reverse("mfa-webauthn-authenticate-complete"),
                data=json.dumps({"id": bytes_to_base64url(b"cred-1"), "response": {}}),
                content_type="application/json",
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "_auth_user_id" not in django_client.session

    @pytest.mark.django_db
    def test_complete_without_challenge_rejected(
        self, django_client, webauthn_user, setup_instance
    ):
        # No begin call → no stored challenge.
        _sign_in(django_client)
        response = django_client.post(
            reverse("mfa-webauthn-authenticate-complete"),
            data=json.dumps({"id": "cred-1", "response": {}}),
            content_type="application/json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
