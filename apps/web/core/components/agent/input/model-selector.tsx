import { observer } from "mobx-react";
import { useAgent } from "@/hooks/store/use-agent";

export const ModelSelector = observer(function ModelSelector() {
  const agent = useAgent();
  const models = agent.config?.available_models ?? [];
  if (models.length <= 1) return null;

  const selectedValue = agent.selectedModel || agent.config?.model || models[0] || "";

  return (
    <select
      value={selectedValue}
      onChange={(event) => agent.setSelectedModel(event.target.value)}
      className="text-xs h-8 rounded-md border border-subtle bg-surface-2 px-2 text-secondary"
    >
      {models.map((model) => (
        <option key={model} value={model}>
          {model}
        </option>
      ))}
    </select>
  );
});
