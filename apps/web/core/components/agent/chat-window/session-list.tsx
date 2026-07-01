import { observer } from "mobx-react";
import { AgentService } from "@/services/agent.service";
import { useAgent } from "@/hooks/store/use-agent";

const agentService = new AgentService();

type Props = {
  workspaceSlug: string;
};

export const SessionList = observer(function SessionList({ workspaceSlug }: Props) {
  const agent = useAgent();

  if (!agent.showSessionList) return null;

  return (
    <div className="max-h-44 overflow-y-auto border-b border-subtle bg-surface-1 p-2">
      {agent.sessions.length === 0 && <p className="text-xs px-2 py-3 text-tertiary">No sessions yet.</p>}
      {agent.sessions.map((session) => (
        <div
          key={session.id}
          className={`text-xs mb-1 rounded px-2 py-2 ${
            session.id === agent.activeSessionId ? "bg-surface-3" : "hover:bg-surface-2"
          }`}
        >
          <button
            type="button"
            className="block w-full truncate text-left text-primary"
            onClick={() => void agent.loadSession(workspaceSlug, session.id)}
          >
            {session.title || "Untitled session"}
          </button>
          <div className="mt-1 flex items-center justify-between text-tertiary">
            <span>{new Date(session.created_at).toLocaleString()}</span>
            <button
              type="button"
              className="text-danger-primary"
              onClick={async () => {
                await agentService.deleteSession(workspaceSlug, session.id);
                await agent.fetchSessions(workspaceSlug);
                if (agent.activeSessionId === session.id) {
                  const latest = agent.sessions[0];
                  if (latest) await agent.loadSession(workspaceSlug, latest.id);
                  else {
                    agent.setActiveSession(null);
                    agent.setActiveMessages([]);
                  }
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
});
