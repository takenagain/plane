import { useEffect } from "react";
import { observer } from "mobx-react";
import { useAgent } from "@/hooks/store/use-agent";
import { useUser } from "@/hooks/store/user";
import { ChatWindow } from "./chat-window";
import { FloatingAgentButton } from "./fab";

type Props = {
  workspaceSlug: string;
};

/** Workspace-wide agent FAB + chat (all authenticated workspace routes). */
export const GlobalAgentRoot = observer(function GlobalAgentRoot({ workspaceSlug }: Props) {
  const agent = useAgent();
  const user = useUser();

  useEffect(() => {
    if (!workspaceSlug || !user.isAuthenticated) return;
    void agent.fetchConfig(workspaceSlug);
  }, [workspaceSlug, user.isAuthenticated, agent]);

  if (!user.isAuthenticated) return null;

  return (
    <>
      <FloatingAgentButton />
      <ChatWindow />
    </>
  );
});
