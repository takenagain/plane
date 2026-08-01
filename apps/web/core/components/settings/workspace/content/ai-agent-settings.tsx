import { useEffect, useMemo, useState } from "react";
import { AGENT_DEFAULT_MAX_STEPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentConfig, IAgentProvider } from "@plane/types";
import { AgentModelSelect } from "@/components/agent/model-select";
import { useAgent } from "@/hooks/store/use-agent";
import { AgentService, getAgentErrorMessage, type TAgentHttpError } from "@/services/agent.service";
import { SettingsHeading } from "@/components/settings/heading";
import { getAgentModelConfigurationError } from "@/components/settings/agent-config-validation";

type Props = {
  workspaceSlug: string;
};

const agentService = new AgentService();

type TAgentFormConfig = {
  provider: string;
  model: string;
  max_steps: number;
  reasoning_level: IAgentConfig["reasoning_level"];
  is_enabled: boolean;
  system_prompt: string;
};

const DEFAULT_CONFIG: TAgentFormConfig = {
  provider: "",
  model: "",
  max_steps: AGENT_DEFAULT_MAX_STEPS,
  reasoning_level: "medium",
  is_enabled: true,
  system_prompt: "",
};

const getOptionalWorkspaceConfig = async (workspaceSlug: string): Promise<IAgentConfig | null> => {
  try {
    return await agentService.getWorkspaceConfig(workspaceSlug);
  } catch (error) {
    if ((error as TAgentHttpError).status === 404) return null;
    throw error;
  }
};

