# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from typing import Dict, Any, Tuple, Optional, List, Union


# Django imports
from django.db.models import (
    Count,
    F,
    QuerySet,
    Aggregate,
    Sum,
)
from django.db.models.functions import ExtractWeekDay
import calendar

from plane.db.models import Issue
from plane.db.models.worklog import Worklog
from rest_framework.exceptions import ValidationError


x_axis_mapper = {
    "STATES": "STATES",
    "STATE_GROUPS": "STATE_GROUPS",
    "LABELS": "LABELS",
    "ASSIGNEES": "ASSIGNEES",
    "ESTIMATE_POINTS": "ESTIMATE_POINTS",
    "CYCLES": "CYCLES",
    "MODULES": "MODULES",
    "PRIORITY": "PRIORITY",
    "START_DATE": "START_DATE",
    "TARGET_DATE": "TARGET_DATE",
    "CREATED_AT": "CREATED_AT",
    "COMPLETED_AT": "COMPLETED_AT",
    "CREATED_BY": "CREATED_BY",
    "LOGGED_DAY_OF_WEEK": "LOGGED_DAY_OF_WEEK",
    "WORK_ITEMS": "WORK_ITEMS",
}


def get_y_axis_filter(y_axis: str) -> Dict[str, Any]:
    filter_mapping = {
        "WORK_ITEM_COUNT": {"id": F("id")},
    }
    return filter_mapping.get(y_axis, {})


def get_x_axis_field() -> Dict[str, Tuple[str, str, Optional[Dict[str, Any]]]]:
    return {
        "STATES": ("state__id", "state__name", None),
        "STATE_GROUPS": ("state__group", "state__group", None),
        "LABELS": (
            "labels__id",
            "labels__name",
            {"label_issue__deleted_at__isnull": True},
        ),
        "ASSIGNEES": (
            "assignees__id",
            "assignees__display_name",
            {"issue_assignee__deleted_at__isnull": True},
        ),
        "ESTIMATE_POINTS": ("estimate_point__key", "estimate_point__value", None),
        "CYCLES": (
            "issue_cycle__cycle_id",
            "issue_cycle__cycle__name",
            {"issue_cycle__deleted_at__isnull": True},
        ),
        "MODULES": (
            "issue_module__module_id",
            "issue_module__module__name",
            {"issue_module__deleted_at__isnull": True},
        ),
        "PRIORITY": ("priority", "priority", None),
        "START_DATE": ("start_date", "start_date", None),
        "TARGET_DATE": ("target_date", "target_date", None),
        "CREATED_AT": ("created_at__date", "created_at__date", None),
        "COMPLETED_AT": ("completed_at__date", "completed_at__date", None),
        "CREATED_BY": ("created_by_id", "created_by__display_name", None),
    }


