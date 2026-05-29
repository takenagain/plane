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
]
