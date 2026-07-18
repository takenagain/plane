// helpers
import { API_BASE_URL } from "@plane/constants";
import type { IAgentConfig, IAgentChatSession, IAgentChatResponse, TAgentUIContext } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TAgentHttpError = Error & { status?: number };

export const getAgentErrorMessage = (error: unknown, fallback = "Request failed."): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    if (typeof payload.error === "string" && payload.error) return payload.error;
    if (typeof payload.detail === "string" && payload.detail) return payload.detail;
    const fieldMessages = Object.entries(payload)
      .filter(([key]) => key !== "error" && key !== "detail")
      .flatMap(([field, value]) => {
        if (Array.isArray(value)) return value.map((message) => `${field}: ${String(message)}`);
        if (typeof value === "string") return [`${field}: ${value}`];
        return [];
      });
    if (fieldMessages.length > 0) return fieldMessages.join(" ");
  }
  return fallback;
};

const toAgentHttpError = (error: unknown, fallbackMessage: string): TAgentHttpError => {
  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  const status = response?.status;
  const data = response?.data ?? error;
  const message = getAgentErrorMessage(data, fallbackMessage);
  const err = new Error(message) as TAgentHttpError;
  err.status = status;
  return err;
};

export class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getWorkspaceConfig(workspaceSlug: string): Promise<IAgentConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent/config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to load workspace AI Agent configuration.");
      });
  }

  async getEffectiveConfig(workspaceSlug: string, projectId?: string): Promise<IAgentConfig> {
    const params = projectId ? { project_id: projectId } : {};
    return this.get(`/api/workspaces/${workspaceSlug}/agent/effective-config/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to load AI Agent configuration.");
      });
  }

  async saveWorkspaceConfig(
    workspaceSlug: string,
    data: Partial<IAgentConfig> & { api_key?: string }
  ): Promise<IAgentConfig> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent/config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to save workspace AI Agent settings.");
      });
  }

  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<IAgentConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/agent/config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to load project AI Agent configuration.");
      });
  }

  async saveProjectConfig(
    workspaceSlug: string,
    projectId: string,
    data: Partial<IAgentConfig> & { api_key?: string }
  ): Promise<IAgentConfig> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/agent/config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to save project AI Agent settings.");
      });
  }

  async deleteProjectConfig(workspaceSlug: string, projectId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/agent/config/`)
      .then(() => undefined)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to remove project AI Agent override.");
      });
  }

  async listSessions(workspaceSlug: string): Promise<IAgentChatSession[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent/sessions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to load agent sessions.");
      });
  }

  async createSession(workspaceSlug: string, projectId?: string): Promise<IAgentChatSession> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent/sessions/`, { project_id: projectId ?? null })
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to create agent session.");
      });
  }

  async getSession(workspaceSlug: string, sessionId: string): Promise<IAgentChatSession> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent/sessions/${sessionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to load agent session.");
      });
  }

  async deleteSession(workspaceSlug: string, sessionId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/agent/sessions/${sessionId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to delete agent session.");
      });
  }

  async sendMessage(
    workspaceSlug: string,
    sessionId: string,
    data: {
      content: string;
      model?: string;
      project_id?: string | null;
      ui_context?: TAgentUIContext;
    }
  ): Promise<IAgentChatResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent/sessions/${sessionId}/chat/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentHttpError(error, "Unable to send message.");
      });
  }
}
