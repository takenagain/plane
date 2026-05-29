# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    PageViewSet,
    PageFavoriteViewSet,
    PagesDescriptionViewSet,
    PageVersionEndpoint,
    PageDuplicateEndpoint,
    WikiPageViewSet,
    WikiPagesDescriptionViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/wiki-pages/",
        WikiPageViewSet.as_view({"get": "list", "post": "create"}),
        name="wiki-pages",
    ),
    path(
        "workspaces/<str:slug>/wiki-pages/<uuid:page_id>/",
        WikiPageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="wiki-pages",
    ),
    path(
        "workspaces/<str:slug>/wiki-pages/<uuid:page_id>/archive/",
        WikiPageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="wiki-page-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/wiki-pages/<uuid:page_id>/description/",
        WikiPagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="wiki-page-description",
    ),
    path(
        "workspaces/<str:slug>/wiki-pages/<uuid:page_id>/lock/",
        WikiPageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="wiki-pages-lock-unlock",
    ),
    path(
        "workspaces/<str:slug>/wiki-pages/<uuid:page_id>/access/",
        WikiPageViewSet.as_view({"post": "access"}),
        name="wiki-pages-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages-summary/",
        PageViewSet.as_view({"get": "summary"}),
        name="project-pages-summary",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/",
        PageViewSet.as_view({"get": "list", "post": "create"}),
        name="project-pages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/",
        PageViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="project-pages",
    ),
    # favorite pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/favorite-pages/<uuid:page_id>/",
        PageFavoriteViewSet.as_view({"post": "create", "delete": "destroy"}),
        name="user-favorite-pages",
    ),
    # archived pages
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/archive/",
        PageViewSet.as_view({"post": "archive", "delete": "unarchive"}),
        name="project-page-archive-unarchive",
    ),
    # lock and unlock
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/lock/",
        PageViewSet.as_view({"post": "lock", "delete": "unlock"}),
        name="project-pages-lock-unlock",
    ),
    # private and public page
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/access/",
        PageViewSet.as_view({"post": "access"}),
        name="project-pages-access",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/description/",
        PagesDescriptionViewSet.as_view({"get": "retrieve", "patch": "partial_update"}),
        name="page-description",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/versions/<uuid:pk>/",
        PageVersionEndpoint.as_view(),
        name="page-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/pages/<uuid:page_id>/duplicate/",
        PageDuplicateEndpoint.as_view(),
        name="page-duplicate",
    ),
]
