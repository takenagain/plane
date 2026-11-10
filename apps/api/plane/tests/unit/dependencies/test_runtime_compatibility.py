# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Behavior contracts for the explicitly overridden runtime dependencies.

Exercise the consuming packages, rather than just importing their dependencies:
Beat's ORM and cron descriptions, Celery's DST/ETA handling, Plane's filters,
and Scout's wrapt-based instrumentation must continue to work together.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from celery.utils.time import make_aware, maybe_iso8601
from django_celery_beat.models import CrontabSchedule, PeriodicTask
from django_celery_beat.schedulers import DatabaseScheduler
from freezegun import freeze_time
from scout_apm.core.context import context
from scout_apm.core.stacktracer import trace_method
from scout_apm.core.tracked_request import TrackedRequest
from scout_apm.instruments.redis import wrapped_execute_command

from plane.celery import app
from plane.utils.filters.converters import LegacyToRichFiltersConverter
from plane.utils.issue_recurrence import _advance_recurrence_datetime

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("minute", "hour", "day_of_week", "description"),
    [
        ("*/5", "*", "*", "Every 5 minutes UTC"),
        ("15", "1", "*", "At 01:15 AM UTC"),
        ("0", "9", "1-5", "At 09:00 AM, only on Monday, Tuesday, Wednesday, Thursday, and Friday UTC"),
    ],
)
def test_beat_cron_description(monkeypatch, minute, hour, day_of_week, description):
    # cron-descriptor 2 uses the active locale; keep this contract independent
    # of the developer machine or container locale.
    monkeypatch.setattr("locale.getlocale", lambda: ("en_US", "UTF-8"))
    schedule = CrontabSchedule(minute=minute, hour=hour, day_of_week=day_of_week, timezone=ZoneInfo("UTC"))
    assert schedule.human_readable == description


@pytest.mark.parametrize("day", ["2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25"])
def test_beat_cron_respects_local_hour_across_dst(day):
    local_now = datetime.fromisoformat(f"{day}T09:00:00").replace(tzinfo=ZoneInfo("Europe/London"))
    schedule = CrontabSchedule(minute="0", hour="9", timezone=ZoneInfo("Europe/London")).schedule
    schedule.nowfun = lambda: local_now
    due = schedule.is_due(local_now - timedelta(days=1))
    assert due.is_due is True
    assert 23 * 3600 <= due.next <= 25 * 3600
    schedule.nowfun = lambda: local_now - timedelta(minutes=1)
    assert schedule.is_due(local_now - timedelta(days=1)).is_due is False


@pytest.mark.django_db
@freeze_time("2026-11-09T12:00:00Z")
def test_database_scheduler_loads_and_advances_periodic_task():
    cron = CrontabSchedule.objects.create(minute="*/5", timezone=ZoneInfo("UTC"))
    task = PeriodicTask.objects.create(
        name="runtime-compatibility",
        task="plane.bgtasks.email_notification_task.stack_email_notification",
        crontab=cron,
        last_run_at=datetime(2026, 11, 9, 11, 55, tzinfo=timezone.utc),
        kwargs='{"batch": 2}',
    )
    scheduler = DatabaseScheduler(app=app, lazy=True)
    entry = scheduler.all_as_schedule()[task.name]
    assert entry.kwargs == {"batch": 2}
    assert entry.options["headers"]["periodic_task_name"] == task.name
    assert entry.is_due().is_due is True
    advanced = next(entry)
    advanced.save()
    task.refresh_from_db()
    assert task.total_run_count == 1
    assert task.last_run_at == datetime(2026, 11, 9, 12, tzinfo=timezone.utc)
    assert advanced.is_due().is_due is False


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-11-09T12:30:00Z", datetime(2026, 11, 9, 12, 30, tzinfo=timezone.utc)),
        ("2026-11-09T14:30:00+02:00", datetime(2026, 11, 9, 12, 30, tzinfo=timezone.utc)),
    ],
)
def test_celery_eta_parser_preserves_instant(raw, expected):
    assert maybe_iso8601(raw) == expected


def test_celery_resolves_nonexistent_local_time():
    aware = make_aware(datetime(2026, 3, 8, 2, 30), ZoneInfo("America/New_York"))
    assert aware == datetime(2026, 3, 8, 3, 30, tzinfo=ZoneInfo("America/New_York"))
    assert aware.astimezone(timezone.utc) == datetime(2026, 3, 8, 7, 30, tzinfo=timezone.utc)


@pytest.mark.parametrize("raw", ["2026-11-09", "November 9, 2026", "2026-11-09T12:30:00+02:00"])
def test_plane_date_filters_accept_calendar_and_timestamp_input(raw):
    assert LegacyToRichFiltersConverter()._validate_date(raw) is True


@pytest.mark.parametrize("raw", ["not-a-date", "2026-02-30", ""])
def test_plane_date_filters_reject_invalid_input(raw):
    assert LegacyToRichFiltersConverter()._validate_date(raw) is False


@pytest.mark.parametrize(
    ("anchor", "pattern", "expected"),
    [
        (datetime(2026, 1, 31), "monthly", datetime(2026, 2, 28)),
        (datetime(2024, 2, 29), "yearly", datetime(2025, 2, 28)),
    ],
)
def test_issue_recurrence_preserves_month_end_and_leap_year(anchor, pattern, expected):
    assert _advance_recurrence_datetime(anchor, pattern) == expected


