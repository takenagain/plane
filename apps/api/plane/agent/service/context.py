DEFAULT_SYSTEM_PROMPT = """You are an AI assistant integrated into Plane, a project management tool.
You help users manage their work: create, update, and query issues, cycles, modules, wiki pages,
project pages, intake/inbox, relations, worklogs, views, analytics, and more.

Guidelines:
- Always confirm actions before bulk changes (e.g., deleting many issues).
- When creating issues, use the project context if available.
- Wiki pages are workspace-level documentation (is_global); project pages belong to a specific project.
- Use tools to look up real data rather than guessing identifiers.
- To assign work items, call list_members for user UUIDs, then update_work_item or bulk_update_work_items with assignee_ids.
- Be concise but complete in your responses.
- When referencing issues, always include their identifier (e.g., PROJ-42).
"""

MAX_DESCRIPTION_LENGTH = 200
MAX_UI_CONTEXT_STRING_LENGTH = 200
MAX_UI_CONTEXT_PROJECTS = 50
MAX_UI_CONTEXT_ASSIGNEES = 20

VALID_VIEW_LAYOUTS = frozenset({"list", "kanban", "calendar", "gantt_chart", "spreadsheet"})


def _truncate(text: str | None, max_length: int = MAX_DESCRIPTION_LENGTH) -> str | None:
    if not text:
        return None
    text = text.strip()
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def _truncate_string(value, max_length: int = MAX_UI_CONTEXT_STRING_LENGTH) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= max_length:
        return text
    return f"{text[:max_length]}..."


