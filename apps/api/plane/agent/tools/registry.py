from .analytics import get_project_analytics, get_workspace_project_stats
from .cycles import (
    add_issues_to_cycle,
    create_cycle,
    get_cycle,
    list_cycles,
    remove_issue_from_cycle,
    update_cycle,
)
from .intake import create_intake_issue, list_intake_issues, update_intake_issue
from .modules import (
    add_issues_to_module,
    create_module,
    get_module,
    list_modules,
    remove_issue_from_module,
    update_module,
)
from .pages import create_page, delete_page, get_page, list_pages, update_page
from .relations import create_issue_relation, list_issue_relations, remove_issue_relation
from .search import search
from .states_labels import list_labels, list_members, list_projects, list_states
from .views import get_view, list_views
from .wiki import create_wiki_page, delete_wiki_page, get_wiki_page, list_wiki_pages, update_wiki_page
from .work_items import (
    add_work_item_comment,
    create_work_item,
    delete_work_item,
    get_work_item,
    list_work_items,
    update_work_item,
)
from .worklogs import create_worklog, delete_worklog, list_worklogs, update_worklog

TOOL_REGISTRY: dict[str, callable] = {
    "list_work_items": list_work_items,
    "get_work_item": get_work_item,
    "create_work_item": create_work_item,
    "update_work_item": update_work_item,
    "delete_work_item": delete_work_item,
    "add_work_item_comment": add_work_item_comment,
    "list_cycles": list_cycles,
    "get_cycle": get_cycle,
    "create_cycle": create_cycle,
    "update_cycle": update_cycle,
    "add_issues_to_cycle": add_issues_to_cycle,
    "remove_issue_from_cycle": remove_issue_from_cycle,
    "list_modules": list_modules,
    "get_module": get_module,
    "create_module": create_module,
    "update_module": update_module,
    "add_issues_to_module": add_issues_to_module,
    "remove_issue_from_module": remove_issue_from_module,
    "list_states": list_states,
    "list_labels": list_labels,
    "list_members": list_members,
    "list_projects": list_projects,
    "search": search,
    "list_wiki_pages": list_wiki_pages,
    "get_wiki_page": get_wiki_page,
    "create_wiki_page": create_wiki_page,
    "update_wiki_page": update_wiki_page,
    "delete_wiki_page": delete_wiki_page,
    "list_pages": list_pages,
    "get_page": get_page,
    "create_page": create_page,
    "update_page": update_page,
    "delete_page": delete_page,
    "get_project_analytics": get_project_analytics,
    "get_workspace_project_stats": get_workspace_project_stats,
    "list_intake_issues": list_intake_issues,
    "create_intake_issue": create_intake_issue,
    "update_intake_issue": update_intake_issue,
    "list_issue_relations": list_issue_relations,
    "create_issue_relation": create_issue_relation,
    "remove_issue_relation": remove_issue_relation,
    "list_worklogs": list_worklogs,
    "create_worklog": create_worklog,
    "update_worklog": update_worklog,
    "delete_worklog": delete_worklog,
    "list_views": list_views,
    "get_view": get_view,
}


def _tool_schema(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required or []},
        },
    }


