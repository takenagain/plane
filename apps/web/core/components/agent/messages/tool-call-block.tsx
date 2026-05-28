import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import type { IAgentChatMessage } from "@plane/types";

type Props = { message: IAgentChatMessage };

export function ToolCallBlock({ message }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="text-xs rounded-lg border border-subtle bg-surface-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-tertiary"
      >
        <Wrench size={12} />
        <span className="font-medium">{message.tool_name ?? "tool"}</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {message.is_error && <span className="text-red-500 ml-auto">Error</span>}
      </button>
      {expanded && (
        <div className="font-mono border-t border-subtle px-3 py-2 text-secondary">
          <div className="mb-1 text-tertiary">Input:</div>
          <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(message.tool_input, null, 2)}</pre>
          <div className="mt-2 mb-1 text-tertiary">Output:</div>
          <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(message.tool_output, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