def _sanitize_view_layout(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text in VALID_VIEW_LAYOUTS:
        return text
    return None


def sanitize_ui_context(
    ui_context: dict | None,
    *,
    workspace_slug: str,
    request_user=None,
) -> dict | None:
    """Sanitize client-supplied ui_context; never trust user identity fields."""
    if ui_context is None:
        return None
    if not isinstance(ui_context, dict):
        return None

    sanitized: dict = {}

    workspace = ui_context.get("workspace")
    if isinstance(workspace, dict):
        ws: dict = {"slug": workspace_slug}
        if name := _truncate_string(workspace.get("name")):
            ws["name"] = name
        if workspace_id := _truncate_string(workspace.get("id"), 64):
            ws["id"] = workspace_id
        sanitized["workspace"] = ws
    else:
        sanitized["workspace"] = {"slug": workspace_slug}

    if request_user is not None:
        display_name = getattr(request_user, "display_name", None) or str(request_user)
        user_payload: dict = {
            "id": str(request_user.id),
            "display_name": _truncate_string(display_name) or str(request_user),
        }
        if email := getattr(request_user, "email", None):
            user_payload["email"] = _truncate_string(email, 320)
        sanitized["user"] = user_payload

    projects = ui_context.get("projects")
    if isinstance(projects, dict):
        available = projects.get("available")
        sanitized_projects: dict = {"current_id": None, "available": []}
        current_id = projects.get("current_id")
        if current_id is not None:
            sanitized_projects["current_id"] = _truncate_string(current_id, 64)
        if isinstance(available, list):
            sanitized_projects["available"] = [
                {
                    "id": _truncate_string(project.get("id"), 64) or "",
                    "identifier": _truncate_string(project.get("identifier"), 32) or "",
                    "name": _truncate_string(project.get("name")) or "",
                    "is_current": bool(project.get("is_current")),
                }
                for project in available[:MAX_UI_CONTEXT_PROJECTS]
                if isinstance(project, dict)
            ]
        sanitized["projects"] = sanitized_projects

    current_project = ui_context.get("current_project")
    if isinstance(current_project, dict):
        sanitized["current_project"] = {
            "id": _truncate_string(current_project.get("id"), 64) or "",
            "identifier": _truncate_string(current_project.get("identifier"), 32) or "",
            "name": _truncate_string(current_project.get("name")) or "",
            **(
                {"description": description}
                if (description := _truncate(current_project.get("description")))
                else {}
            ),
        }
    elif current_project is None and "current_project" in ui_context:
        sanitized["current_project"] = None

    view = ui_context.get("view")
    if isinstance(view, dict):
        sanitized_view: dict = {
            "surface": _truncate_string(view.get("surface"), 32) or "other",
            "layout": _sanitize_view_layout(view.get("layout")),
        }
        for key in ("cycle_id", "module_id", "view_id"):
            if value := _truncate_string(view.get(key), 64):
                sanitized_view[key] = value
        sanitized["view"] = sanitized_view

    open_work_item = ui_context.get("open_work_item")
    if isinstance(open_work_item, dict):
        sanitized_work_item: dict = {
            "presentation": _truncate_string(open_work_item.get("presentation"), 16) or "peek",
        }
        for key in ("id", "identifier", "name", "project_id", "priority", "state_id"):
            if value := _truncate_string(open_work_item.get(key)):
                sanitized_work_item[key] = value
        assignees = open_work_item.get("assignees")
        if isinstance(assignees, list):
            sanitized_work_item["assignees"] = [
                aid
                for aid in (_truncate_string(a, 64) for a in assignees[:MAX_UI_CONTEXT_ASSIGNEES])
                if aid
            ]
        sanitized["open_work_item"] = sanitized_work_item
    elif open_work_item is None and "open_work_item" in ui_context:
        sanitized["open_work_item"] = None

    return sanitized


def _resolve_user_identity(
    ui_context: dict,
    request_user,
    user_display_name: str,
) -> tuple[str, str, str | None]:
    if request_user is not None:
        user_id = str(request_user.id)
        display_name = getattr(request_user, "display_name", None) or user_display_name
        email = getattr(request_user, "email", None)
        return user_id, display_name, email

    user = ui_context.get("user") or {}
    user_id = user.get("id") or "unknown"
    display_name = user.get("display_name") or user_display_name
    email = user.get("email")
    return user_id, display_name, email


def _format_active_project_lines(
    ui_context: dict,
    project_id: str | None,
) -> list[str]:
    lines: list[str] = []
    current_project = ui_context.get("current_project")
    projects = ui_context.get("projects") or {}
    active_project_id = (
        (current_project or {}).get("id")
        or projects.get("current_id")
        or project_id
    )

    if current_project:
        project_line = (
            f"- Current project: {current_project.get('identifier')} — {current_project.get('name')}"
        )
        description = _truncate(current_project.get("description"))
        if description:
            project_line += f" — {description}"
        lines.append(project_line)
    elif active_project_id:
        available = projects.get("available") or []
        match = next((p for p in available if p.get("id") == active_project_id), None)
        if match:
            lines.append(
                f"- Current project: {match.get('identifier')} — {match.get('name')} (id={active_project_id})"
            )
        else:
            lines.append(f"- Active project ID: {active_project_id}")
    else:
        lines.append("- No active project (workspace-level context)")

    return lines


def _format_legacy_context(
    workspace_slug: str,
    project_id: str | None,
    user_display_name: str,
) -> list[str]:
    lines = [
        "\nCurrent context:",
        f"- Workspace: {workspace_slug}",
        f"- User: {user_display_name}",
    ]
    if project_id:
        lines.append(f"- Active project ID: {project_id}")
    else:
        lines.append("- No active project (workspace-level context)")
    return lines


def _format_rich_context(
    ui_context: dict,
    workspace_slug: str,
    project_id: str | None,
    request_user,
    user_display_name: str,
) -> list[str]:
    lines = ["\nCurrent context:"]

    workspace = ui_context.get("workspace") or {}
    ws_slug = workspace.get("slug") or workspace_slug
    ws_name = workspace.get("name")
    if ws_name:
        lines.append(f"- Workspace: {ws_slug} ({ws_name})")
    else:
        lines.append(f"- Workspace: {ws_slug}")

    user_id, display_name, email = _resolve_user_identity(ui_context, request_user, user_display_name)
    user_line = f"- User: {display_name} (id={user_id}"
    if email:
        user_line += f", email={email}"
    user_line += ")"
    lines.append(user_line)

    projects = ui_context.get("projects") or {}
    available = projects.get("available") or []
    if available:
        lines.append("- Projects:")
        for project in available:
            suffix = ", current" if project.get("is_current") else ""
            lines.append(
                f"  - {project.get('identifier')} — {project.get('name')} (id={project.get('id')}{suffix})"
            )

    lines.extend(_format_active_project_lines(ui_context, project_id))

    view = ui_context.get("view")
    if view:
        surface = view.get("surface") or "other"
        layout = view.get("layout")
        view_line = f"- View: {surface}"
        if layout:
            view_line += f" / {layout}"
        extras = []
        for key in ("cycle_id", "module_id", "view_id"):
            value = view.get(key)
            if value:
                extras.append(f"{key}={value}")
        if extras:
            view_line += f" ({', '.join(extras)})"
        lines.append(view_line)

    open_work_item = ui_context.get("open_work_item")
    if open_work_item:
        presentation = open_work_item.get("presentation") or "peek"
        identifier = open_work_item.get("identifier") or ""
        name = open_work_item.get("name") or ""
        work_item_id = open_work_item.get("id")
        if identifier or name:
            work_item_line = f'- Open work item: {identifier} "{name}" ({presentation}'
        elif work_item_id:
            work_item_line = f"- Open work item: id={work_item_id} ({presentation}"
        else:
            work_item_line = f"- Open work item: ({presentation}"
        details = []
        priority = open_work_item.get("priority")
        if priority:
            details.append(f"priority={priority}")
        state_id = open_work_item.get("state_id")
        if state_id:
            details.append(f"state_id={state_id}")
        assignees = open_work_item.get("assignees") or []
        if assignees:
            details.append(f"assignees={', '.join(assignees)}")
        if details:
            work_item_line += "; " + "; ".join(details)
        work_item_line += ")"
        lines.append(work_item_line)

    return lines


def build_system_prompt(
    workspace_slug: str,
    project_id: str | None,
    user_display_name: str,
    custom_prompt: str = "",
    ui_context: dict | None = None,
    request_user=None,
) -> str:
    """
    Builds the system prompt injected at the start of every LLM conversation.
    Includes workspace/project context and an optional custom prompt override.
    """
    parts = [DEFAULT_SYSTEM_PROMPT]

    if ui_context:
        parts.extend(
            _format_rich_context(
                ui_context=ui_context,
                workspace_slug=workspace_slug,
                project_id=project_id,
                request_user=request_user,
                user_display_name=user_display_name,
            )
        )
    else:
        parts.extend(_format_legacy_context(workspace_slug, project_id, user_display_name))

    if custom_prompt:
        parts.append(f"\nAdditional instructions:\n{custom_prompt}")

    return "\n".join(parts)
