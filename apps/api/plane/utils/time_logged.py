# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import (
    Case,
    F,
    IntegerField,
    OuterRef,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Cast, Coalesce, Extract, Greatest, Now

from plane.db.models import Worklog


def annotate_issue_queryset_with_time_logged(issue_queryset):
    """
    Annotate an Issue queryset with total logged minutes as `time_logged`.

    Includes:
    - Finalized worklogs: `duration > 0`
    - Active worklogs: `duration = 0` using elapsed minutes from `created_at`
    """

    elapsed_minutes = Greatest(
        Cast(Cast(Extract(Now() - F("created_at"), "epoch"), IntegerField()) / Value(60), IntegerField()),
        Value(0),
    )

    time_logged_subquery = (
        Worklog.objects.filter(issue_id=OuterRef("pk"), deleted_at__isnull=True)
        .values("issue_id")
        .annotate(
            total=Coalesce(
                Sum(
                    Case(
                        # Active tracking session: duration=0 sentinel
                        When(duration=0, then=elapsed_minutes),
                        default=F("duration"),
                        output_field=IntegerField(),
                    )
                ),
                Value(0),
            )
        )
        .values("total")
    )

    return issue_queryset.annotate(
        time_logged=Coalesce(Subquery(time_logged_subquery[:1]), Value(0), output_field=IntegerField())
    )
