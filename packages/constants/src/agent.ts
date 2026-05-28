/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Keep in sync with apps/api/plane/app/views/external/base.py provider model lists. */
export const AGENT_PROVIDERS = ["openai", "anthropic", "gemini", "mistral"] as const;

export type TAgentProvider = (typeof AGENT_PROVIDERS)[number];

/** Default agentic loop step limit for new configurations. */
export const AGENT_DEFAULT_MAX_STEPS = 25;

/**
 * Current mainline models per provider (no deprecated prior generations).
 * @see https://developers.openai.com/api/docs/models/gpt-5.5
 * @see https://docs.anthropic.com/en/docs/about-claude/models/overview
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://docs.mistral.ai/getting-started/models/models_overview
 */
export const AGENT_PROVIDER_MODELS: Record<TAgentProvider, readonly string[]> = {
  openai: ["gpt-5.5", "gpt-5.5-mini", "gpt-5.5-nano", "gpt-5.5-pro"],
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  gemini: ["gemini-3.5-flash", "gemini-3.1-pro-preview"],
  mistral: ["mistral-medium-3.5", "mistral-small-4", "mistral-large-3-2512"],
};

export const getAgentModelsForProvider = (provider: string): string[] => {
  const models = AGENT_PROVIDER_MODELS[provider as TAgentProvider];
  return models ? [...models] : [...AGENT_PROVIDER_MODELS.openai];
};

export const getDefaultAgentModelForProvider = (provider: string): string =>
  getAgentModelsForProvider(provider)[0] ?? "";
