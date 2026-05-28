import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { useAgent } from "@/hooks/store/use-agent";
import { ChatInputArea } from "../input/chat-input-area";
import { ChatWindowHeader } from "./header";
import { MessageThread } from "./message-thread";
import { SessionList } from "./session-list";

export const ChatWindow = observer(function ChatWindow() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const agent = useAgent();

  useEffect(() => {
    if (!workspaceSlug || !agent.isOpen) return;

    const load = async () => {
      try {
        await agent.fetchConfig(workspaceSlug);
      } catch {
        return;
      }

      if (!agent.config?.is_enabled) return;
      await agent.fetchSessions(workspaceSlug);
      const latest = agent.sessions[0];
      if (latest) await agent.loadSession(workspaceSlug, latest.id);
    };

    void load();
  }, [workspaceSlug, agent, agent.isOpen]);

  if (!agent.isOpen || !workspaceSlug) return null;

  return (
    <div className="shadow-2xl fixed right-6 bottom-24 z-50 flex h-[600px] max-h-[80vh] w-[420px] flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-1">
      <ChatWindowHeader workspaceSlug={workspaceSlug} />
      <SessionList workspaceSlug={workspaceSlug} />
      <MessageThread />
      <ChatInputArea workspaceSlug={workspaceSlug} />
    </div>
  );
});
