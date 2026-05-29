import { useState } from "react";
import { Clock } from "lucide-react";
// components
import { WorklogForm } from "./worklog-form";

type TIssueActivityWorklogCreateButton = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export function IssueActivityWorklogCreateButton(props: TIssueActivityWorklogCreateButton) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const [isFormOpen, setIsFormOpen] = useState(false);

  if (disabled) return <></>;

  return (
    <div>
      {!isFormOpen && (
        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-caption-sm-medium text-secondary transition-colors hover:bg-layer-3"
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Log time</span>
        </button>
      )}
      {isFormOpen && (
        <WorklogForm
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          onClose={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
}