TOOL_DEFINITIONS = [
    _tool_schema(
        "list_work_items",
        "List work items in a project with optional filters.",
        {
            "project_id": {"type": "string"},
            "state_id": {"type": "string"},
            "priority": {"type": "string", "enum": ["urgent", "high", "medium", "low", "none"]},
            "query": {"type": "string"},
            "limit": {"type": "integer"},
        },
    ),
    _tool_schema("get_work_item", "Get a single work item by id or identifier.", {"issue_id": {"type": "string"}, "identifier": {"type": "string"}}),
    _tool_schema("create_work_item", "Create a work item.", {"project_id": {"type": "string"}, "name": {"type": "string"}}, ["name"]),
    _tool_schema("update_work_item", "Update a work item.", {"issue_id": {"type": "string"}}, ["issue_id"]),
    _tool_schema("delete_work_item", "Delete a work item.", {"issue_id": {"type": "string"}}, ["issue_id"]),
    _tool_schema(
        "add_work_item_comment",
        "Add a comment to a work item.",
        {"issue_id": {"type": "string"}, "comment": {"type": "string"}},
        ["issue_id", "comment"],
    ),
    _tool_schema("list_cycles", "List cycles.", {"project_id": {"type": "string"}}, ["project_id"]),
    _tool_schema("get_cycle", "Get cycle details.", {"cycle_id": {"type": "string"}}, ["cycle_id"]),
    _tool_schema("create_cycle", "Create cycle.", {"project_id": {"type": "string"}, "name": {"type": "string"}}, ["project_id", "name"]),
    _tool_schema("update_cycle", "Update cycle.", {"cycle_id": {"type": "string"}}, ["cycle_id"]),
    _tool_schema(
        "add_issues_to_cycle",
        "Add issues to cycle.",
        {"cycle_id": {"type": "string"}, "issue_ids": {"type": "array", "items": {"type": "string"}}},
        ["cycle_id", "issue_ids"],
    ),
    _tool_schema(
        "remove_issue_from_cycle",
        "Remove issue from cycle.",
        {"cycle_id": {"type": "string"}, "issue_id": {"type": "string"}},
        ["cycle_id", "issue_id"],
    ),
    _tool_schema("list_modules", "List modules.", {"project_id": {"type": "string"}}, ["project_id"]),
    _tool_schema("get_module", "Get module details.", {"module_id": {"type": "string"}}, ["module_id"]),
    _tool_schema("create_module", "Create module.", {"project_id": {"type": "string"}, "name": {"type": "string"}}, ["project_id", "name"]),
    _tool_schema("update_module", "Update module.", {"module_id": {"type": "string"}}, ["module_id"]),
    _tool_schema(
        "add_issues_to_module",
        "Add issues to module.",
        {"module_id": {"type": "string"}, "issue_ids": {"type": "array", "items": {"type": "string"}}},
        ["module_id", "issue_ids"],
    ),
    _tool_schema(
        "remove_issue_from_module",
        "Remove issue from module.",
        {"module_id": {"type": "string"}, "issue_id": {"type": "string"}},
        ["module_id", "issue_id"],
    ),
    _tool_schema("list_states", "List states for project.", {"project_id": {"type": "string"}}, ["project_id"]),
    _tool_schema("list_labels", "List labels for project.", {"project_id": {"type": "string"}}, ["project_id"]),
    _tool_schema("list_members", "List project/workspace members.", {"project_id": {"type": "string"}}),
    _tool_schema("list_projects", "List projects in workspace.", {}),
    _tool_schema("search", "Search issues, cycles, modules, wiki pages, and project pages.", {"query": {"type": "string"}, "project_id": {"type": "string"}}, ["query"]),
    _tool_schema(
        "list_wiki_pages",
        "List workspace wiki pages.",
        {"query": {"type": "string"}, "limit": {"type": "integer"}},
    ),
    _tool_schema("get_wiki_page", "Get a wiki page by id.", {"page_id": {"type": "string"}}, ["page_id"]),
    _tool_schema(
        "create_wiki_page",
        "Create a workspace wiki page.",
        {"name": {"type": "string"}, "description": {"type": "string"}, "access": {"type": "string", "enum": ["public", "private"]}},
        ["name"],
    ),
    _tool_schema(
        "update_wiki_page",
        "Update a wiki page.",
        {
            "page_id": {"type": "string"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "access": {"type": "string", "enum": ["public", "private"]},
        },
        ["page_id"],
    ),
    _tool_schema("delete_wiki_page", "Delete a wiki page.", {"page_id": {"type": "string"}}, ["page_id"]),
    _tool_schema(
        "list_pages",
        "List project pages (docs).",
        {"project_id": {"type": "string"}, "query": {"type": "string"}, "limit": {"type": "integer"}},
        ["project_id"],
    ),
    _tool_schema(
        "get_page",
        "Get a project page by id.",
        {"project_id": {"type": "string"}, "page_id": {"type": "string"}},
        ["project_id", "page_id"],
    ),
    _tool_schema(
        "create_page",
        "Create a project page.",
        {
            "project_id": {"type": "string"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "access": {"type": "string", "enum": ["public", "private"]},
        },
        ["project_id", "name"],
    ),
    _tool_schema(
        "update_page",
        "Update a project page.",
        {
            "project_id": {"type": "string"},
            "page_id": {"type": "string"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "access": {"type": "string", "enum": ["public", "private"]},
        },
        ["project_id", "page_id"],
    ),
    _tool_schema(
        "delete_page",
        "Delete a project page.",
        {"project_id": {"type": "string"}, "page_id": {"type": "string"}},
        ["project_id", "page_id"],
    ),
    _tool_schema(
        "get_project_analytics",
        "Get work item analytics for a project (counts by state group).",
        {"project_id": {"type": "string"}},
        ["project_id"],
    ),
    _tool_schema(
        "get_workspace_project_stats",
        "Get summary work item stats across all accessible projects in the workspace.",
        {},
    ),
    _tool_schema(
        "list_intake_issues",
        "List intake/inbox issues for a project (defaults to pending).",
        {
            "project_id": {"type": "string"},
            "status": {"type": "string", "description": "Comma-separated: pending,rejected,snoozed,accepted,duplicate"},
            "limit": {"type": "integer"},
        },
        ["project_id"],
    ),
    _tool_schema(
        "create_intake_issue",
        "Create a new intake/inbox issue.",
        {
            "project_id": {"type": "string"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "priority": {"type": "string", "enum": ["urgent", "high", "medium", "low", "none"]},
        },
        ["project_id", "name"],
    ),
    _tool_schema(
        "update_intake_issue",
        "Update an intake/inbox issue (status, name, or description).",
        {
            "project_id": {"type": "string"},
            "issue_id": {"type": "string"},
            "status": {"type": "string", "enum": ["pending", "rejected", "snoozed", "accepted", "duplicate"]},
            "name": {"type": "string"},
            "description": {"type": "string"},
        },
        ["project_id", "issue_id"],
    ),
    _tool_schema(
        "list_issue_relations",
        "List relations for a work item (blocking, blocked_by, duplicate, relates_to, etc.).",
        {"issue_id": {"type": "string"}},
        ["issue_id"],
    ),
    _tool_schema(
        "create_issue_relation",
        "Create relations between work items.",
        {
            "issue_id": {"type": "string"},
            "relation_type": {
                "type": "string",
                "enum": [
                    "blocking",
                    "blocked_by",
                    "duplicate",
                    "relates_to",
                    "start_after",
                    "start_before",
                    "finish_after",
                    "finish_before",
                ],
            },
            "related_issue_ids": {"type": "array", "items": {"type": "string"}},
        },
        ["issue_id", "relation_type", "related_issue_ids"],
    ),
    _tool_schema(
        "remove_issue_relation",
        "Remove a relation between two work items.",
        {"issue_id": {"type": "string"}, "related_issue_id": {"type": "string"}},
        ["issue_id", "related_issue_id"],
    ),
    _tool_schema(
        "list_worklogs",
        "List time logs for a work item.",
        {"issue_id": {"type": "string"}},
        ["issue_id"],
    ),
    _tool_schema(
        "create_worklog",
        "Log time spent on a work item.",
        {
            "issue_id": {"type": "string"},
            "duration": {"type": "integer", "description": "Duration in minutes"},
            "logged_at": {"type": "string", "description": "Date (YYYY-MM-DD)"},
            "description": {"type": "string"},
        },
        ["issue_id", "duration", "logged_at"],
    ),
    _tool_schema(
        "update_worklog",
        "Update a worklog entry.",
        {
            "issue_id": {"type": "string"},
            "worklog_id": {"type": "string"},
            "duration": {"type": "integer"},
            "logged_at": {"type": "string"},
            "description": {"type": "string"},
        },
        ["issue_id", "worklog_id"],
    ),
    _tool_schema(
        "delete_worklog",
        "Delete a worklog entry.",
        {"issue_id": {"type": "string"}, "worklog_id": {"type": "string"}},
        ["issue_id", "worklog_id"],
    ),
    _tool_schema(
        "list_views",
        "List saved project views (filters/layouts).",
        {"project_id": {"type": "string"}},
        ["project_id"],
    ),
    _tool_schema(
        "get_view",
        "Get a saved project view by id.",
        {"project_id": {"type": "string"}, "view_id": {"type": "string"}},
        ["project_id", "view_id"],
    ),
]


def get_tool_definitions() -> list[dict]:
    return TOOL_DEFINITIONS


class ToolExecutor:
    def __init__(self, request_user, workspace_slug: str, default_project_id: str | None):
        self.request_user = request_user
        self.workspace_slug = workspace_slug
        self.default_project_id = default_project_id

    def execute(self, tool_name: str, arguments: dict) -> dict:
        fn = TOOL_REGISTRY.get(tool_name)
        if not fn:
            raise ValueError(f"Unknown tool: {tool_name}")

        payload = dict(arguments or {})
        if not payload.get("project_id") and self.default_project_id:
            payload["project_id"] = self.default_project_id
        payload["workspace_slug"] = self.workspace_slug
        payload["request_user"] = self.request_user
        return fn(**payload)
