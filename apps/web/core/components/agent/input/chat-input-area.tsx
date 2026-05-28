import { useState } from "react";
import { observer } from "mobx-react";
import { useRouterParams } from "@/hooks/store/use-router-params";
import { useAgent } from "@/hooks/store/use-agent";
import { ModelSelector } from "./model-selector";
import { SendButton } from "./send-button";

type Props = { workspaceSlug: string };

export const ChatInputArea = observer(function ChatInputArea({ workspaceSlug }: Props) {
  const agent = useAgent();
  const router = useRouterParams();
  const [content, setContent] = useState("");

  const submit = async () => {
    const value = content.trim();
    if (!value || agent.isLoading) return;
    setContent("");
    await agent.sendMessage(workspaceSlug, value, router.projectId);
  };

  return (
    <div className="border-t border-subtle p-3">
      <textarea
        value={content}
        disabled={agent.isLoading}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        className="text-sm mb-2 h-20 w-full resize-none rounded-md border border-subtle bg-surface-1 p-2 text-primary focus:outline-none"
        placeholder="Ask Plane Agent..."
      />
      <div className="flex items-center justify-between gap-2">
        <ModelSelector />
        <SendButton onClick={() => void submit()} disabled={!content.trim()} isLoading={agent.isLoading} />
      </div>
      {agent.error && <p className="text-xs text-red-500 mt-2">{agent.error}</p>}
    </div>
  );
});
