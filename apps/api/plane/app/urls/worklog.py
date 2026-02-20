# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import WorklogViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/",
        WorklogViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-worklogs",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/total/",
        WorklogViewSet.as_view({"get": "total"}),
        name="issue-worklogs-total",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/<uuid:pk>/",
        WorklogViewSet.as_view(
            {
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="issue-worklog-detail",
    ),
]