export function WorkspaceAIAgentSettings({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const agent = useAgent();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<IAgentProvider[]>([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [savedProvider, setSavedProvider] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const providerDefinition = useMemo(
    () => providers.find((provider) => provider.id === config.provider),
    [config.provider, providers]
  );
  const providerModels = providerDefinition?.models ?? [];
  const providerChanged = Boolean(savedProvider) && config.provider !== savedProvider;

  const selectedModel = useMemo(() => {
    if (config.model && providerModels.some((model) => model.id === config.model)) return config.model;
    return providerDefinition?.default_model ?? providerModels[0]?.id ?? "";
  }, [config.model, providerDefinition, providerModels]);
  const selectedModelDefinition = providerModels.find((model) => model.id === selectedModel);
  const configurationError = getAgentModelConfigurationError(selectedModelDefinition, config.reasoning_level);

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const [catalog, data] = await Promise.all([
          agentService.getProviderCatalog(workspaceSlug),
          getOptionalWorkspaceConfig(workspaceSlug),
        ]);
        const provider = catalog.find((item) => item.id === data?.provider) ?? catalog[0];
        if (!provider) throw new Error("No AI Agent providers are available.");

        const model =
          data?.model && provider.models.some((item) => item.id === data.model) ? data.model : provider.default_model;

        setProviders(catalog);
        setConfig({
          provider: provider.id,
          model,
          max_steps: data?.max_steps || AGENT_DEFAULT_MAX_STEPS,
          reasoning_level: data?.reasoning_level ?? "medium",
          is_enabled: data?.is_enabled ?? true,
          system_prompt: data?.system_prompt ?? "",
        });
        setSavedProvider(data?.provider ?? provider.id);
        setApiKeySet(data?.api_key_set ?? false);
        setApiKey("");
        setApiKeyError(null);
      } catch (error) {
        setProviders([]);
        setConfig(DEFAULT_CONFIG);
        setSavedProvider("");
        setApiKeySet(false);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error",
          message: getAgentErrorMessage(error, "Unable to load AI Agent settings."),
        });
      } finally {
        setLoading(false);
      }
    };

    void loadConfig();
  }, [workspaceSlug]);

  const onProviderChange = (providerId: string) => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;

    setConfig((prev) => ({
      ...prev,
      provider: provider.id,
      model: provider.default_model,
    }));
    setApiKey("");
    setApiKeyError(null);
  };

  const onSave = async () => {
    if (configurationError) return;

    if (providerChanged && !apiKey.trim()) {
      setApiKeyError("A new API key is required when changing provider.");
      return;
    }

    setApiKeyError(null);
    setSaving(true);
    try {
      const payload: Partial<IAgentConfig> & { api_key?: string } = {
        provider: config.provider,
        model: selectedModel,
        max_steps: config.max_steps,
        reasoning_level: config.reasoning_level,
        is_enabled: config.is_enabled,
        system_prompt: config.system_prompt,
      };
      if (apiKey.trim()) payload.api_key = apiKey.trim();

      const response = await agentService.saveWorkspaceConfig(workspaceSlug, payload);
      setConfig((prev) => ({ ...prev, model: response.model }));
      setApiKey("");
      setApiKeySet(response.api_key_set);
      setSavedProvider(config.provider);
      await agent.fetchConfig(workspaceSlug);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Saved",
        message: "AI Agent workspace settings updated.",
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: getAgentErrorMessage(error, "Unable to save AI Agent settings."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="w-full">
      <SettingsHeading
        title={t("workspace_settings.settings.ai_agent.heading")}
        description={t("workspace_settings.settings.ai_agent.description")}
      />

      <div className="mt-6 space-y-4 rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-secondary">Provider</p>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => onProviderChange(provider.id)}
                className={`text-xs rounded-md border px-2 py-1 ${
                  config.provider === provider.id
                    ? "border-custom-primary-100 bg-custom-primary-100/10 text-custom-primary-100"
                    : "border-subtle text-secondary"
                }`}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-secondary">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              if (apiKeyError) setApiKeyError(null);
            }}
            placeholder={
              providerChanged
                ? "Enter a new API key for this provider"
                : apiKeySet
                  ? "•••••••• (leave blank to keep existing)"
                  : "sk-..."
            }
            className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
          />
          {providerChanged && (
            <p className="text-xs text-amber-600">
              Provider changed — enter a new API key for {providerDefinition?.name ?? config.provider} before saving.
            </p>
          )}
          {apiKeyError && <p className="text-xs text-red-500">{apiKeyError}</p>}
          {!apiKeySet && !providerChanged && (
            <p className="text-xs text-tertiary">
              An API key is required to send chat messages. The agent button still appears when the agent is enabled.
            </p>
          )}
        </label>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <span className="text-xs font-medium text-secondary">Model</span>
            <AgentModelSelect
              models={providerModels}
              value={selectedModel}
              onChange={(model) => setConfig((prev) => ({ ...prev, model }))}
              disabled={loading}
              className="w-full"
            />
          </div>

          <label className="space-y-1">
            <span className="text-xs font-medium text-secondary">Max steps</span>
            <input
              type="number"
              min={1}
              max={50}
              value={config.max_steps}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  max_steps: Math.max(1, Math.min(50, Number(event.target.value) || 1)),
                }))
              }
              className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-secondary">Reasoning</span>
            <select
              value={config.reasoning_level}
              onChange={(event) =>
                setConfig((prev) => ({
                  ...prev,
                  reasoning_level: event.target.value as IAgentConfig["reasoning_level"],
                }))
              }
              className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
            >
              <option value="none">none</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>

        {configurationError && (
          <p role="alert" className="text-xs text-red-500">
            {configurationError}
          </p>
        )}

        <label className="text-sm flex items-center gap-2 text-secondary">
          <input
            type="checkbox"
            checked={config.is_enabled}
            onChange={(event) => setConfig((prev) => ({ ...prev, is_enabled: event.target.checked }))}
          />
          Enable agent
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-secondary">System prompt (optional)</span>
          <textarea
            rows={4}
            value={config.system_prompt}
            onChange={(event) => setConfig((prev) => ({ ...prev, system_prompt: event.target.value }))}
            className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
          />
        </label>

        <div className="flex justify-end">
          <Button onClick={() => void onSave()} disabled={loading || saving || !selectedModel || !!configurationError}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </section>
  );
}
