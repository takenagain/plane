import { observer } from "mobx-react";
import { Bot } from "lucide-react";
import { useUser } from "@/hooks/store/user";
import { useAgent } from "@/hooks/store/use-agent";

export const FloatingAgentButton = observer(function FloatingAgentButton() {
  const agent = useAgent();
  const user = useUser();

  if (!user.isAuthenticated) return null;
  if (!agent.config?.is_enabled) return null;

  return (
    <button
      type="button"
      onClick={agent.toggleChatWindow}
      className="fixed right-6 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary text-on-color shadow-raised-200 transition-colors hover:bg-accent-primary-hover"
      aria-label="Open AI Agent"
    >
      <Bot size={20} />
      {agent.unreadCount > 0 && (
        <span className="text-xs absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger-primary font-bold text-on-color">
          {agent.unreadCount}
        </span>
      )}
    </button>
  );
});
