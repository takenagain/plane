import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAgentConfig } from "@plane/types";
import { AgentStore } from "../agent.store";

const mocks = vi.hoisted(() => ({
  getEffectiveConfig: vi.fn(),
  sendMessage: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/services/agent.service", () => ({
  AgentService: class {
    sendMessage = mocks.sendMessage;
    getEffectiveConfig = mocks.getEffectiveConfig;
    getSession = mocks.getSession;
  },
}));

const staleAnthropicConfig: IAgentConfig = {
  id: "config-1",
  provider: "anthropic",
  api_key_set: true,
  model: "claude-retired",
  default_model: "claude-sonnet-5",
  max_steps: 25,
  reasoning_level: "medium",
  is_enabled: true,
  system_prompt: "",
  available_models: ["claude-fable-5", "claude-sonnet-5"],
  available_model_details: [
    {
      id: "claude-fable-5",
      name: "Claude Fable 5",
      input_price: 10,
      output_price: 50,
      lifecycle: "stable",
      pricing_note: "",
      supports_reasoning_with_tools: true,
    },
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      input_price: 2,
      output_price: 10,
      lifecycle: "stable",
      pricing_note: "",
      supports_reasoning_with_tools: true,
    },
  ],
};

describe("AgentStore model selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the provider default instead of the first model for stale configurations", async () => {
    mocks.getEffectiveConfig.mockResolvedValue(staleAnthropicConfig);
    const store = new AgentStore();

    await store.fetchEffectiveConfig("acme");

    expect(store.selectedModel).toBe("claude-sonnet-5");
  });

  it("clears a model selected in another workspace when configuration is missing", async () => {
    const store = new AgentStore();
    mocks.getEffectiveConfig.mockResolvedValueOnce(staleAnthropicConfig).mockRejectedValueOnce({ status: 404 });

    await store.fetchEffectiveConfig("acme");
    await store.fetchEffectiveConfig("other");

    expect(store.selectedModel).toBe("");
  });

  it("keeps the provider default when a resumed session also has a stale model", async () => {
    mocks.getEffectiveConfig.mockResolvedValue(staleAnthropicConfig);
    mocks.getSession.mockResolvedValue({ messages: [], selected_model: "claude-retired-session" });
    const store = new AgentStore();

    await store.fetchEffectiveConfig("acme");
    await store.loadSession("acme", "session-1");

    expect(store.selectedModel).toBe("claude-sonnet-5");
  });

  it("keeps a provider error visible after reconciling the failed message", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("Provider error from 'openai': request rejected"));
    mocks.getSession.mockResolvedValue({
      selected_model: "",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Hello",
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });
    const store = new AgentStore();
    store.setActiveSession("session-1");

    await store.sendMessage("acme", "Hello");

    expect(store.activeSessionMessages.map((message) => message.id)).toEqual(["user-1"]);
    expect(store.error).toBe("Provider error from 'openai': request rejected");
  });
});
