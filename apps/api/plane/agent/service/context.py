DEFAULT_SYSTEM_PROMPT = """You are an AI assistant integrated into Plane, a project management tool.
You help users manage their work: create, update, and query issues, cycles, modules, wiki pages,
project pages, intake/inbox, relations, worklogs, views, analytics, and more.

Guidelines:
- Always confirm actions before bulk changes (e.g., deleting many issues).
- When creating issues, use the project context if available.
- Wiki pages are workspace-level documentation (is_global); project pages belong to a specific project.
- Use tools to look up real data rather than guessing identifiers.
- Be concise but complete in your responses.
- When referencing issues, always include their identifier (e.g., PROJ-42).
"""


def build_system_prompt(
    workspace_slug: str,
    project_id: str | None,
    user_display_name: str,
    custom_prompt: str = "",
) -> str:
    """
    Builds the system prompt injected at the start of every LLM conversation.
    Includes workspace/project context and an optional custom prompt override.
    """
    parts = [DEFAULT_SYSTEM_PROMPT]
    parts.append("\nCurrent context:")
    parts.append(f"- Workspace: {workspace_slug}")
    parts.append(f"- User: {user_display_name}")
    if project_id:
        parts.append(f"- Active project ID: {project_id}")
    else:
        parts.append("- No active project (workspace-level context)")

    if custom_prompt:
        parts.append(f"\nAdditional instructions:\n{custom_prompt}")

    return "\n".join(parts)
