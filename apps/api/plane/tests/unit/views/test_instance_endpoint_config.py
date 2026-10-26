# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import os
from unittest.mock import Mock, patch

from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory

from plane.license.api.views.instance import InstanceEndpoint
from plane.license.models import Instance
from plane.db.models import Workspace


def test_instance_endpoint_returns_sentry_and_posthog_configuration(monkeypatch):
    monkeypatch.setenv("ENABLE_SENTRY_SYNC", "1")
    monkeypatch.setenv("SENTRY_CLIENT_ID", "sentry-client")
    monkeypatch.setenv("POSTHOG_API_KEY", "posthog-key")
    monkeypatch.setenv("POSTHOG_HOST", "https://posthog.example")

    request = RequestFactory().get("/api/instance/")
    request.user = AnonymousUser()

    def configuration_values(keys):
        return tuple(os.environ.get(item["key"], item.get("default")) for item in keys)

    with (
        patch.object(Instance.objects, "first", return_value=object()),
        patch.object(Workspace.objects, "count", return_value=0),
        patch("plane.license.api.views.instance.InstanceSerializer", return_value=Mock(data={})),
        patch("plane.license.api.views.instance.get_configuration_value", side_effect=configuration_values),
        patch("plane.utils.cache.cache.get", return_value=None),
        patch("plane.utils.cache.cache.set"),
    ):
        response = InstanceEndpoint().get(request)

    assert response.data["config"]["is_sentry_enabled"] is True
    assert response.data["config"]["sentry_client_id"] == "sentry-client"
    assert response.data["config"]["has_posthog_configured"] is True
    assert response.data["config"]["posthog_host"] == "https://posthog.example"
