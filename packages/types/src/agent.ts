export type TAgentModelLifecycle = "stable" | "preview" | "previous";

export interface IAgentModel {
  id: string;
  name: string;
  input_price: number;
  output_price: number;
  lifecycle: TAgentModelLifecycle;
  pricing_note: string;
  supports_reasoning_with_tools: boolean;
}

export interface IAgentProvider {
  id: string;
  name: string;
  default_model: string;
  models: IAgentModel[];
}

export interface IAgentConfig {
  id: string;
  provider: string;
  api_key_set: boolean;
  model: string;
  default_model: string;
  max_steps: number;
  reasoning_level: "none" | "low" | "medium" | "high";
  is_enabled: boolean;
  system_prompt: string;
  available_models: string[];
  available_model_details: IAgentModel[];
}

export interface IAgentChatSession {
  id: string;
  title: string;
  selected_model: string;
  project_id: string | null;
  created_at: string;
  last_message_preview: string;
  messages?: IAgentChatMessage[];
}

export interface IToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface IAgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: IToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
  model_used?: string;
  tokens_sent?: number;
  tokens_received?: number;
  reasoning_tokens?: number;
  step_index?: number;
  latency_ms?: number;
  is_error?: boolean;
  created_at: string;
}

export interface IAgentChatResponse {
  session_id: string;
  messages: IAgentChatMessage[];
}

export type TAgentUIContextViewSurface =
  | "project_issues"
  | "cycle"
  | "module"
  | "project_view"
  | "workspace_view"
  | "browse"
  | "other";

export type TAgentUIContextViewLayout = "list" | "kanban" | "calendar" | "gantt_chart" | "spreadsheet" | null;

export type TAgentUIContextWorkItemPresentation = "peek" | "full_page" | "browse";

export type TAgentUIContext = {
  workspace: { slug: string; name?: string; id?: string };
  user: { id: string; display_name: string; email?: string };
  projects: {
    current_id: string | null;
    available: Array<{ id: string; identifier: string; name: string; is_current: boolean }>;
  };
  current_project?: {
    id: string;
    identifier: string;
    name: string;
    description?: string;
  } | null;
  view?: {
    surface: TAgentUIContextViewSurface;
    layout: TAgentUIContextViewLayout;
    cycle_id?: string;
    module_id?: string;
    view_id?: string;
  } | null;
  open_work_item?: {
    presentation: TAgentUIContextWorkItemPresentation;
    id?: string;
    identifier?: string;
    name?: string;
    project_id?: string;
    priority?: string | null;
    state_id?: string | null;
    assignees?: string[];
  } | null;
};
