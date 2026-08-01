import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAgentConfig, IAgentProvider } from "@plane/types";
import { ProjectAIAgentSettings } from "../ai-agent-settings";

const mocks = vi.hoisted(() => ({
  getProviderCatalog: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  getProjectConfig: vi.fn(),
  saveProjectConfig: vi.fn(),
  deleteProjectConfig: vi.fn(),
  setToast: vi.fn(),
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

vi.mock("@/services/agent.service", () => ({
  AgentService: class {
    getProviderCatalog = mocks.getProviderCatalog;
    getWorkspaceConfig = mocks.getWorkspaceConfig;
    getProjectConfig = mocks.getProjectConfig;
    saveProjectConfig = mocks.saveProjectConfig;
    deleteProjectConfig = mocks.deleteProjectConfig;
  },
  getAgentErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("@/components/settings/heading", () => ({
  SettingsHeading: () => null,
}));

const providers = [
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
        supports_reasoning_with_tools: true,
      },
      {
        id: "gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        input_price: 0.2,
        output_price: 1.2,
        lifecycle: "stable",
        pricing_note: "",
        supports_reasoning_with_tools: false,
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    default_model: "claude-sonnet-5",
    models: [
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
  },
] as IAgentProvider[];

const workspaceConfig: IAgentConfig = {
  id: "config-1",
  provider: "openai",
  api_key_set: true,
  model: "gpt-5.6-sol",
  default_model: "gpt-5.6-sol",
  max_steps: 25,
  reasoning_level: "medium",
  is_enabled: true,
  system_prompt: "",
  available_models: providers[0].models.map((model) => model.id),
  available_model_details: providers[0].models,
};

describe("ProjectAIAgentSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderCatalog.mockResolvedValue(providers);
    mocks.getWorkspaceConfig.mockResolvedValue(workspaceConfig);
    mocks.getProjectConfig.mockRejectedValue({ status: 404 });
  });

  it("uses provider defaults when creating and switching a project override", async () => {
    render(<ProjectAIAgentSettings workspaceSlug="acme" projectId="project-1" />);

    const inheritToggle = await screen.findByRole("checkbox", { name: "Use workspace configuration" });
    fireEvent.click(inheritToggle);

    expect(await screen.findByRole("combobox", { name: "Model" })).toHaveValue("gpt-5.6-sol");

    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));

    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("claude-sonnet-5");
  });

  it("blocks an unsupported model and reasoning combination", async () => {
    render(<ProjectAIAgentSettings workspaceSlug="acme" projectId="project-1" />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "Use workspace configuration" }));

    fireEvent.change(screen.getByLabelText("API key (required)"), { target: { value: "sk-project-key" } });

    const modelSelect = await screen.findByRole("combobox", { name: "Model" });
    fireEvent.change(modelSelect, { target: { value: "gpt-5.6-luna" } });

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(
      "GPT-5.6 Luna does not support reasoning together with the function tools used by Plane."
    );
    expect(screen.getByRole("button", { name: "Save override" })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Reasoning" }), { target: { value: "none" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save override" })).toBeEnabled();
  });

  it("requires a project-specific API key before saving a new override", async () => {
    render(<ProjectAIAgentSettings workspaceSlug="acme" projectId="project-1" />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "Use workspace configuration" }));

    const saveButton = screen.getByRole("button", { name: "Save override" });
    expect(screen.getByLabelText("API key (required)")).toHaveAttribute("placeholder", "sk-...");
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("API key (required)"), { target: { value: "sk-project-key" } });

    expect(saveButton).toBeEnabled();
  });
});
