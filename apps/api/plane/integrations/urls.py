# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.integrations.github.webhooks import GithubWebhookEndpoint

urlpatterns = [
    path("github/", GithubWebhookEndpoint.as_view(), name="github-webhook"),
]
