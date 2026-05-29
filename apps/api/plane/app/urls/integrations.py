# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.integrations.github.views import (
    GithubRepositoriesEndpoint,
    GithubRepositorySyncEndpoint,
    IntegrationListEndpoint,
    WorkspaceIntegrationDeleteEndpoint,
    WorkspaceIntegrationInstallEndpoint,
    WorkspaceIntegrationListEndpoint,
)
from plane.integrations.sentry.views import (
    SentryConnectionEndpoint,
    SentryInstallEndpoint,
    SentryIssueLinkEndpoint,
    SentryOAuthCallbackEndpoint,
    SentryProjectMappingDetailEndpoint,
    SentryProjectMappingEndpoint,
)

urlpatterns = [
    path("integrations/", IntegrationListEndpoint.as_view(), name="integrations"),
    path(
        "workspaces/<str:slug>/workspace-integrations/",
        WorkspaceIntegrationListEndpoint.as_view(),
        name="workspace-integrations",
    ),
    path(
        "workspaces/<str:slug>/workspace-integrations/<str:provider>/",
        WorkspaceIntegrationInstallEndpoint.as_view(),
        name="workspace-integration-install",
    ),
    path(
        "workspaces/<str:slug>/workspace-integrations/<uuid:workspace_integration_id>/provider/",
        WorkspaceIntegrationDeleteEndpoint.as_view(),
        name="workspace-integration-delete",
    ),
    path(
        "workspaces/<str:slug>/workspace-integrations/<uuid:workspace_integration_id>/github-repositories/",
        GithubRepositoriesEndpoint.as_view(),
        name="github-repositories",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workspace-integrations/<uuid:workspace_integration_id>/github-repository-sync/",
        GithubRepositorySyncEndpoint.as_view(),
        name="github-repository-sync",
    ),
    path(
        "workspaces/<str:slug>/integrations/sentry/install/",
        SentryInstallEndpoint.as_view(),
        name="sentry-install",
    ),
    path(
        "workspaces/<str:slug>/integrations/sentry/callback/",
        SentryOAuthCallbackEndpoint.as_view(),
        name="sentry-callback",
    ),
    path(
        "workspaces/<str:slug>/integrations/sentry/",
        SentryConnectionEndpoint.as_view(),
        name="sentry-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/sentry/mappings/",
        SentryProjectMappingEndpoint.as_view(),
        name="sentry-mappings",
    ),
    path(
        "workspaces/<str:slug>/integrations/sentry/mappings/<uuid:mapping_id>/",
        SentryProjectMappingDetailEndpoint.as_view(),
        name="sentry-mapping-detail",
    ),
    path(
        "integrations/sentry/issues/<str:sentry_issue_id>/link/",
        SentryIssueLinkEndpoint.as_view(),
        name="sentry-issue-link",
    ),
]
