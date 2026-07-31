import json

from plane.agent.catalog import normalize_model
from plane.db.models import AgentChatMessage, AgentChatSession, AgentConfiguration
from plane.license.utils.encryption import decrypt_data

from .context import build_system_prompt
from .llm import call_llm
from ..tools import ToolExecutor, get_tool_definitions


class AgentDisabledError(Exception):
    pass


class AgentService:
    def run(
        self,
        session: AgentChatSession,
        user_content: str,
        project_id: str | None,
        model_override: str | None,
        request_user,
        ui_context: dict | None = None,
    ) -> list[AgentChatMessage]:
        config = self._get_config(session.workspace_id, project_id)
        if not config or not config.is_enabled:
            raise AgentDisabledError("Agent is not enabled.")

        api_key = decrypt_data(config.api_key_encrypted) if config.api_key_encrypted else ""
        if not api_key:
            raise AgentDisabledError("Agent API key is not configured.")

        model = normalize_model(config.provider, model_override or config.model)
        max_steps = config.max_steps or 25

        user_msg = AgentChatMessage.objects.create(
            session=session,
            role="user",
            content=user_content,
        )

        if not session.title:
            session.title = user_content[:60]
            session.selected_model = model
            session.save(update_fields=["title", "selected_model", "updated_at"])

        created_messages: list[AgentChatMessage] = [user_msg]
        history = self._build_history(session)
        system_prompt = build_system_prompt(
            workspace_slug=session.workspace.slug,
            project_id=project_id,
            user_display_name=request_user.display_name,
            custom_prompt=config.system_prompt,
            ui_context=ui_context,
            request_user=request_user,
        )
        tool_executor = ToolExecutor(
            request_user=request_user,
            workspace_slug=session.workspace.slug,
            default_project_id=project_id,
        )

        tools = get_tool_definitions()
        messages = [{"role": "system", "content": system_prompt}, *history]
        step = 0

        while step < max_steps:
            try:
                response = call_llm(
                    messages=messages,
                    tools=tools,
                    provider=config.provider,
                    model=model,
                    api_key=api_key,
                    reasoning_level=config.reasoning_level,
                )
            except ValueError as exc:
                error_msg = AgentChatMessage.objects.create(
                    session=session,
                    role="assistant",
                    content=str(exc),
                    is_error=True,
                    step_index=step,
                )
                created_messages.append(error_msg)
                return created_messages

            if response.tool_calls:
                assistant_msg = AgentChatMessage.objects.create(
                    session=session,
                    role="assistant",
                    content=response.content,
                    tool_calls=response.tool_calls,
                    model_used=model,
                    tokens_sent=response.tokens_sent,
                    tokens_received=response.tokens_received,
                    reasoning_tokens=response.reasoning_tokens,
                    step_index=step,
                    latency_ms=response.latency_ms,
                )
                created_messages.append(assistant_msg)
                messages.append({"role": "assistant", "content": response.content, "tool_calls": response.tool_calls})

                for tool_call in response.tool_calls:
                    tool_name = tool_call["function"]["name"]
                    try:
                        tool_input = json.loads(tool_call["function"]["arguments"] or "{}")
                    except (json.JSONDecodeError, TypeError) as exc:
                        tool_input = {}
                        tool_output = {"error": f"Invalid tool arguments: {exc}"}
                        is_error = True
                    else:
                        is_error = False
                        try:
                            tool_output = tool_executor.execute(tool_name, tool_input)
                        except Exception as exc:
                            tool_output = {"error": str(exc)}
                            is_error = True

                    tool_msg = AgentChatMessage.objects.create(
                        session=session,
                        role="tool",
                        tool_call_id=tool_call["id"],
                        tool_name=tool_name,
                        tool_input=tool_input,
                        tool_output=tool_output,
                        step_index=step,
                        is_error=is_error,
                    )
                    created_messages.append(tool_msg)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "content": json.dumps(tool_output),
                        }
                    )

                step += 1
                continue

            final_msg = AgentChatMessage.objects.create(
                session=session,
                role="assistant",
                content=response.content,
                model_used=model,
                tokens_sent=response.tokens_sent,
                tokens_received=response.tokens_received,
                reasoning_tokens=response.reasoning_tokens,
                step_index=step,
                latency_ms=response.latency_ms,
            )
            created_messages.append(final_msg)
            break
        else:
            max_step_msg = AgentChatMessage.objects.create(
                session=session,
                role="assistant",
                content=(
                    "I reached the configured maximum steps for this task. Please refine the request and try again."
                ),
                is_error=True,
                step_index=step,
            )
            created_messages.append(max_step_msg)

        return created_messages

    def _get_config(self, workspace_id, project_id):
        if project_id:
            cfg = AgentConfiguration.objects.filter(workspace_id=workspace_id, project_id=project_id).first()
            if cfg:
                return cfg
        return AgentConfiguration.objects.filter(workspace_id=workspace_id, project__isnull=True).first()

    def _build_history(self, session: AgentChatSession) -> list[dict]:
        messages: list[dict] = []
        for msg in session.messages.order_by("created_at"):
            if msg.role == "user":
                messages.append({"role": "user", "content": msg.content})
            elif msg.role == "assistant":
                assistant_msg = {"role": "assistant", "content": msg.content}
                if msg.tool_calls:
                    assistant_msg["tool_calls"] = msg.tool_calls
                messages.append(assistant_msg)
            elif msg.role == "tool":
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": msg.tool_call_id,
                        "content": json.dumps(msg.tool_output or {}),
                    }
                )
        return messages
