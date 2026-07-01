import { API_BASE_URL } from "@plane/constants";
import type {
  IUserTimeAnalyticsChartsParams,
  IUserTimeAnalyticsChartsResponse,
  IUserTimeAnalyticsCommentSignal,
  IUserTimeAnalyticsRankings,
  IUserTimeAnalyticsSummary,
  IUserTimeAnalyticsWorklogItem,
  TProfileTimeRankingDimension,
} from "@plane/types";
import { APIService } from "@/services/api.service";

type TProfileTimeAnalyticsQuery = {
  date_filter?: string;
  project_ids?: string;
  start_date?: string;
  end_date?: string;
};

/**
 * Client for workspace user time analytics (Your work → Hours logged tab).
 * Endpoints are implemented in WP-01; methods throw until backend is available.
 */
export class ProfileTimeAnalyticsService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private basePath(workspaceSlug: string, userId: string) {
    return `/api/workspaces/${workspaceSlug}/user-time-analytics/${userId}`;
  }

  async getSummary(
    workspaceSlug: string,
    userId: string,
    params?: TProfileTimeAnalyticsQuery
  ): Promise<IUserTimeAnalyticsSummary> {
    return this.get(`${this.basePath(workspaceSlug, userId)}/summary/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }

  async getCharts(
    workspaceSlug: string,
    userId: string,
    params: IUserTimeAnalyticsChartsParams & TProfileTimeAnalyticsQuery
  ): Promise<IUserTimeAnalyticsChartsResponse> {
    return this.get(`${this.basePath(workspaceSlug, userId)}/charts/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }

  async getRankings(
    workspaceSlug: string,
    userId: string,
    dimension: TProfileTimeRankingDimension,
    params?: TProfileTimeAnalyticsQuery & { limit?: number }
  ): Promise<IUserTimeAnalyticsRankings> {
    return this.get(`${this.basePath(workspaceSlug, userId)}/rankings/`, {
      params: { ...params, dimension },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }

  async getWorklogs(
    workspaceSlug: string,
    userId: string,
    params?: TProfileTimeAnalyticsQuery & { per_page?: number; cursor?: string }
  ): Promise<{ results: IUserTimeAnalyticsWorklogItem[]; next_cursor?: string }> {
    return this.get(`${this.basePath(workspaceSlug, userId)}/worklogs/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }

  async getCommentSignals(
    workspaceSlug: string,
    userId: string,
    params?: TProfileTimeAnalyticsQuery & { limit?: number }
  ): Promise<{ results: IUserTimeAnalyticsCommentSignal[] }> {
    return this.get(`${this.basePath(workspaceSlug, userId)}/comment-signals/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }

  async exportCsv(workspaceSlug: string, userId: string, params?: TProfileTimeAnalyticsQuery): Promise<Blob> {
    return this.get(`${this.basePath(workspaceSlug, userId)}/export/`, {
      params,
      responseType: "blob",
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }
}
