import type { IAgentConfig, IAgentModel } from "@plane/types";

export const getAgentModelConfigurationError = (
  model: IAgentModel | undefined,
  reasoningLevel: IAgentConfig["reasoning_level"]
): string | null => {
  if (!model || reasoningLevel === "none" || model.supports_reasoning_with_tools) return null;

  return `${model.name} does not support reasoning together with the function tools used by Plane. Set Reasoning to none or choose another model.`;
};
