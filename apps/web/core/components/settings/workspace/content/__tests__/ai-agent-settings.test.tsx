import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAgentConfig, IAgentProvider } from "@plane/types";
import { WorkspaceAIAgentSettings } from "../ai-agent-settings";

const mocks = vi.hoisted(() => ({
  getProviderCatalog: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  saveWorkspaceConfig: vi.fn(),
  fetchConfig: vi.fn(),
  setToast: vi.fn(),
}));

vi.mock("@plane/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@plane/propel/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@plane/propel/toast", () => ({
  TOAST_TYPE: { ERROR: "error", SUCCESS: "success" },
  setToast: mocks.setToast,
}));

vi.mock("@/components/agent/model-select", () => ({
  AgentModelSelect: ({
    models,
    value,
    onChange,
  }: {
    models: Array<{ id: string; name: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <select aria-label="Model" value={value} onChange={(event) => onChange(event.target.value)}>
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/hooks/store/use-agent", () => ({
  useAgent: () => ({ fetchConfig: mocks.fetchConfig }),
}));

vi.mock("@/services/agent.service", () => ({
  AgentService: class {
    getProviderCatalog = mocks.getProviderCatalog;
    getWorkspaceConfig = mocks.getWorkspaceConfig;
    saveWorkspaceConfig = mocks.saveWorkspaceConfig;
  },
  getAgentErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/components/settings/heading", () => ({
  SettingsHeading: () => null,
}));

const providers: IAgentProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    default_model: "gpt-5.6-sol",
    models: [
      {
        id: "gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        input_price: 5,
        output_price: 30,
        lifecycle: "stable",
        pricing_note: "",
      },
      {
        id: "gpt-5.5",
        name: "GPT-5.5",
        input_price: 5,
        output_price: 30,
        lifecycle: "previous",
        pricing_note: "",
      },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    default_model: "mistral-small-2603",
    models: [
      {
        id: "mistral-small-2603",
        name: "Mistral Small 4",
        input_price: 0.15,
        output_price: 0.6,
        lifecycle: "stable",
        pricing_note: "",
      },
    ],
  },
];

const workspaceConfig: IAgentConfig = {
  id: "config-1",
  provider: "openai",
  api_key_set: true,
  model: "gpt-5.5",
  default_model: "gpt-5.6-sol",
  max_steps: 25,
  reasoning_level: "medium",
  is_enabled: true,
  system_prompt: "",
  available_models: providers[0].models.map((model) => model.id),
  available_model_details: providers[0].models,
};

describe("WorkspaceAIAgentSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderCatalog.mockResolvedValue(providers);
    mocks.getWorkspaceConfig.mockResolvedValue(workspaceConfig);
  });

  it("preserves a valid saved model and selects the provider default when switching", async () => {
    render(<WorkspaceAIAgentSettings workspaceSlug="acme" />);

    expect(await screen.findByRole("combobox", { name: "Model" })).toHaveValue("gpt-5.5");

    fireEvent.click(screen.getByRole("button", { name: "Mistral" }));

    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("mistral-small-2603");
  });

  it("uses the settings error path when the provider catalog cannot load", async () => {
    mocks.getProviderCatalog.mockRejectedValue(new Error("catalog unavailable"));

    render(<WorkspaceAIAgentSettings workspaceSlug="acme" />);

    await waitFor(() =>
      expect(mocks.setToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          message: "Unable to load AI Agent settings.",
        })
      )
    );
  });
});
