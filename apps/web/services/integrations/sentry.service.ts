import { API_BASE_URL } from "@plane/constants";
import type { ISentryConnection, ISentryProjectMapping } from "@plane/types";
import { APIService } from "@/services/api.service";

export class SentryIntegrationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getConnection(workspaceSlug: string): Promise<ISentryConnection> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/sentry/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getInstallUrl(workspaceSlug: string): Promise<{ auth_url: string }> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/sentry/install/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async disconnect(workspaceSlug: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/integrations/sentry/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getMappings(workspaceSlug: string): Promise<ISentryProjectMapping[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/sentry/mappings/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createMapping(
    workspaceSlug: string,
    data: {
      project: string;
      sentry_project_slug: string;
      unresolved_state: string;
      resolved_state: string;
    }
  ): Promise<ISentryProjectMapping> {
    return this.post(`/api/workspaces/${workspaceSlug}/integrations/sentry/mappings/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteMapping(workspaceSlug: string, mappingId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/integrations/sentry/mappings/${mappingId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
