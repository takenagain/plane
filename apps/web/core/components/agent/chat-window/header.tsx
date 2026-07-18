import { observer } from "mobx-react";
import { History, Plus, X } from "lucide-react";
import { useRouterParams } from "@/hooks/store/use-router-params";
import { useAgent } from "@/hooks/store/use-agent";
import { useAgentUIContext } from "@/components/agent/utils/build-agent-ui-context";

type Props = {
  workspaceSlug: string;
};

export const ChatWindowHeader = observer(function ChatWindowHeader({ workspaceSlug }: Props) {
  const agent = useAgent();
  const router = useRouterParams();
  const uiContext = useAgentUIContext(workspaceSlug);
  const projectId = uiContext?.projects?.current_id ?? router.projectId;

  return (
    <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
      <div className="text-sm font-semibold text-primary">AI Agent</div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded p-1 text-secondary hover:bg-surface-2"
          onClick={() => agent.toggleSessionList()}
          aria-label="Toggle sessions"
        >
          <History size={14} />
        </button>
        <button
          type="button"
          className="rounded p-1 text-secondary hover:bg-surface-2"
          onClick={() => void agent.createSession(workspaceSlug, projectId ?? undefined)}
          aria-label="New session"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="rounded p-1 text-secondary hover:bg-surface-2"
          onClick={agent.closeChatWindow}
          aria-label="Close chat"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
});
