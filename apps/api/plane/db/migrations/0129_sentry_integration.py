# Generated manually for Sentry integration MVP

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_sentry_integration(apps, schema_editor):
    Integration = apps.get_model("db", "Integration")
    Integration.objects.get_or_create(
        provider="sentry",
        defaults={
            "id": uuid.uuid4(),
            "title": "Sentry",
            "network": 2,
            "description": {"en": "Connect your Sentry workspace with Plane."},
            "author": "Plane",
            "verified": True,
            "metadata": {},
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0128_agent_model_defaults"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="SentryWorkspaceConnection",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("sentry_org_slug", models.CharField(max_length=255)),
                ("access_token_encrypted", models.TextField(blank=True, default="")),
                ("refresh_token_encrypted", models.TextField(blank=True, default="")),
                ("webhook_secret", models.CharField(blank=True, default="", max_length=255)),
                ("metadata", models.JSONField(default=dict)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sentry_connection",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Sentry Workspace Connection",
                "verbose_name_plural": "Sentry Workspace Connections",
                "db_table": "sentry_workspace_connections",
            },
        ),
        migrations.CreateModel(
            name="SentryProjectMapping",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("sentry_project_slug", models.CharField(max_length=255)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "resolved_state",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sentry_resolved_mappings",
                        to="db.state",
                    ),
                ),
                (
                    "unresolved_state",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sentry_unresolved_mappings",
                        to="db.state",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Sentry Project Mapping",
                "verbose_name_plural": "Sentry Project Mappings",
                "db_table": "sentry_project_mappings",
                "ordering": ("-created_at",),
            },
        ),
        migrations.CreateModel(
            name="SentryIssueLink",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("sentry_issue_id", models.CharField(db_index=True, max_length=255)),
                ("sentry_project_slug", models.CharField(max_length=255)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "issue",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="sentry_link",
                        to="db.issue",
                    ),
                ),
                (
                    "mapping",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="issue_links",
                        to="db.sentryprojectmapping",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Sentry Issue Link",
                "verbose_name_plural": "Sentry Issue Links",
                "db_table": "sentry_issue_links",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="sentryprojectmapping",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("project", "sentry_project_slug"),
                name="sentry_project_mapping_unique_project_slug",
            ),
        ),
        migrations.RunPython(seed_sentry_integration, migrations.RunPython.noop),
    ]
