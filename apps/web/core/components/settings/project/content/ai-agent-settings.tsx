import { useEffect, useMemo, useState } from "react";
import { AGENT_DEFAULT_MAX_STEPS } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentConfig, IAgentProvider } from "@plane/types";
import { AgentModelSelect } from "@/components/agent/model-select";
import { AgentService, getAgentErrorMessage, type TAgentHttpError } from "@/services/agent.service";
import { SettingsHeading } from "@/components/settings/heading";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const agentService = new AgentService();

const getOptionalConfig = async (request: Promise<IAgentConfig>): Promise<IAgentConfig | null> => {
  try {
    return await request;
  } catch (error) {
    if ((error as TAgentHttpError).status === 404) return null;
    throw error;
  }
};

const applyProviderCatalog = (config: IAgentConfig, providers: IAgentProvider[]): IAgentConfig => {
  const provider = providers.find((item) => item.id === config.provider) ?? providers[0];
  if (!provider) return config;

  const model = provider.models.some((item) => item.id === config.model) ? config.model : provider.default_model;

  return {
    ...config,
    provider: provider.id,
    model,
    default_model: provider.default_model,
    available_models: provider.models.map((item) => item.id),
    available_model_details: provider.models,
  };
};

const createDefaultOverride = (providers: IAgentProvider[]): IAgentConfig | null => {
  const provider = providers[0];
  if (!provider) return null;

  return {
    id: "",
    provider: provider.id,
    api_key_set: false,
    model: provider.default_model,
    default_model: provider.default_model,
    max_steps: AGENT_DEFAULT_MAX_STEPS,
    reasoning_level: "medium",
    is_enabled: true,
    system_prompt: "",
    available_models: provider.models.map((item) => item.id),
    available_model_details: provider.models,
  };
};

const createOverrideFromWorkspace = (workspaceConfig: IAgentConfig, providers: IAgentProvider[]): IAgentConfig => ({
  ...applyProviderCatalog(workspaceConfig, providers),
  id: "",
  api_key_set: false,
});

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
          <dd>{config.available_model_details.find((model) => model.id === config.model)?.name ?? config.model}</dd>
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
  const [providers, setProviders] = useState<IAgentProvider[]>([]);
  const [useWorkspaceConfig, setUseWorkspaceConfig] = useState(true);
  const [workspaceConfig, setWorkspaceConfig] = useState<IAgentConfig | null>(null);
  const [projectConfig, setProjectConfig] = useState<IAgentConfig | null>(null);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [catalog, workspaceData, projectData] = await Promise.all([
          agentService.getProviderCatalog(workspaceSlug),
          getOptionalConfig(agentService.getWorkspaceConfig(workspaceSlug)),
          getOptionalConfig(agentService.getProjectConfig(workspaceSlug, projectId)),
        ]);

        setProviders(catalog);
        setWorkspaceConfig(workspaceData ? applyProviderCatalog(workspaceData, catalog) : null);
        setProjectConfig(projectData ? applyProviderCatalog(projectData, catalog) : null);
        setUseWorkspaceConfig(!projectData);
      } catch (error) {
        setProviders([]);
        setWorkspaceConfig(null);
        setProjectConfig(null);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error",
          message: getAgentErrorMessage(error, "Unable to load project AI Agent settings."),
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [workspaceSlug, projectId]);

  const editableConfig = projectConfig;
  const providerDefinition = useMemo(
    () => providers.find((provider) => provider.id === editableConfig?.provider),
    [editableConfig?.provider, providers]
  );
  const providerModels = providerDefinition?.models ?? [];

  const selectedModel = useMemo(() => {
    if (!editableConfig) return "";
    if (editableConfig.model && providerModels.some((model) => model.id === editableConfig.model)) {
      return editableConfig.model;
    }
    return providerDefinition?.default_model ?? providerModels[0]?.id ?? "";
  }, [editableConfig, providerDefinition, providerModels]);

  const onProviderChange = (providerId: string) => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider || editableConfig?.provider === providerId) return;

    setProjectConfig((prev) =>
      prev
        ? {
            ...prev,
            provider: provider.id,
            model: provider.default_model,
            default_model: provider.default_model,
            api_key_set: false,
            available_models: provider.models.map((item) => item.id),
            available_model_details: provider.models,
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
    if (!projectConfig) {
      setProjectConfig(
        workspaceConfig ? createOverrideFromWorkspace(workspaceConfig, providers) : createDefaultOverride(providers)
      );
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
      setProjectConfig(applyProviderCatalog(saved, providers));
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
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => onProviderChange(provider.id)}
                    className={`text-xs rounded-md border px-2 py-1 ${
                      editableConfig.provider === provider.id
                        ? "border-custom-primary-100 bg-custom-primary-100/10 text-custom-primary-100"
                        : "border-subtle text-secondary"
                    }`}
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-secondary">Model</span>
              <AgentModelSelect
                models={providerModels}
                value={selectedModel}
                onChange={(model) => setProjectConfig((prev) => (prev ? { ...prev, model } : prev))}
                disabled={loading}
                className="w-full"
              />
            </div>
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
              <span className="text-xs font-medium text-secondary">
                {editableConfig.api_key_set ? "API key (optional replacement)" : "API key (required)"}
              </span>
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
              <Button
                onClick={() => void saveProjectConfig()}
                disabled={loading || saving || !selectedModel || (!editableConfig.api_key_set && !apiKey.trim())}
              >
                {saving ? "Saving..." : "Save override"}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
