from plane.db.models import Page, WorkspaceMember
from plane.app.permissions import ROLE

from rest_framework.permissions import BasePermission, SAFE_METHODS

ADMIN = ROLE.ADMIN.value
MEMBER = ROLE.MEMBER.value
GUEST = ROLE.GUEST.value


class WikiPagePermission(BasePermission):
    """Workspace-scoped page permissions for wiki (global) pages."""

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        slug = view.kwargs.get("slug")
        page_id = view.kwargs.get("page_id")
        user_id = request.user.id

        role = (
            WorkspaceMember.objects.filter(
                member=request.user,
                workspace__slug=slug,
                is_active=True,
            )
            .values_list("role", flat=True)
            .first()
        )

        if not role:
            return False

        if page_id:
            page = Page.objects.filter(id=page_id, workspace__slug=slug, is_global=True).first()
            if not page:
                return False

            if page.owned_by_id == user_id:
                return True

            if page.access == Page.PRIVATE_ACCESS:
                return False

        return self._has_action_access(request, role)

    def _has_action_access(self, request, role):
        method = request.method

        if method == "POST":
            return role in [ADMIN, MEMBER]

        if method in SAFE_METHODS:
            return role in [ADMIN, MEMBER, GUEST]

        if method in ["PUT", "PATCH"]:
            return role in [ADMIN, MEMBER]

        if method == "DELETE":
            return role in [ADMIN]

        return False
