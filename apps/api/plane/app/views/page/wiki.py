import json
from datetime import datetime

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Exists, OuterRef, Q, UUIDField, Value
from django.db.models.functions import Coalesce
from django.http import StreamingHttpResponse

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE
from plane.app.permissions.wiki_page import WikiPagePermission
from plane.app.serializers import PageBinaryUpdateSerializer
from plane.app.serializers.wiki_page import WikiPageDetailSerializer, WikiPageSerializer
from plane.bgtasks.page_transaction_task import page_transaction
from plane.bgtasks.page_version_task import track_page_version
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.db.models import Page, PageLog, UserFavorite, UserRecentVisit, WorkspaceMember
from plane.utils.error_codes import ERROR_CODES

from ..base import BaseViewSet
from .base import unarchive_archive_page_and_descendants


class WikiPageViewSet(BaseViewSet):
    serializer_class = WikiPageSerializer
    model = Page
    permission_classes = [WikiPagePermission]

    def get_queryset(self):
        from plane.db.models import UserFavorite

        subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_type="page",
            entity_identifier=OuterRef("pk"),
            workspace__slug=self.kwargs.get("slug"),
            project__isnull=True,
        )
        return (
            Page.objects.filter(workspace__slug=self.kwargs.get("slug"), is_global=True)
            .filter(parent__isnull=True)
            .filter(Q(owned_by=self.request.user) | Q(access=0))
            .select_related("workspace", "owned_by")
            .annotate(is_favorite=Exists(subquery))
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                project_ids=Value([], output_field=ArrayField(UUIDField())),
            )
            .order_by("-is_favorite", "-created_at")
            .distinct()
        )

    def list(self, request, slug):
        queryset = self.get_queryset()
        pages = WikiPageSerializer(queryset, many=True).data
        return Response(pages, status=status.HTTP_200_OK)

    def create(self, request, slug):
        serializer = WikiPageSerializer(
            data=request.data,
            context={
                "workspace_slug": slug,
                "owned_by_id": request.user.id,
                "description_json": request.data.get("description_json", {}),
                "description_binary": request.data.get("description_binary", None),
                "description_html": request.data.get("description_html", "<p></p>"),
            },
        )

        if serializer.is_valid():
            serializer.save()
            page_transaction.delay(
                new_description_html=request.data.get("description_html", "<p></p>"),
                old_description_html=None,
                page_id=serializer.data["id"],
            )
            page = self.get_queryset().get(pk=serializer.data["id"])
            return Response(WikiPageDetailSerializer(page).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, slug, page_id=None):
        page = (
            Page.objects.filter(pk=page_id, workspace__slug=slug, is_global=True)
            .filter(Q(owned_by=request.user) | Q(access=0))
            .select_related("workspace", "owned_by")
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "page_labels__label_id",
                        distinct=True,
                        filter=~Q(page_labels__label_id__isnull=True),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                project_ids=Value([], output_field=ArrayField(UUIDField())),
            )
            .first()
        )

        track_visit = request.query_params.get("track_visit", "true").lower() == "true"

        if page is None:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

        issue_ids = PageLog.objects.filter(page_id=page_id, entity_name="issue").values_list(
            "entity_identifier", flat=True
        )
        data = WikiPageDetailSerializer(page).data
        data["issue_ids"] = issue_ids
        if track_visit:
            recent_visited_task.delay(
                slug=slug,
                entity_name="page",
                entity_identifier=page_id,
                user_id=request.user.id,
                project_id=None,
            )
        return Response(data, status=status.HTTP_200_OK)

    def partial_update(self, request, slug, page_id):
        try:
            page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

            if page.is_locked:
                return Response({"error": "Page is locked"}, status=status.HTTP_400_BAD_REQUEST)

            parent = request.data.get("parent", None)
            if parent:
                Page.objects.get(
                    pk=parent,
                    workspace__slug=slug,
                    is_global=True,
                )

            if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
                return Response(
                    {"error": "Access cannot be updated since this page is owned by someone else"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer = WikiPageDetailSerializer(page, data=request.data, partial=True)
            page_description = page.description_html
            if serializer.is_valid():
                serializer.save()
                if request.data.get("description_html"):
                    page_transaction.delay(
                        new_description_html=request.data.get("description_html", "<p></p>"),
                        old_description_html=page_description,
                        page_id=page_id,
                    )
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Page.DoesNotExist:
            return Response({"error": "Page not found"}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if page.archived_at is None:
            return Response(
                {"error": "The page should be archived before deleting"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_admin = WorkspaceMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()

        if page.owned_by_id != request.user.id and not is_admin:
            return Response(
                {"error": "Only admin or owner can delete the page"},
                status=status.HTTP_403_FORBIDDEN,
            )

        Page.objects.filter(parent_id=page_id, workspace__slug=slug, is_global=True).update(parent=None)

        page.delete()
        UserFavorite.objects.filter(
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_type="page",
            project__isnull=True,
        ).delete()
        UserRecentVisit.objects.filter(
            workspace__slug=slug,
            entity_identifier=page_id,
            entity_name="page",
        ).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def archive(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if (
            WorkspaceMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                is_active=True,
                role__lte=ROLE.MEMBER.value,
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        UserFavorite.objects.filter(
            entity_type="page",
            entity_identifier=page_id,
            workspace__slug=slug,
            project__isnull=True,
        ).delete()

        unarchive_archive_page_and_descendants(page_id, datetime.now())
        return Response({"archived_at": str(datetime.now())}, status=status.HTTP_200_OK)

    def unarchive(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if (
            WorkspaceMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                is_active=True,
                role__lte=ROLE.MEMBER.value,
            ).exists()
            and request.user.id != page.owned_by_id
        ):
            return Response(
                {"error": "Only the owner or admin can un archive the page"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.parent_id and page.parent.archived_at:
            page.parent = None
            page.save(update_fields=["parent"])

        unarchive_archive_page_and_descendants(page_id, None)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def lock(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)
        page.is_locked = True
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def unlock(self, request, slug, page_id):
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)
        page.is_locked = False
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def access(self, request, slug, page_id):
        access = request.data.get("access", 0)
        page = Page.objects.get(pk=page_id, workspace__slug=slug, is_global=True)

        if page.access != request.data.get("access", page.access) and page.owned_by_id != request.user.id:
            return Response(
                {"error": "Access cannot be updated since this page is owned by someone else"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        page.access = access
        page.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WikiPagesDescriptionViewSet(BaseViewSet):
    permission_classes = [WikiPagePermission]

    def retrieve(self, request, slug, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            is_global=True,
        )
        binary_data = page.description_binary

        def stream_data():
            if binary_data:
                yield binary_data
            else:
                yield b""

        response = StreamingHttpResponse(stream_data(), content_type="application/octet-stream")
        response["Content-Disposition"] = 'attachment; filename="page_description.bin"'
        return response

    def partial_update(self, request, slug, page_id):
        page = Page.objects.get(
            Q(owned_by=self.request.user) | Q(access=0),
            pk=page_id,
            workspace__slug=slug,
            is_global=True,
        )

        if page.is_locked:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_LOCKED"],
                    "error_message": "PAGE_LOCKED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if page.archived_at:
            return Response(
                {
                    "error_code": ERROR_CODES["PAGE_ARCHIVED"],
                    "error_message": "PAGE_ARCHIVED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_description_html = page.description_html
        existing_instance = json.dumps({"description_html": old_description_html}, cls=DjangoJSONEncoder)

        serializer = PageBinaryUpdateSerializer(page, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            if request.data.get("description_html"):
                page_transaction.delay(
                    new_description_html=request.data.get("description_html", "<p></p>"),
                    old_description_html=old_description_html,
                    page_id=page_id,
                )
            track_page_version.delay(
                page_id=page_id,
                existing_instance=existing_instance,
                user_id=request.user.id,
            )
            return Response({"message": "Updated successfully"})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
