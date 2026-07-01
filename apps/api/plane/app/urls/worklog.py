from django.urls import path

from plane.app.views import WorklogViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/worklogs/active/",
        WorklogViewSet.as_view({"get": "active"}),
        name="workspace-active-worklog",
    ),
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
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/start/",
        WorklogViewSet.as_view({"post": "start"}),
        name="issue-worklogs-start",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/stop/",
        WorklogViewSet.as_view({"post": "stop"}),
        name="issue-worklogs-stop",
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
