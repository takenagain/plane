import type { IAgentChatMessage } from "@plane/types";

type Props = { message: IAgentChatMessage };

export function UserMessage({ message }: Props) {
  return (
    <div className="flex justify-end">
      <div className="text-sm max-w-[85%] rounded-xl bg-accent-primary px-3 py-2 text-on-color">{message.content}</div>
    </div>
  );
}
