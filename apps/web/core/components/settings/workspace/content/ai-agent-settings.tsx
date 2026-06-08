import { useEffect, useMemo, useState } from "react";
import {
  AGENT_DEFAULT_MAX_STEPS,
  AGENT_PROVIDERS,
  getAgentModelsForProvider,
  getDefaultAgentModelForProvider,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentConfig } from "@plane/types";
import { useAgent } from "@/hooks/store/use-agent";
import { AgentService, getAgentErrorMessage } from "@/services/agent.service";
import { SettingsHeading } from "@/components/settings/heading";

type TProvider = (typeof AGENT_PROVIDERS)[number];

type Props = {
  workspaceSlug: string;
};

const agentService = new AgentService();

type TAgentFormConfig = {
  provider: TProvider;
  model: string;
  max_steps: number;
  reasoning_level: IAgentConfig["reasoning_level"];
  is_enabled: boolean;
  system_prompt: string;
};

const DEFAULT_CONFIG: TAgentFormConfig = {
  provider: "openai",
  model: getDefaultAgentModelForProvider("openai"),
  max_steps: AGENT_DEFAULT_MAX_STEPS,
  reasoning_level: "medium",
  is_enabled: true,
  system_prompt: "",
};

export function WorkspaceAIAgentSettings({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const agent = useAgent();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [savedProvider, setSavedProvider] = useState<TProvider>("openai");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const providerModels = useMemo(() => getAgentModelsForProvider(config.provider), [config.provider]);
  const providerChanged = config.provider !== savedProvider;

  const selectedModel = useMemo(() => {
    if (config.model && providerModels.includes(config.model)) return config.model;
    return providerModels[0] || "";
  }, [config.model, providerModels]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await agentService.getWorkspaceConfig(workspaceSlug);
      const provider = (data.provider as TProvider) ?? "openai";
      const models = getAgentModelsForProvider(provider);
      const model =
        data.model && models.includes(data.model) ? data.model : models[0] || getDefaultAgentModelForProvider(provider);

      setConfig({
        provider,
        model,
        max_steps: data.max_steps || AGENT_DEFAULT_MAX_STEPS,
        reasoning_level: data.reasoning_level ?? "medium",
        is_enabled: data.is_enabled ?? true,
        system_prompt: data.system_prompt ?? "",
      });
      setSavedProvider(provider);
      setApiKeySet(data.api_key_set);
      setApiKey("");
      setApiKeyError(null);
    } catch {
      setConfig(DEFAULT_CONFIG);
      setSavedProvider("openai");
      setApiKeySet(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, [workspaceSlug]);

  const onProviderChange = (provider: TProvider) => {
    const models = getAgentModelsForProvider(provider);
    setConfig((prev) => ({
      ...prev,
      provider,
      model: models[0] || "",
    }));
    setApiKey("");
    setApiKeyError(null);
  };

  const onSave = async () => {
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
            {AGENT_PROVIDERS.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => onProviderChange(provider)}
                className={`text-xs rounded-md border px-2 py-1 ${
                  config.provider === provider
                    ? "border-custom-primary-100 bg-custom-primary-100/10 text-custom-primary-100"
                    : "border-subtle text-secondary"
                }`}
              >
                {provider}
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
              Provider changed — enter a new API key for {config.provider} before saving.
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
          <label className="space-y-1">
            <span className="text-xs font-medium text-secondary">Model</span>
            <select
              value={selectedModel}
              onChange={(event) => setConfig((prev) => ({ ...prev, model: event.target.value }))}
              className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
            >
              {providerModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

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
          <Button onClick={() => void onSave()} disabled={loading || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </section>
  );
}
