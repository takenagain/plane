import { useEffect, useMemo, useState } from "react";
import {
  AGENT_DEFAULT_MAX_STEPS,
  AGENT_PROVIDERS,
  getAgentModelsForProvider,
  getDefaultAgentModelForProvider,
} from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentConfig } from "@plane/types";
import { AgentService, getAgentErrorMessage } from "@/services/agent.service";
import { SettingsHeading } from "@/components/settings/heading";

type TProvider = (typeof AGENT_PROVIDERS)[number];

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const agentService = new AgentService();

const createOverrideFromWorkspace = (workspaceConfig: IAgentConfig): IAgentConfig => {
  const provider = (workspaceConfig.provider as TProvider) ?? "openai";
  const models = getAgentModelsForProvider(provider);
  const model =
    workspaceConfig.model && models.includes(workspaceConfig.model)
      ? workspaceConfig.model
      : models[0] || getDefaultAgentModelForProvider(provider);

  return {
    ...workspaceConfig,
    provider,
    model,
    max_steps: workspaceConfig.max_steps || AGENT_DEFAULT_MAX_STEPS,
    available_models: models,
  };
};

function WorkspaceConfigSummary({ config }: { config: IAgentConfig }) {
  return (
    <div className="text-sm space-y-2 rounded-md border border-subtle bg-surface-2 p-3 text-secondary">
      <p className="text-xs font-medium text-tertiary">Inherited workspace configuration</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <dt className="text-xs text-tertiary">Provider</dt>
          <dd>{config.provider}</dd>
        </div>
        <div>
          <dt className="text-xs text-tertiary">Model</dt>
          <dd>{config.model}</dd>
        </div>
        <div>
          <dt className="text-xs text-tertiary">API key</dt>
          <dd>{config.api_key_set ? "Configured" : "Not set"}</dd>
        </div>
        <div>
          <dt className="text-xs text-tertiary">Agent</dt>
          <dd>{config.is_enabled ? "Enabled" : "Disabled"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ProjectAIAgentSettings({ workspaceSlug, projectId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [useWorkspaceConfig, setUseWorkspaceConfig] = useState(true);
  const [workspaceConfig, setWorkspaceConfig] = useState<IAgentConfig | null>(null);
  const [projectConfig, setProjectConfig] = useState<IAgentConfig | null>(null);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [wsConfig, prConfig] = await Promise.all([
          agentService.getWorkspaceConfig(workspaceSlug).catch(() => null),
          agentService.getProjectConfig(workspaceSlug, projectId).catch(() => null),
        ]);
        setWorkspaceConfig(wsConfig);
        setProjectConfig(prConfig);
        setUseWorkspaceConfig(!prConfig);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [workspaceSlug, projectId]);

  const editableConfig = projectConfig;
  const providerModels = useMemo(
    () => (editableConfig ? getAgentModelsForProvider(editableConfig.provider as TProvider) : []),
    [editableConfig?.provider]
  );

  const selectedModel = useMemo(() => {
    if (!editableConfig) return "";
    if (editableConfig.model && providerModels.includes(editableConfig.model)) return editableConfig.model;
    return providerModels[0] || "";
  }, [editableConfig, providerModels]);

  const onProviderChange = (provider: TProvider) => {
    const models = getAgentModelsForProvider(provider);
    setProjectConfig((prev) =>
      prev
        ? {
            ...prev,
            provider,
            model: models[0] || "",
            available_models: models,
          }
        : prev
    );
    setApiKey("");
  };

  const onToggleUseWorkspaceConfig = async (checked: boolean) => {
    if (checked) {
      if (projectConfig) {
        setSaving(true);
        try {
          await agentService.deleteProjectConfig(workspaceSlug, projectId);
          setProjectConfig(null);
          setApiKey("");
          setUseWorkspaceConfig(true);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "Saved",
            message: "Project now uses workspace AI Agent configuration.",
          });
        } catch (error) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error",
            message: getAgentErrorMessage(error, "Unable to remove project AI Agent override."),
          });
        } finally {
          setSaving(false);
        }
        return;
      }
      setUseWorkspaceConfig(true);
      return;
    }

    setUseWorkspaceConfig(false);
    if (!projectConfig && workspaceConfig) {
      setProjectConfig(createOverrideFromWorkspace(workspaceConfig));
    }
  };

  const saveProjectConfig = async () => {
    if (!editableConfig) return;
    setSaving(true);
    try {
      const payload: Partial<IAgentConfig> & { api_key?: string } = {
        provider: editableConfig.provider,
        model: selectedModel,
        max_steps: editableConfig.max_steps,
        reasoning_level: editableConfig.reasoning_level,
        is_enabled: editableConfig.is_enabled,
        system_prompt: editableConfig.system_prompt,
      };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      const saved = await agentService.saveProjectConfig(workspaceSlug, projectId, payload);
      setProjectConfig(saved);
      setUseWorkspaceConfig(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Saved",
        message: "Project AI Agent settings updated.",
      });
      setApiKey("");
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: getAgentErrorMessage(error, "Unable to save project AI Agent settings."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="w-full">
      <SettingsHeading
        title="AI Agent"
        description="Project-level AI Agent configuration. You can inherit workspace settings or override for this project."
      />
      <div className="mt-6 space-y-4 rounded-lg border border-subtle bg-surface-1 p-4">
        <label className="text-sm flex items-center gap-2 text-secondary">
          <input
            type="checkbox"
            checked={useWorkspaceConfig}
            disabled={loading || saving}
            onChange={(event) => void onToggleUseWorkspaceConfig(event.target.checked)}
          />
          Use workspace configuration
        </label>

        {useWorkspaceConfig && workspaceConfig && <WorkspaceConfigSummary config={workspaceConfig} />}

        {!useWorkspaceConfig && editableConfig && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium text-secondary">Provider</p>
              <div className="flex flex-wrap gap-2">
                {AGENT_PROVIDERS.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => onProviderChange(provider)}
                    className={`text-xs rounded-md border px-2 py-1 ${
                      editableConfig.provider === provider
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
              <span className="text-xs font-medium text-secondary">Model</span>
              <select
                value={selectedModel}
                onChange={(event) => setProjectConfig((prev) => (prev ? { ...prev, model: event.target.value } : prev))}
                className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
              >
                {providerModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-secondary">Max steps</span>
              <input
                type="number"
                min={1}
                max={50}
                value={editableConfig.max_steps}
                onChange={(event) =>
                  setProjectConfig((prev) =>
                    prev ? { ...prev, max_steps: Math.max(1, Math.min(50, Number(event.target.value) || 1)) } : prev
                  )
                }
                className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-secondary">Reasoning</span>
              <select
                value={editableConfig.reasoning_level}
                onChange={(event) =>
                  setProjectConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          reasoning_level: event.target.value as "none" | "low" | "medium" | "high",
                        }
                      : prev
                  )
                }
                className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
              >
                <option value="none">none</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-secondary">API key (optional override)</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={editableConfig.api_key_set ? "•••••••• (leave blank to keep existing)" : "sk-..."}
                className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
              />
            </label>
            <label className="text-sm flex items-center gap-2 text-secondary">
              <input
                type="checkbox"
                checked={editableConfig.is_enabled}
                onChange={(event) =>
                  setProjectConfig((prev) => (prev ? { ...prev, is_enabled: event.target.checked } : prev))
                }
              />
              Enable agent
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-secondary">System prompt (optional)</span>
              <textarea
                rows={4}
                value={editableConfig.system_prompt}
                onChange={(event) =>
                  setProjectConfig((prev) => (prev ? { ...prev, system_prompt: event.target.value } : prev))
                }
                className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
              />
            </label>
            <div className="flex justify-end">
              <Button onClick={() => void saveProjectConfig()} disabled={loading || saving}>
                {saving ? "Saving..." : "Save override"}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
