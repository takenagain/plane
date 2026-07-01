# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Forced-setup enforcement middleware tests (R1, R6)."""

import uuid

import json

import pytest
from django.core.cache import cache
from django.test import Client
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES
from plane.db.models import User, UserMFA
from plane.license.models import Instance, InstanceConfiguration


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


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def enforce_mfa(monkeypatch):
    """Turn the forced-setup gate ON for this test (default is OFF in tests)."""
    monkeypatch.setenv("SKIP_ENV_VAR", "0")
    monkeypatch.setenv("MFA_ENABLED", "1")
    monkeypatch.setenv("MFA_ENFORCED", "1")
    InstanceConfiguration.objects.update_or_create(
        key="MFA_ENABLED", defaults={"value": "1", "category": "AUTHENTICATION"}
    )
    InstanceConfiguration.objects.update_or_create(
        key="MFA_ENFORCED", defaults={"value": "1", "category": "AUTHENTICATION"}
    )


@pytest.fixture
def enrolled_client(db, setup_instance):
    user = User.objects.create(email="enforced@plane.so", username="enforced@plane.so")
    user.set_password("user@123")
    user.save()
    client = Client(HTTP_USER_AGENT="Mozilla/5.0")
    response = client.post(
        reverse("sign-in"),
        {"email": "enforced@plane.so", "password": "user@123"},
        follow=False,
    )
    assert response.status_code == 302
    assert "_auth_user_id" in client.session
    return client, user


def _post_workspace(client):
    return client.post(
        reverse("workspace"),
        data=json.dumps({}),
        content_type="application/json",
        HTTP_ACCEPT="application/json",
    )


@pytest.mark.contract
@pytest.mark.usefixtures("enforce_mfa")
class TestMFAEnforcementMiddleware:
    @pytest.mark.django_db
    def test_unenrolled_user_blocked(self, enrolled_client):
        client, _user = enrolled_client
        # A non-allowlisted API route is blocked with the MFA setup error code.
        response = _post_workspace(client)
        assert response.status_code == 403
        assert response.json()["error_code"] == AUTHENTICATION_ERROR_CODES["MFA_SETUP_REQUIRED"]

    @pytest.mark.django_db
    def test_allowlisted_mfa_route_passes(self, enrolled_client):
        client, _user = enrolled_client
        # The MFA status endpoint must be reachable so the setup page can render.
        response = client.get(
            reverse("user-mfa"),
            HTTP_ACCEPT="application/json",
        )
        assert response.status_code == 200

    @pytest.mark.django_db
    def test_enrolled_user_passes(self, enrolled_client):
        client, user = enrolled_client
        UserMFA.objects.create(user=user, is_enabled=True)
        response = _post_workspace(client)
        # Middleware must not block; validation may still reject empty payload.
        assert response.status_code != 403 or response.json().get("error_code") != AUTHENTICATION_ERROR_CODES[
            "MFA_SETUP_REQUIRED"
        ]

    @pytest.mark.django_db
    def test_mfa_disabled_globally_disables_gate(self, enrolled_client, monkeypatch):
        client, _user = enrolled_client
        monkeypatch.setenv("MFA_ENABLED", "0")
        InstanceConfiguration.objects.update_or_create(
            key="MFA_ENABLED", defaults={"value": "0", "category": "AUTHENTICATION"}
        )
        response = _post_workspace(client)
        assert response.status_code != 403 or response.json().get("error_code") != AUTHENTICATION_ERROR_CODES[
            "MFA_SETUP_REQUIRED"
        ]

    @pytest.mark.django_db
    def test_enforcement_off_disables_gate(self, enrolled_client, monkeypatch):
        client, _user = enrolled_client
        monkeypatch.setenv("MFA_ENFORCED", "0")
        InstanceConfiguration.objects.update_or_create(
            key="MFA_ENFORCED", defaults={"value": "0", "category": "AUTHENTICATION"}
        )
        response = _post_workspace(client)
        assert response.status_code != 403 or response.json().get("error_code") != AUTHENTICATION_ERROR_CODES[
            "MFA_SETUP_REQUIRED"
        ]

    @pytest.mark.django_db
    def test_anonymous_request_passes(self, db):
        client = APIClient()
        # Anonymous → login flow handles it; middleware does not block.
        response = client.get(
            reverse("user-mfa"),
            HTTP_ACCEPT="application/json",
        )
        # 401/403 from auth, but NOT the MFA_SETUP_REQUIRED gate.
        if response.status_code == 403 and response.headers.get("content-type", "").startswith(
            "application/json"
        ):
            assert response.json().get("error_code") != AUTHENTICATION_ERROR_CODES["MFA_SETUP_REQUIRED"]
