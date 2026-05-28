from .cycles import (
    add_issues_to_cycle,
    create_cycle,
    get_cycle,
    list_cycles,
    remove_issue_from_cycle,
    update_cycle,
)
from .modules import (
    add_issues_to_module,
    create_module,
    get_module,
    list_modules,
    remove_issue_from_module,
    update_module,
)
from .search import search
from .states_labels import list_labels, list_members, list_projects, list_states
from .work_items import (
    add_work_item_comment,
    create_work_item,
    delete_work_item,
    get_work_item,
    list_work_items,
    update_work_item,
)

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
    _tool_schema("search", "Search issues, cycles and modules.", {"query": {"type": "string"}, "project_id": {"type": "string"}}, ["query"]),
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
