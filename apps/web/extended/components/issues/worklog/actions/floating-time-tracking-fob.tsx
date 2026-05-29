import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Play, Square } from "lucide-react";
import type { IActiveWorklog } from "@plane/types";
import { cn } from "@plane/utils";
import { formatDuration } from "@/plane-web/helpers/worklog.helpers";
import { useActiveWorklogController } from "@/plane-web/hooks/use-active-worklog-controller";
import type { TCurrentWorklogTarget } from "@/plane-web/store/worklog.store";

type TFloatingTimeTrackingFOBProps = {
  activeWorklog: IActiveWorklog | null;
  currentWorklogTarget: TCurrentWorklogTarget | null;
  totalMinutes: number;
};

export const FloatingTimeTrackingFOB = observer(function FloatingTimeTrackingFOB(props: TFloatingTimeTrackingFOBProps) {
  const { activeWorklog, currentWorklogTarget, totalMinutes } = props;
  const { formatActiveDurationCompact, formatActiveDurationFull, openTrackedWorkItem, stopTracking, startTracking } =
    useActiveWorklogController();
  const [isExpanded, setIsExpanded] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isActive = !!activeWorklog;
  const actionLabel = isActive ? "Stop" : "Start";
  const actionButtonClassName = cn(
    "focus-visible:ring-offset-surface-1 inline-flex h-10 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl border text-body-xs-medium text-on-color shadow-raised-200 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    isExpanded ? "px-3" : "w-10 px-0",
    isActive
      ? "border-danger-strong bg-danger-primary hover:bg-danger-primary-hover focus-visible:ring-danger-strong/40"
      : "border-success-strong bg-success-primary hover:bg-success-primary/90 focus-visible:ring-success-strong/40"
  );
  const displayTitle = activeWorklog?.issue_name || currentWorklogTarget?.issueName || "Current work item";
  const compactTimeText = isActive ? formatActiveDurationCompact(activeWorklog, nowTick) : formatDuration(totalMinutes);
  const fullTimeText = isActive ? formatActiveDurationFull(activeWorklog, nowTick) : formatDuration(totalMinutes);

  useEffect(() => {
    if (!activeWorklog) return;

    const intervalId = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeWorklog]);

  const handleAction = async () => {
    if (activeWorklog) {
      await stopTracking({
        workspaceSlug: activeWorklog.workspace_slug,
        projectId: activeWorklog.project,
        issueId: activeWorklog.issue,
        afterTrackingChange:
          currentWorklogTarget?.issueId === activeWorklog.issue ? currentWorklogTarget.afterTrackingChange : undefined,
      });
      return;
    }

    if (!currentWorklogTarget) return;

    await startTracking({
      workspaceSlug: currentWorklogTarget.workspaceSlug,
      projectId: currentWorklogTarget.projectId,
      issueId: currentWorklogTarget.issueId,
      issueName: currentWorklogTarget.issueName,
      afterTrackingChange: currentWorklogTarget.afterTrackingChange,
    });
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] flex justify-end px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] sm:px-6"
      data-testid="global-time-tracking-fob-root"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-[min(22rem,calc(100vw-2rem))] items-center gap-2 rounded-2xl border border-subtle bg-surface-1/95 p-2 shadow-raised-200 backdrop-blur-sm transition-all duration-200",
          isExpanded ? "pr-3" : "pr-2"
        )}
        data-testid="floating-time-tracking-fob"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        onFocusCapture={() => setIsExpanded(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsExpanded(false);
          }
        }}
      >
        <button
          type="button"
          aria-label={`${actionLabel} time tracking`}
          className={actionButtonClassName}
          data-testid="floating-time-tracking-fob-primary-button"
          onClick={() => {
            void handleAction();
          }}
        >
          {isActive ? <Square className="h-3.5 w-3.5 shrink-0" /> : <Play className="h-3.5 w-3.5 shrink-0" />}
          {isExpanded && <span data-testid="floating-time-tracking-fob-primary-label">{actionLabel}</span>}
        </button>

        <div className="min-w-0 flex-1">
          {!isExpanded && (
            <button type="button" className="flex min-w-0 items-center text-left" onClick={() => setIsExpanded(true)}>
              <span
                className="truncate text-body-sm-medium text-primary"
                data-testid="floating-time-tracking-fob-compact-time"
              >
                {compactTimeText}
              </span>
            </button>
          )}

          {isExpanded && (
            <div className="min-w-0" data-testid="floating-time-tracking-fob-expanded">
              <button
                type="button"
                className="block max-w-full truncate text-body-sm-medium text-primary hover:underline"
                data-testid="floating-time-tracking-fob-title-link"
                onClick={() => openTrackedWorkItem(activeWorklog ?? currentWorklogTarget)}
              >
                {displayTitle}
              </button>
              <span
                className="block text-caption-sm-medium text-secondary"
                data-testid="floating-time-tracking-fob-full-time"
              >
                {fullTimeText}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
