import { AGENT_DEFAULT_MAX_STEPS, getAgentModelsForProvider, getDefaultAgentModelForProvider } from "@plane/constants";
import { action, makeObservable, observable, runInAction } from "mobx";
import type { IAgentChatMessage, IAgentChatSession, IAgentConfig } from "@plane/types";
import { AgentService, type TAgentHttpError } from "@/services/agent.service";

const agentService = new AgentService();

const getDisabledAgentConfig = (): IAgentConfig => ({
  id: "",
  provider: "openai",
  api_key_set: false,
  model: getDefaultAgentModelForProvider("openai"),
  max_steps: AGENT_DEFAULT_MAX_STEPS,
  reasoning_level: "medium",
  is_enabled: false,
  system_prompt: "",
  available_models: getAgentModelsForProvider("openai"),
});

export interface IAgentStore {
  isOpen: boolean;
  isLoading: boolean;
  config: IAgentConfig | null;
  sessions: IAgentChatSession[];
  activeSessionId: string | null;
  activeSessionMessages: IAgentChatMessage[];
  selectedModel: string;
  unreadCount: number;
  error: string | null;
  showSessionList: boolean;
  toggleChatWindow: () => void;
  openChatWindow: () => void;
  closeChatWindow: () => void;
  toggleSessionList: () => void;
  fetchConfig: (workspaceSlug: string, projectId?: string) => Promise<void>;
  fetchEffectiveConfig: (workspaceSlug: string, projectId?: string) => Promise<void>;
  fetchSessions: (workspaceSlug: string) => Promise<void>;
  loadSession: (workspaceSlug: string, sessionId: string) => Promise<void>;
  createSession: (workspaceSlug: string, projectId?: string) => Promise<IAgentChatSession>;
  sendMessage: (workspaceSlug: string, content: string, projectId?: string) => Promise<void>;
  setSelectedModel: (model: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  setActiveMessages: (messages: IAgentChatMessage[]) => void;
  clearError: () => void;
}

export class AgentStore implements IAgentStore {
  isOpen = false;
  isLoading = false;
  config: IAgentConfig | null = null;
  sessions: IAgentChatSession[] = [];
  activeSessionId: string | null = null;
  activeSessionMessages: IAgentChatMessage[] = [];
  selectedModel = "";
  unreadCount = 0;
  error: string | null = null;
  showSessionList = false;

  constructor() {
    makeObservable(this, {
      isOpen: observable,
      isLoading: observable,
      config: observable,
      sessions: observable,
      activeSessionId: observable,
      activeSessionMessages: observable,
      selectedModel: observable,
      unreadCount: observable,
      error: observable,
      showSessionList: observable,
      toggleChatWindow: action,
      openChatWindow: action,
      closeChatWindow: action,
      toggleSessionList: action,
      fetchConfig: action,
      fetchEffectiveConfig: action,
      fetchSessions: action,
      loadSession: action,
      createSession: action,
      sendMessage: action,
      setSelectedModel: action,
      setActiveSession: action,
      setActiveMessages: action,
      clearError: action,
    });
  }

  toggleChatWindow = () => {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.unreadCount = 0;
      this.error = null;
    }
  };

  openChatWindow = () => {
    this.isOpen = true;
    this.unreadCount = 0;
    this.error = null;
  };

  closeChatWindow = () => {
    this.isOpen = false;
  };

  toggleSessionList = () => {
    this.showSessionList = !this.showSessionList;
  };

  private applyConfig = (config: IAgentConfig) => {
    runInAction(() => {
      this.config = config;
      if (config.model) {
        this.selectedModel = config.model;
      } else if (!this.selectedModel) {
        this.selectedModel = getDefaultAgentModelForProvider(config.provider);
      }
      this.error = null;
    });
  };