def process_grouped_data(
    data: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    response = {}
    schema = {}

    for item in data:
        key = item["key"]
        if key not in response:
            response[key] = {
                "key": key if key else "none",
                "name": (item.get("display_name", key) if item.get("display_name", key) else "None"),
                "count": 0,
            }
        group_key = str(item["group_key"]) if item["group_key"] else "none"
        schema[group_key] = item.get("group_name", item["group_key"])
        schema[group_key] = schema[group_key] if schema[group_key] else "None"
        response[key][group_key] = response[key].get(group_key, 0) + item["count"]
        response[key]["count"] += item["count"]

    return list(response.values()), schema


def build_number_chart_response(
    queryset: QuerySet[Issue],
    y_axis_filter: Dict[str, Any],
    y_axis: str,
    aggregate_func: Aggregate,
) -> List[Dict[str, Any]]:
    count = queryset.filter(**y_axis_filter).aggregate(total=aggregate_func).get("total", 0)
    return [{"key": y_axis, "name": y_axis, "count": count}]


def build_grouped_chart_response(
    queryset: QuerySet[Issue],
    id_field: str,
    name_field: str,
    group_field: str,
    group_name_field: str,
    aggregate_func: Aggregate,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    data = (
        queryset.annotate(
            key=F(id_field),
            group_key=F(group_field),
            group_name=F(group_name_field),
            display_name=F(name_field) if name_field else F(id_field),
        )
        .values("key", "group_key", "group_name", "display_name")
        .annotate(count=aggregate_func)
        .order_by("-count")
    )
    return process_grouped_data(data)


def build_simple_chart_response(
    queryset: QuerySet, id_field: str, name_field: str, aggregate_func: Aggregate
) -> List[Dict[str, Any]]:
    data = (
        queryset.annotate(key=F(id_field), display_name=F(name_field) if name_field else F(id_field))
        .values("key", "display_name")
        .annotate(count=aggregate_func)
        .order_by("key")
    )

    return [
        {
            "key": item["key"] if item["key"] else "None",
            "name": item["display_name"] if item["display_name"] else "None",
            "count": item["count"],
        }
        for item in data
    ]


def build_time_logged_chart(
    queryset: QuerySet[Issue],
    x_axis: str,
    group_by: Optional[str] = None,
    date_filter: Optional[Tuple[str, str]] = None,
) -> Dict[str, Union[List[Dict[str, Any]], Dict[str, str]]]:
    """Return hours-logged chart data (hours rather than counts).

    *queryset* is the issue queryset already filtered by workspace/project/etc.
    The *date_filter* tuple, if provided, should be applied against worklogs.logged_at,
    not the issue.created_at.

    x_axis may be ``LOGGED_DAY_OF_WEEK`` to bucket by weekday; otherwise it behaves
    like the normal axes but using issue fields on the related worklogs.
    Grouping works similarly, with the special key ``WORK_ITEMS`` forcing a split by
    individual issue.
    """
    # build base worklog queryset constrained to the issues of interest
    worklogs = Worklog.objects.filter(issue__in=queryset)
    if date_filter:
        start, end = date_filter
        worklogs = worklogs.filter(logged_at__date__gte=start, logged_at__date__lte=end)

    # helper to convert weekday numbers to names
    def weekday_name(num: int) -> str:
        # ExtractWeekDay returns 1=Sunday, 2=Monday, … 7=Saturday
        return calendar.day_name[(num - 2) % 7]

    # ensure consistent Monday→Sunday order
    WEEKDAY_ORDER = [2, 3, 4, 5, 6, 7, 1]

    schema: Dict[str, str] = {}
    results: Dict[Any, Dict[str, Any]] = {}

    # dispatch based on x_axis
    if x_axis == "LOGGED_DAY_OF_WEEK":
        worklogs = worklogs.annotate(day_num=ExtractWeekDay("logged_at"))
        key_field = "day_num"
        name_mapper = weekday_name
        ordered_keys = WEEKDAY_ORDER
    else:
        # reuse mapping from original function and prefix issue__
        field_mapping = get_x_axis_field()
        if x_axis not in field_mapping:
            raise ValidationError(f"Invalid x_axis field: {x_axis}")
        id_field, name_field, additional_filter = field_mapping.get(x_axis)
        if additional_filter:
            queryset = queryset.filter(**additional_filter)
            worklogs = worklogs.filter(**additional_filter)
        key_field = f"issue__{id_field}"
        name_field_res = f"issue__{name_field}" if name_field else key_field
        worklogs = worklogs.annotate(key_val=F(key_field), name_val=F(name_field_res))

        def name_mapper(value: Any) -> Any:
            return value

        ordered_keys = None

    # now handle grouping (stacked) if requested
    if group_by:
        # prepare grouping annotation
        if group_by == "WORK_ITEMS":
            worklogs = worklogs.annotate(group_key=F("issue__id"), group_name=F("issue__name"))
        elif group_by == "LOGGED_DAY_OF_WEEK":
            worklogs = worklogs.annotate(group_key=ExtractWeekDay("logged_at"))
        else:
            field_mapping = get_x_axis_field()
            if group_by not in field_mapping:
                raise ValidationError(f"Invalid group_by field: {group_by}")
            gid_field, gname_field, gfilter = field_mapping.get(group_by)
            if gfilter:
                worklogs = worklogs.filter(**gfilter)
            worklogs = worklogs.annotate(
                group_key=F(f"issue__{gid_field}"),
                group_name=F(f"issue__{gname_field}"),
            )

        # aggregate by both key and group_key
        agg = worklogs.values(key_field, "group_key", "group_name").annotate(total=Sum("duration"))
        # build response dict
        for item in agg:
            k = item.get(key_field)
            if x_axis == "LOGGED_DAY_OF_WEEK":
                k = k
            if k not in results:
                results[k] = {"key": k, "name": name_mapper(k), "count": 0}
            gk = item.get("group_key") or "none"
            schema[gk] = item.get("group_name") or gk
            hours = (item.get("total", 0) or 0) / 60
            results[k][gk] = results[k].get(gk, 0) + hours
            results[k]["count"] += hours
        # sort by weekday order if applicable
        data = []
        if ordered_keys:
            for k in ordered_keys:
                if k in results:
                    data.append(results[k])
                else:
                    data.append({"key": k, "name": name_mapper(k), "count": 0})
        else:
            data = list(results.values())
    else:
        # simple chart: aggregate only by key
        if x_axis == "LOGGED_DAY_OF_WEEK":
            agg = worklogs.values("day_num").annotate(total=Sum("duration"))
            # build a dict for lookup
            lookup = {item["day_num"]: item["total"] for item in agg}
            data = []
            for k in ordered_keys:
                hours = (lookup.get(k, 0) or 0) / 60
                data.append({"key": k, "name": name_mapper(k), "count": hours})
            schema = {}
        else:
            agg = worklogs.values("key_val", "name_val").annotate(total=Sum("duration"))
            data = [
                {
                    "key": itm.get("key_val") or "None",
                    "name": itm.get("name_val") or itm.get("key_val") or "None",
                    "count": (itm.get("total", 0) or 0) / 60,
                }
                for itm in agg
            ]
            schema = {}
    return {"data": data, "schema": schema}


def build_analytics_chart(
    queryset: QuerySet[Issue],
    x_axis: str,
    group_by: Optional[str] = None,
    date_filter: Optional[str] = None,
) -> Dict[str, Union[List[Dict[str, Any]], Dict[str, str]]]:
    # Validate x_axis
    if x_axis not in x_axis_mapper:
        raise ValidationError(f"Invalid x_axis field: {x_axis}")

    # Validate group_by
    if group_by and group_by not in x_axis_mapper:
        raise ValidationError(f"Invalid group_by field: {group_by}")

    # existing behaviour returns counts only
    field_mapping = get_x_axis_field()

    id_field, name_field, additional_filter = field_mapping.get(x_axis, (None, None, {}))
    group_field, group_name_field, group_additional_filter = field_mapping.get(group_by, (None, None, {}))

    # Apply additional filters if they exist
    if additional_filter or {}:
        queryset = queryset.filter(**additional_filter)

    if group_additional_filter or {}:
        queryset = queryset.filter(**group_additional_filter)

    aggregate_func = Count("id", distinct=True)

    if group_field:
        response, schema = build_grouped_chart_response(
            queryset,
            id_field,
            name_field,
            group_field,
            group_name_field,
            aggregate_func,
        )
    else:
        response = build_simple_chart_response(queryset, id_field, name_field, aggregate_func)
        schema = {}

    return {"data": response, "schema": schema}
