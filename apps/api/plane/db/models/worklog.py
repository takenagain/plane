# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from plane.db.models.issue import Issue
from plane.db.models.project import ProjectBaseModel


class Worklog(ProjectBaseModel):
    """Tracks time logged against an issue by a user."""

    issue = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        related_name="issue_worklogs",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="worklogs",
    )
    description = models.TextField(
        verbose_name="Work Description",
        blank=True,
        default="",
    )
    duration = models.PositiveIntegerField(
        verbose_name="Duration (minutes)",
        validators=[MinValueValidator(1), MaxValueValidator(99999)],
        help_text="Time spent in minutes",
    )
    logged_at = models.DateField(
        verbose_name="Date Logged",
        help_text="The date the work was performed",
    )

    class Meta:
        verbose_name = "Worklog"
        verbose_name_plural = "Worklogs"
        db_table = "worklogs"
        ordering = ("-logged_at", "-created_at")
        indexes = [
            models.Index(
                fields=["issue", "-logged_at"],
                name="worklogs_issue_logged_at",
            ),
        ]

    def __str__(self):
        return f"{self.actor} — {self.duration}m on {self.issue}"
