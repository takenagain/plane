import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useAgent } from "@/hooks/store/use-agent";
import { AssistantMessage } from "../messages/assistant-message";
import { ToolCallBlock } from "../messages/tool-call-block";
import { UserMessage } from "../messages/user-message";

export const MessageThread = observer(function MessageThread() {
  const agent = useAgent();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agent.activeSessionMessages.length, agent.isLoading]);

  if (agent.activeSessionMessages.length === 0 && !agent.isLoading) {
    return (
      <div className="text-sm flex flex-1 items-center justify-center px-3 text-tertiary">
        Ask me to create, update, or search work in Plane.
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-3">
      {agent.activeSessionMessages.map((message) => (
        <div key={message.id}>
          {message.role === "user" && <UserMessage message={message} />}
          {message.role === "assistant" && <AssistantMessage message={message} />}
          {message.role === "tool" && <ToolCallBlock message={message} />}
        </div>
      ))}
      {agent.isLoading && <div className="text-xs text-tertiary">Agent is thinking...</div>}
      <div ref={bottomRef} />
    </div>
  );
});
