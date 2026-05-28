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
      className="bg-custom-primary-100 shadow-lg hover:bg-custom-primary-90 fixed right-6 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors"
      aria-label="Open AI Agent"
    >
      <Bot size={20} />
      {agent.unreadCount > 0 && (
        <span className="bg-red-500 text-xs absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full font-bold text-white">
          {agent.unreadCount}
        </span>
      )}
    </button>
  );
});
