from django.db import models

from plane.db.models import BaseModel
from plane.db.models.project import ProjectBaseModel


class SentryWorkspaceConnection(BaseModel):
    workspace = models.OneToOneField(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="sentry_connection",
    )
    sentry_org_slug = models.CharField(max_length=255)
    access_token_encrypted = models.TextField(blank=True, default="")
    refresh_token_encrypted = models.TextField(blank=True, default="")
    webhook_secret = models.CharField(max_length=255, blank=True, default="")
    metadata = models.JSONField(default=dict)

    class Meta:
        db_table = "sentry_workspace_connections"
        verbose_name = "Sentry Workspace Connection"
        verbose_name_plural = "Sentry Workspace Connections"

    def __str__(self):
        return f"{self.workspace.slug} <-> {self.sentry_org_slug}"


class SentryProjectMapping(ProjectBaseModel):
    sentry_project_slug = models.CharField(max_length=255)
    unresolved_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        related_name="sentry_unresolved_mappings",
    )
    resolved_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        related_name="sentry_resolved_mappings",
    )

    class Meta:
        db_table = "sentry_project_mappings"
        unique_together = ["project", "sentry_project_slug", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "sentry_project_slug"],
                condition=models.Q(deleted_at__isnull=True),
                name="sentry_project_mapping_unique_project_slug",
            )
        ]
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.sentry_project_slug} -> {self.project.identifier}"


class SentryIssueLink(ProjectBaseModel):
    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="sentry_link")
    sentry_issue_id = models.CharField(max_length=255, db_index=True)
    sentry_project_slug = models.CharField(max_length=255)
    mapping = models.ForeignKey(
        "db.SentryProjectMapping",
        on_delete=models.CASCADE,
        related_name="issue_links",
    )

    class Meta:
        db_table = "sentry_issue_links"
        ordering = ("-created_at",)

    def __str__(self):
        return f"sentry:{self.sentry_issue_id} -> {self.issue_id}"
