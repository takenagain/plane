export interface IAgentConfig {
  id: string;
  provider: string;
  api_key_set: boolean;
  model: string;
  max_steps: number;
  reasoning_level: "none" | "low" | "medium" | "high";
  is_enabled: boolean;
  system_prompt: string;
  available_models: string[];
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
