import { observer } from "mobx-react";
import { useAgent } from "@/hooks/store/use-agent";
import { AgentModelSelect } from "../model-select";

export const ModelSelector = observer(function ModelSelector() {
  const agent = useAgent();
  const models = agent.config?.available_model_details ?? [];
  if (models.length < 1) return null;

  const selectedValue = agent.selectedModel || agent.config?.model || models[0]?.id || "";

  return (
    <AgentModelSelect compact models={models} value={selectedValue} onChange={agent.setSelectedModel} className="h-8" />
  );
});
