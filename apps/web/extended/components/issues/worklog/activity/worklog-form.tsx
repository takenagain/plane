import { useState, useCallback, useContext } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
// store
import { StoreContext } from "@/lib/store-context";
// helpers
import { parseDuration } from "@/plane-web/helpers/worklog.helpers";
// types
import type { IWorklog } from "@plane/types";

type TWorklogForm = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  onClose: () => void;
  existingWorklog?: IWorklog;
};

export const WorklogForm = observer(function WorklogForm(props: TWorklogForm) {
  const { workspaceSlug, projectId, issueId, onClose, existingWorklog } = props;
  const rootStore = useContext(StoreContext);
  const worklogStore = (rootStore as any).worklogStore;

  // Pre-populate from existing worklog if in edit mode
  const initialHours = existingWorklog ? Math.floor(existingWorklog.duration / 60) : 0;
  const initialMinutes = existingWorklog ? existingWorklog.duration % 60 : 0;
  const initialDate = existingWorklog ? existingWorklog.logged_at : new Date().toISOString().split("T")[0];
  const initialDescription = existingWorklog ? existingWorklog.description : "";

  const [hours, setHours] = useState<string>(String(initialHours));
  const [minutes, setMinutes] = useState<string>(String(initialMinutes));
  const [loggedAt, setLoggedAt] = useState<string>(initialDate);
  const [description, setDescription] = useState<string>(initialDescription);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!existingWorklog;
  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const parsedHours = parseInt(hours || "0", 10);
      const parsedMinutes = parseInt(minutes || "0", 10);
      const totalDuration = parseDuration(parsedHours, parsedMinutes);

      if (isNaN(totalDuration)) {
        setError("Please enter valid hours (≥0) and minutes (0-59).");
        return;
      }
      if (totalDuration < 1) {
        setError("Duration must be at least 1 minute.");
        return;
      }
      if (totalDuration > 99999) {
        setError("Duration cannot exceed 99,999 minutes.");
        return;
      }
      if (loggedAt > today) {
        setError("Date cannot be in the future.");
        return;
      }

      setIsSubmitting(true);
      try {
        if (isEditMode && existingWorklog) {
          await worklogStore.updateWorklog(workspaceSlug, projectId, issueId, existingWorklog.id, {
            duration: totalDuration,
            logged_at: loggedAt,
            description: description.trim(),
          });
        } else {
          await worklogStore.createWorklog(workspaceSlug, projectId, issueId, {
            duration: totalDuration,
            logged_at: loggedAt,
            description: description.trim() || undefined,
          });
        }
        onClose();
      } catch (err: unknown) {
        let message = "Failed to save worklog. Please try again.";
        try {
          const errorData = err && typeof err === "object" && "data" in err ? (err as any).data : null;
          if (errorData && typeof errorData === "object") {
            const keys = Object.keys(errorData);
            const parts: string[] = [];
            for (let i = 0; i < keys.length; i++) {
              const val = errorData[keys[i]];
              if (Array.isArray(val)) {
                parts.push(val.join(" "));
              } else if (typeof val === "string") {
                parts.push(val);
              }
            }
            if (parts.length > 0) message = parts.join(" ");
          }
        } catch {
          // keep default message
        }
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      hours,
      minutes,
      loggedAt,
      description,
      today,
      isEditMode,
      existingWorklog,
      worklogStore,
      workspaceSlug,
      projectId,
      issueId,
      onClose,
    ]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-subtle bg-layer-1 p-4">
      <div className="flex items-center justify-between">
        <span className="text-body-sm-medium text-primary">{isEditMode ? "Edit Worklog" : "Log Time"}</span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center rounded p-0.5 text-secondary transition-colors hover:bg-layer-3 hover:text-primary"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Duration inputs */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-body-xs-regular text-tertiary">Duration</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={1666}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="focus:border-primary w-16 rounded border border-subtle bg-layer-2 px-2 py-1.5 text-body-xs-regular text-primary focus:outline-none"
            placeholder="0"
            aria-label="Hours"
          />
          <span className="text-body-xs-regular text-tertiary">h</span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="focus:border-primary w-16 rounded border border-subtle bg-layer-2 px-2 py-1.5 text-body-xs-regular text-primary focus:outline-none"
            placeholder="0"
            aria-label="Minutes"
          />
          <span className="text-body-xs-regular text-tertiary">m</span>
        </div>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-body-xs-regular text-tertiary">Date</label>
        <input
          type="date"
          value={loggedAt}
          max={today}
          onChange={(e) => setLoggedAt(e.target.value)}
          className="focus:border-primary rounded border border-subtle bg-layer-2 px-2 py-1.5 text-body-xs-regular text-primary focus:outline-none"
        />
      </div>

      {/* Description */}
      <div className="flex items-start gap-2">
        <label className="w-16 shrink-0 pt-1.5 text-body-xs-regular text-tertiary">Notes</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={10000}
          rows={2}
          placeholder="What did you work on? (optional)"
          className="focus:border-primary w-full resize-none rounded border border-subtle bg-layer-2 px-2 py-1.5 text-body-xs-regular text-primary placeholder:text-tertiary focus:outline-none"
        />
      </div>

      {/* Error message */}
      {error && <p className="text-red-500 text-caption-sm-regular">{error}</p>}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="rounded px-3 py-1.5 text-body-xs-medium text-secondary transition-colors hover:bg-layer-3"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary hover:bg-primary/90 rounded px-3 py-1.5 text-body-xs-medium text-white transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : isEditMode ? "Update" : "Log time"}
        </button>
      </div>
    </form>
  );
});