  private handleConfigFetchError = (error: unknown) => {
    const status = (error as TAgentHttpError).status;
    const message = error instanceof Error ? error.message : "Unable to load agent configuration.";

    if (status === 404) {
      runInAction(() => {
        this.config = getDisabledAgentConfig();
        this.error = null;
      });
      return;
    }

    runInAction(() => {
      this.error = message;
      if (!status || status < 500) {
        if (!this.config) {
          this.config = getDisabledAgentConfig();
        }
      }
    });
  };

  fetchConfig = async (workspaceSlug: string, projectId?: string) => {
    try {
      const config = await agentService.getEffectiveConfig(workspaceSlug, projectId);
      this.applyConfig(config);
    } catch (error) {
      this.handleConfigFetchError(error);
    }
  };

  fetchEffectiveConfig = async (workspaceSlug: string, projectId?: string) => {
    try {
      const config = await agentService.getEffectiveConfig(workspaceSlug, projectId);
      this.applyConfig(config);
    } catch (error) {
      this.handleConfigFetchError(error);
    }
  };

  fetchSessions = async (workspaceSlug: string) => {
    try {
      const sessions = await agentService.listSessions(workspaceSlug);
      runInAction(() => {
        this.sessions = sessions;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load sessions.";
      runInAction(() => {
        this.error = message;
      });
    }
  };

  loadSession = async (workspaceSlug: string, sessionId: string) => {
    this.isLoading = true;
    this.error = null;
    try {
      const data = await agentService.getSession(workspaceSlug, sessionId);
      runInAction(() => {
        this.activeSessionId = sessionId;
        this.activeSessionMessages = data.messages ?? [];
        if (data.selected_model) {
          this.selectedModel = data.selected_model;
        } else if (this.config?.model) {
          this.selectedModel = this.config.model;
        }
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  };

  createSession = async (workspaceSlug: string, projectId?: string) => {
    const session = await agentService.createSession(workspaceSlug, projectId);
    runInAction(() => {
      this.sessions = [session, ...this.sessions.filter((s) => s.id !== session.id)];
      this.activeSessionId = session.id;
      this.activeSessionMessages = [];
      this.error = null;
    });
    return session;
  };

  sendMessage = async (workspaceSlug: string, content: string, projectId?: string) => {
    if (!content.trim()) return;
    this.error = null;
    if (!this.activeSessionId) {
      await this.createSession(workspaceSlug, projectId);
    }

    const sessionId = this.activeSessionId as string;
    const model = this.selectedModel || this.config?.model || undefined;

    const optimisticMsg: IAgentChatMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    runInAction(() => {
      this.activeSessionMessages = [...this.activeSessionMessages, optimisticMsg];
      this.isLoading = true;
    });

    try {
      const response = await agentService.sendMessage(workspaceSlug, sessionId, {
        content,
        model,
        project_id: projectId,
      });

      runInAction(() => {
        const withoutOptimistic = this.activeSessionMessages.filter((m) => m.id !== optimisticMsg.id);
        const existingIds = new Set(withoutOptimistic.map((m) => m.id));
        const incoming = response.messages.filter((m) => !existingIds.has(m.id));
        this.activeSessionMessages = [...withoutOptimistic, ...incoming];
        if (!this.isOpen) {
          this.unreadCount += response.messages.filter((m) => m.role === "assistant").length;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send message.";
      runInAction(() => {
        this.error = message;
      });
      try {
        await this.loadSession(workspaceSlug, sessionId);
      } catch {
        runInAction(() => {
          this.activeSessionMessages = this.activeSessionMessages.filter((m) => m.id !== optimisticMsg.id);
        });
      }
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  };

  setSelectedModel = (model: string) => {
    this.selectedModel = model;
  };

  setActiveSession = (sessionId: string | null) => {
    this.activeSessionId = sessionId;
  };

  setActiveMessages = (messages: IAgentChatMessage[]) => {
    this.activeSessionMessages = messages;
  };

  clearError = () => {
    this.error = null;
  };
}
