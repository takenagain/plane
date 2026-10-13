import { useEffect, useRef } from "react";
import { API_BASE_URL } from "@plane/constants";
import type { IWorklogTimerEvent } from "@plane/types";

const POLL_INTERVAL_MS = 60_000;

function buildWebSocketUrl(workspaceSlug: string, userId: string): string {
  const base = API_BASE_URL?.trim() || (typeof window !== "undefined" ? window.location.origin : "");
  const parsed = new URL(base);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = `/ws/workspaces/${workspaceSlug}/user-time-analytics/${userId}/`;
  parsed.search = "";
  return parsed.toString();
}

type TUseProfileTimeAnalyticsRealtimeArgs = {
  workspaceSlug: string;
  userId: string;
  enabled?: boolean;
  onEvent: (event: IWorklogTimerEvent) => void;
};

export function useProfileTimeAnalyticsRealtime({
  workspaceSlug,
  userId,
  enabled = true,
  onEvent,
}: TUseProfileTimeAnalyticsRealtimeArgs) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !workspaceSlug || !userId) return;

    let socket: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        onEventRef.current({
          type: "worklog_timer_tick",
          actor_id: userId,
          active_timer_count: 0,
          elapsed_minutes: 0,
        });
      }, POLL_INTERVAL_MS);
    };

    try {
      socket = new WebSocket(buildWebSocketUrl(workspaceSlug, userId));
      socket.addEventListener("message", (message) => {
        try {
          const payload = JSON.parse(message.data) as IWorklogTimerEvent;
          if (payload?.type) onEventRef.current(payload);
        } catch {
          // ignore malformed payloads
        }
      });
      socket.addEventListener("error", () => {
        socket?.close();
        startPolling();
      });
      socket.addEventListener("close", () => {
        if (!closed) startPolling();
      });
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      socket?.close();
    };
  }, [enabled, workspaceSlug, userId]);
}
