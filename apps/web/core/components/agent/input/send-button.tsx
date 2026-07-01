import { Loader2, SendHorizontal } from "lucide-react";

type Props = {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
};

export function SendButton({ onClick, disabled, isLoading }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="text-xs flex h-8 items-center justify-center rounded-md bg-accent-primary px-3 text-on-color hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      aria-label="Send"
    >
      {isLoading ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
    </button>
  );
}