@pytest.mark.parametrize("raises", [False, True])
def test_scout_wrapt_preserves_bound_method_and_closes_span(raises):
    class Operation:
        def execute(self, command, *, value):
            if raises:
                raise ValueError("instrumented failure")
            return command, value

    Operation.execute = wrapped_execute_command(Operation.execute)
    tracked = TrackedRequest.instance()
    try:
        if raises:
            with pytest.raises(ValueError, match="instrumented failure"):
                Operation().execute("GET", value=42)
        else:
            assert Operation().execute("GET", value=42) == ("GET", 42)
        assert tracked.active_spans == []
        assert tracked.complete_spans[-1].operation == "Redis/GET"
    finally:
        context.clear_tracked_request(tracked)


def test_scout_trace_method_retains_tags_and_return_value():
    class Operation:
        def execute(self, value):
            return value + 1

    @trace_method(Operation, "execute")
    def operation_info(instance, value):
        assert isinstance(instance, Operation)
        return "Custom", {"name": "execute", "value": value}

    tracked = TrackedRequest.instance()
    try:
        assert Operation().execute(41) == 42
        span = tracked.complete_spans[-1]
        assert span.operation == "Custom/execute"
        assert span.tags["value"] == 41
        assert tracked.active_spans == []
    finally:
        context.clear_tracked_request(tracked)


def test_scout_wrapt_instruments_django_template_rendering(monkeypatch):
    from django.template import Context, Engine, Template
    from django.template.loader_tags import BlockNode
    from scout_apm.django.instruments import template as template_instrument

    # Scout installs process-wide wrappers. Restore the original methods and
    # installation flag after exercising the real installer.
    monkeypatch.setattr(template_instrument, "templates_instrumented", False)
    monkeypatch.setattr(Template, "__init__", Template.__init__)
    monkeypatch.setattr(Template, "render", Template.render)
    monkeypatch.setattr(BlockNode, "render", BlockNode.render)
    template_instrument.ensure_templates_instrumented()
    tracked = TrackedRequest.instance()
    try:
        with tracked.span(operation="Test/Request"):
            template = Template("{% block content %}Hello {{ name }}{% endblock %}", engine=Engine(), name="greeting")
            assert template.render(Context({"name": "Plane"})) == "Hello Plane"
        operations = {span.operation for span in tracked.complete_spans}
        assert "Template/Compile/<Unknown Template>" in operations
        assert "Template/Render/greeting" in operations
        assert "Block/Render/content" in operations
        assert tracked.active_spans == []
    finally:
        context.clear_tracked_request(tracked)


@pytest.mark.django_db
def test_scout_django_sql_hook_records_query_and_preserves_result():
    from django.db import connection
    from scout_apm.django.instruments.sql import db_execute_hook

    tracked = TrackedRequest.instance()
    try:
        with tracked.span(operation="Test/Request"):
            with connection.execute_wrapper(db_execute_hook), connection.cursor() as cursor:
                cursor.execute("SELECT %s::integer", [42])
                assert cursor.fetchone() == (42,)
        sql_span = next(span for span in tracked.complete_spans if span.operation == "SQL/Query")
        assert sql_span.tags["db.statement"] == "SELECT %s::integer"
        assert tracked.active_spans == []
    finally:
        context.clear_tracked_request(tracked)


@pytest.mark.parametrize(
    "raw",
    ["2026-11-09T12:30:00Z", "2026-11-09T14:30:00+02:00", "Mon, 09 Nov 2026 12:30:00 GMT"],
)
def test_botocore_parses_s3_and_http_timestamps(raw):
    from botocore.utils import parse_timestamp

    assert parse_timestamp(raw) == datetime(2026, 11, 9, 12, 30, tzinfo=timezone.utc)


@freeze_time("2026-11-09T12:00:00Z")
def test_botocore_refreshes_credentials_using_parsed_expiration():
    from botocore.credentials import RefreshableCredentials

    metadata = {
        "access_key": "initial-access",
        "secret_key": "test-secret",
        "token": "test-token",
        "expiry_time": "2026-11-09T13:00:00Z",
    }
    credentials = RefreshableCredentials.create_from_metadata(
        metadata=metadata,
        refresh_using=lambda: {**metadata, "access_key": "refreshed-access", "expiry_time": "2026-11-09T14:00:00Z"},
        method="compatibility-test",
    )
    assert credentials.get_frozen_credentials().access_key == "initial-access"
    with freeze_time("2026-11-09T13:01:00Z"):
        refreshed = credentials.get_frozen_credentials()
        assert refreshed.access_key == "refreshed-access"
        assert refreshed.token == "test-token"


@freeze_time("2026-11-09T12:00:00Z")
def test_botocore_presigns_s3_download_with_expiring_credentials():
    from urllib.parse import parse_qs, urlparse

    import boto3
    from botocore.config import Config

    client = boto3.client(
        "s3",
        aws_access_key_id="compatibility-access",
        aws_secret_access_key="compatibility-secret",
        aws_session_token="compatibility-token",
        region_name="us-east-1",
        endpoint_url="http://s3.test.invalid",
        config=Config(signature_version="s3v4"),
    )
    url = client.generate_presigned_url("get_object", Params={"Bucket": "uploads", "Key": "proof.txt"}, ExpiresIn=60)
    query = parse_qs(urlparse(url).query)
    assert urlparse(url).path == "/uploads/proof.txt"
    assert query["X-Amz-Date"] == ["20261109T120000Z"]
    assert query["X-Amz-Expires"] == ["60"]
    assert query["X-Amz-Security-Token"] == ["compatibility-token"]
    assert "X-Amz-Signature" in query
