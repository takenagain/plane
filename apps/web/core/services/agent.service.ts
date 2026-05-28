// helpers
import { API_BASE_URL } from "@plane/constants";
import type { IAgentConfig, IAgentChatSession, IAgentChatResponse } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

const toAgentServiceError = (error: unknown): Error => {
  const data = (error as { response?: { data?: unknown } })?.response?.data ?? error;
  if (typeof data === "string" && data) return new Error(data);
  if (data && typeof data === "object") {
    const payload = data as { error?: string; detail?: string };
    if (payload.error) return new Error(payload.error);
    if (payload.detail) return new Error(payload.detail);
  }
  return new Error("Unable to send message.");
};

export class AgentService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getWorkspaceConfig(workspaceSlug: string): Promise<IAgentConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent/config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async saveWorkspaceConfig(
    workspaceSlug: string,
    data: Partial<IAgentConfig> & { api_key?: string }
  ): Promise<IAgentConfig> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent/config/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectConfig(workspaceSlug: string, projectId: string): Promise<IAgentConfig> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/agent/config/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
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
        throw error?.response?.data;
      });
  }

  async listSessions(workspaceSlug: string): Promise<IAgentChatSession[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent/sessions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createSession(workspaceSlug: string, projectId?: string): Promise<IAgentChatSession> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent/sessions/`, { project_id: projectId ?? null })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getSession(workspaceSlug: string, sessionId: string): Promise<IAgentChatSession> {
    return this.get(`/api/workspaces/${workspaceSlug}/agent/sessions/${sessionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteSession(workspaceSlug: string, sessionId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/agent/sessions/${sessionId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async sendMessage(
    workspaceSlug: string,
    sessionId: string,
    data: { content: string; model?: string; project_id?: string | null }
  ): Promise<IAgentChatResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/agent/sessions/${sessionId}/chat/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw toAgentServiceError(error);
      });
  }
}
