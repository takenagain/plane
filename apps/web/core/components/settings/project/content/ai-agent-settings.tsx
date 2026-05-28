import { useEffect, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentConfig } from "@plane/types";
import { AgentService } from "@/services/agent.service";
import { SettingsHeading } from "@/components/settings/heading";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

const agentService = new AgentService();

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

  const editableConfig = projectConfig ?? workspaceConfig;

  const saveProjectConfig = async () => {
    if (!editableConfig) return;
    setSaving(true);
    try {
      const payload: Partial<IAgentConfig> & { api_key?: string } = {
        provider: editableConfig.provider,
        model: editableConfig.model,
        max_steps: editableConfig.max_steps,
        reasoning_level: editableConfig.reasoning_level,
        is_enabled: editableConfig.is_enabled,
        system_prompt: editableConfig.system_prompt,
      };
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      await agentService.saveProjectConfig(workspaceSlug, projectId, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Saved",
        message: "Project AI Agent settings updated.",
      });
      setApiKey("");
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Unable to save project AI Agent settings.",
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
            onChange={(event) => setUseWorkspaceConfig(event.target.checked)}
          />
          Use workspace configuration
        </label>

        {!useWorkspaceConfig && editableConfig && (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-secondary">Model</span>
              <select
                value={editableConfig.model}
                onChange={(event) => setProjectConfig((prev) => (prev ? { ...prev, model: event.target.value } : prev))}
                className="text-sm w-full rounded-md border border-subtle bg-surface-2 px-2 py-1.5"
              >
                {(editableConfig.available_models ?? []).map((model) => (
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
