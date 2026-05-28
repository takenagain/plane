import type { IAgentChatMessage } from "@plane/types";

type Props = { message: IAgentChatMessage };

export function AssistantMessage({ message }: Props) {
  if (!message.content && !message.is_error) return null;

  return (
    <div className="flex justify-start">
      <div
        className={`text-sm max-w-[85%] rounded-xl px-3 py-2 ${
          message.is_error ? "bg-red-50 text-red-700" : "bg-surface-2 text-primary"
        }`}
      >
        {message.content}
        {(message.tokens_sent || message.tokens_received) && (
          <div className="mt-1 text-[10px] text-tertiary">
            {message.tokens_sent ?? 0}↑ {message.tokens_received ?? 0}↓
          </div>
        )}
      </div>
    </div>
  );
}
