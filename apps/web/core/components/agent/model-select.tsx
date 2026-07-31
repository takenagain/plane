import { CustomSelect } from "@plane/ui";
import type { IAgentModel } from "@plane/types";

type Props = {
  models: IAgentModel[];
  value: string;
  onChange: (model: string) => void;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
};

const formatPrice = (price: number): string =>
  price.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const LifecycleBadge = ({ lifecycle }: Pick<IAgentModel, "lifecycle">) => {
  if (lifecycle === "stable") return null;

  return (
    <span className="rounded-sm bg-layer-3 px-1.5 py-0.5 text-[10px] font-medium text-tertiary capitalize">
      {lifecycle}
    </span>
  );
};

export const AgentModelSelect = ({
  models,
  value,
  onChange,
  compact = false,
  disabled = false,
  className = "",
}: Props) => {
  const selectedModel = models.find((model) => model.id === value) ?? models[0];
  const selectedLabel = selectedModel?.name ?? "No models available";

  return (
    <CustomSelect
      ariaLabel={`Model: ${selectedLabel}`}
      value={selectedModel?.id ?? ""}
      onChange={(model: string) => onChange(model)}
      disabled={disabled || models.length === 0}
      className={className}
      input={!compact}
      buttonClassName="border-subtle bg-surface-2 !shadow-none !rounded-md"
      customButton={
        compact ? <span className="text-xs max-w-40 truncate px-1 text-secondary">{selectedLabel}</span> : undefined
      }
      label={compact ? undefined : selectedLabel}
      optionsClassName="w-[22rem] max-w-[calc(100vw-2rem)]"
      maxHeight="lg"
    >
      {models.map((model) => (
        <CustomSelect.Option key={model.id} value={model.id} className="!items-start whitespace-normal">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-primary">{model.name}</span>
              <LifecycleBadge lifecycle={model.lifecycle} />
            </div>
            <span className="font-mono text-[10px] text-tertiary">{model.id}</span>
            <span className="text-[10px] text-secondary">
              ${formatPrice(model.input_price)} in · ${formatPrice(model.output_price)} out / 1M
            </span>
            {model.pricing_note && <span className="text-[10px] leading-4 text-tertiary">{model.pricing_note}</span>}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
};
