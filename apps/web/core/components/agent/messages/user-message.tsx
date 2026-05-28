import type { IAgentChatMessage } from "@plane/types";

type Props = { message: IAgentChatMessage };

export function UserMessage({ message }: Props) {
  return (
    <div className="flex justify-end">
      <div className="bg-custom-primary-100 text-sm max-w-[85%] rounded-xl px-3 py-2 text-white">{message.content}</div>
    </div>
  );
}
