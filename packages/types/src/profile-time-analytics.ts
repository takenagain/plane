import type { IChartResponse } from "./analytics";

export type TProfileTimeRankingDimension = "project" | "module" | "cycle" | "work_item";

export interface IProfileTimeAnalyticsPeriod {
  start: string;
  end: string;
}

export interface IUserTimeAnalyticsSummary {
  total_hours: number;
  previous_period_hours: number;
  delta_percent: number | null;
  worklog_count: number;
  active_timer_count: number;
  avg_hours_per_day: number;
  period: IProfileTimeAnalyticsPeriod;
  previous_period: IProfileTimeAnalyticsPeriod | null;
}

export interface IProfileTimeRankingItem {
  id: string;
  name: string;
  hours: number;
  percent_of_total: number;
  meta?: {
    project_id?: string;
    identifier?: string;
  };
}

export interface IUserTimeAnalyticsRankings {
  dimension: TProfileTimeRankingDimension;
  items: IProfileTimeRankingItem[];
}

export interface IUserTimeAnalyticsWorklogItem {
  id: string;
  logged_at: string;
  duration: number;
  description: string;
  issue: {
    id: string;
    name: string;
    identifier?: string;
  };
  project: {
    id: string;
    name: string;
  };
}

export interface IUserTimeAnalyticsCommentSignal {
  issue_id: string;
  issue_name: string;
  issue_identifier?: string;
  project_id: string;
  project_name: string;
  comment_excerpt: string;
  comment_created_at: string;
  comment_actor_name: string;
  matched_keywords: string[];
  hours_logged_in_period: number;
}

export interface IUserTimeAnalyticsChartsParams {
  x_axis: string;
  y_axis: string;
  group_by?: string;
  date_filter?: string;
  project_ids?: string;
}

export type IUserTimeAnalyticsChartsResponse = IChartResponse;

export type TWorklogTimerEventType = "worklog_timer_started" | "worklog_timer_stopped" | "worklog_timer_tick";

export interface IWorklogTimerEventBase {
  type: TWorklogTimerEventType;
  actor_id: string;
}

export interface IWorklogTimerStartedEvent extends IWorklogTimerEventBase {
  type: "worklog_timer_started";
  worklog_id: string;
  issue_id: string;
  created_at: string;
}

export interface IWorklogTimerStoppedEvent extends IWorklogTimerEventBase {
  type: "worklog_timer_stopped";
  worklog_id: string;
  issue_id: string;
  duration: number;
}

export interface IWorklogTimerTickEvent extends IWorklogTimerEventBase {
  type: "worklog_timer_tick";
  active_timer_count: number;
  elapsed_minutes: number;
}

export type IWorklogTimerEvent = IWorklogTimerStartedEvent | IWorklogTimerStoppedEvent | IWorklogTimerTickEvent;
