import json
import secrets

from django.conf import settings
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Issue, Project, SentryProjectMapping, SentryWorkspaceConnection, Workspace
from plane.integrations.sentry.config import is_sentry_sync_enabled
from plane.integrations.sentry.oauth import (
    build_authorization_url,
    exchange_code_for_token,
    fetch_org_slug,
    generate_oauth_state,
)
from plane.integrations.sentry.serializers import (
    SentryConnectionSerializer,
    SentryIssueLinkSerializer,
    SentryProjectMappingSerializer,
)
from plane.integrations.sentry.sync import link_sentry_issue_to_plane_issue, store_connection_tokens
from plane.integrations.sentry.webhooks import process_sentry_webhook


class SentryInstallEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        if not is_sentry_sync_enabled():
            return Response({"error": "Sentry sync is not enabled"}, status=status.HTTP_400_BAD_REQUEST)

        redirect_uri = self._callback_url(request, slug)
        state = generate_oauth_state(slug)
        request.session[f"sentry_oauth_state_{slug}"] = state
        auth_url = build_authorization_url(redirect_uri=redirect_uri, state=state)
        return Response({"auth_url": auth_url}, status=status.HTTP_200_OK)

    def _callback_url(self, request, slug: str) -> str:
        scheme = "https" if request.is_secure() else "http"
        return f"{scheme}://{request.get_host()}/api/workspaces/{slug}/integrations/sentry/callback/"


class SentryOAuthCallbackEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        if not is_sentry_sync_enabled():
            return Response({"error": "Sentry sync is not enabled"}, status=status.HTTP_400_BAD_REQUEST)

        code = request.GET.get("code")
        state = request.GET.get("state")
        session_state = request.session.pop(f"sentry_oauth_state_{slug}", None)
        if not code or not state or state != session_state:
            return Response({"error": "Invalid OAuth state"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = get_object_or_404(Workspace, slug=slug)
        redirect_uri = SentryInstallEndpoint()._callback_url(request, slug)

        try:
            token_data = exchange_code_for_token(code=code, redirect_uri=redirect_uri)
        except Exception:
            return Response({"error": "Failed to exchange OAuth code"}, status=status.HTTP_400_BAD_REQUEST)

        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        org_slug = fetch_org_slug(access_token)

        connection, _ = SentryWorkspaceConnection.objects.get_or_create(
            workspace=workspace,
            defaults={
                "sentry_org_slug": org_slug,
                "webhook_secret": secrets.token_urlsafe(32),
            },
        )
        store_connection_tokens(
            connection=connection,
            access_token=access_token,
            refresh_token=refresh_token,
            org_slug=org_slug,
        )

        app_url = getattr(settings, "APP_BASE_URL", "") or ""
        return HttpResponseRedirect(f"{app_url}/{slug}/settings/integrations?sentry=connected")


class SentryConnectionEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug)
        connection = SentryWorkspaceConnection.objects.filter(workspace=workspace).first()
        if not connection:
            return Response({"connected": False}, status=status.HTTP_200_OK)
        serializer = SentryConnectionSerializer(connection)
        data = serializer.data
        data["connected"] = True
        data["webhook_url"] = self._webhook_url(request, slug)
        return Response(data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug)
        SentryWorkspaceConnection.objects.filter(workspace=workspace).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _webhook_url(self, request, slug: str) -> str:
        scheme = "https" if request.is_secure() else "http"
        return f"{scheme}://{request.get_host()}/api/webhooks/sentry/?workspace={slug}"


class SentryProjectMappingEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug)
        mappings = SentryProjectMapping.objects.filter(workspace=workspace, deleted_at__isnull=True)
        serializer = SentryProjectMappingSerializer(mappings, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug)
        project_id = request.data.get("project")
        unresolved_state_id = request.data.get("unresolved_state")
        resolved_state_id = request.data.get("resolved_state")
        sentry_project_slug = request.data.get("sentry_project_slug")

        if not all([project_id, unresolved_state_id, resolved_state_id, sentry_project_slug]):
            return Response(
                {"error": "project, sentry_project_slug, unresolved_state, and resolved_state are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        mapping = SentryProjectMapping.objects.create(
            workspace=workspace,
            project=project,
            sentry_project_slug=sentry_project_slug,
            unresolved_state_id=unresolved_state_id,
            resolved_state_id=resolved_state_id,
        )
        return Response(SentryProjectMappingSerializer(mapping).data, status=status.HTTP_201_CREATED)


class SentryProjectMappingDetailEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, mapping_id):
        workspace = get_object_or_404(Workspace, slug=slug)
        mapping = get_object_or_404(SentryProjectMapping, id=mapping_id, workspace=workspace)
        serializer = SentryProjectMappingSerializer(mapping, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, mapping_id):
        workspace = get_object_or_404(Workspace, slug=slug)
        mapping = get_object_or_404(SentryProjectMapping, id=mapping_id, workspace=workspace)
        mapping.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SentryWebhookEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        workspace_slug = request.GET.get("workspace") or request.query_params.get("workspace")
        if not workspace_slug:
            return Response({"error": "workspace query parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        body = request.body
        try:
            payload = json.loads(body.decode("utf-8") if body else "{}")
        except json.JSONDecodeError:
            return Response({"error": "Invalid JSON"}, status=status.HTTP_400_BAD_REQUEST)

        signature = request.headers.get("Sentry-Hook-Signature")
        try:
            result = process_sentry_webhook(
                workspace_slug=workspace_slug,
                body=body,
                payload=payload,
                signature=signature,
            )
        except PermissionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except LookupError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_201_CREATED)


class SentryIssueLinkEndpoint(BaseAPIView):
    """Link a Sentry issue to an existing Plane work item (Sentry UI extension)."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, sentry_issue_id):
        serializer = SentryIssueLinkSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        workspace = get_object_or_404(Workspace, slug=serializer.validated_data["workspace_slug"])
        connection = SentryWorkspaceConnection.objects.filter(workspace=workspace).first()
        if not connection:
            return Response({"error": "Sentry not connected"}, status=status.HTTP_400_BAD_REQUEST)

        project = get_object_or_404(Project, id=serializer.validated_data["project_id"], workspace=workspace)
        plane_issue = get_object_or_404(Issue, id=serializer.validated_data["issue_id"], project=project)

        sentry_project_slug = serializer.validated_data.get("sentry_project_slug") or (
            (serializer.validated_data.get("sentry_issue") or {}).get("project", {}).get("slug")
        )
        if not sentry_project_slug:
            return Response({"error": "sentry_project_slug is required"}, status=status.HTTP_400_BAD_REQUEST)

        mapping = get_object_or_404(
            SentryProjectMapping,
            workspace=workspace,
            project=project,
            sentry_project_slug=sentry_project_slug,
        )
        link = link_sentry_issue_to_plane_issue(
            mapping=mapping,
            connection=connection,
            sentry_issue_id=str(sentry_issue_id),
            plane_issue=plane_issue,
            issue_payload=serializer.validated_data.get("sentry_issue"),
        )
        return Response(
            {"issue_id": str(plane_issue.id), "link_id": str(link.id)},
            status=status.HTTP_200_OK,
        )
