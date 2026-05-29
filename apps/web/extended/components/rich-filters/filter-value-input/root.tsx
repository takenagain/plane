import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { SingleOrArray, TFilterProperty, TFilterValue } from "@plane/types";
import { FILTER_FIELD_TYPE } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { COMMON_FILTER_ITEM_BORDER_CLASSNAME, EMPTY_FILTER_PLACEHOLDER_TEXT } from "@/components/rich-filters/shared";
import type { TFilterValueInputProps } from "@/components/rich-filters/shared";

const parseNumber = (rawValue: string): number | undefined => {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) return undefined;

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

export const AdditionalFilterValueInput = observer(function AdditionalFilterValueInput<
  P extends TFilterProperty,
  V extends TFilterValue,
>(props: TFilterValueInputProps<P, V>) {
  const { condition, filterFieldConfig, isDisabled = false, onChange } = props;
  const [singleValue, setSingleValue] = useState("");
  const [rangeValues, setRangeValues] = useState<{ min: string; max: string }>({ min: "", max: "" });

  useEffect(() => {
    if (filterFieldConfig?.type === FILTER_FIELD_TYPE.NUMBER) {
      const rawValue = Array.isArray(condition.value) ? condition.value[0] : condition.value;
      setSingleValue(rawValue === null || rawValue === undefined ? "" : String(rawValue));
    }

    if (filterFieldConfig?.type === FILTER_FIELD_TYPE.NUMBER_RANGE) {
      const values = Array.isArray(condition.value) ? condition.value : [];
      setRangeValues({
        min: values[0] === null || values[0] === undefined ? "" : String(values[0]),
        max: values[1] === null || values[1] === undefined ? "" : String(values[1]),
      });
    }
  }, [condition.value, filterFieldConfig?.type]);

  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.NUMBER) {
    const commitSingleValue = () => {
      const parsedValue = parseNumber(singleValue);
      onChange((parsedValue === undefined ? undefined : parsedValue) as SingleOrArray<V>);
    };

    return (
      <input
        type="number"
        value={singleValue}
        placeholder={EMPTY_FILTER_PLACEHOLDER_TEXT}
        disabled={isDisabled}
        className={cn("h-full min-w-24 bg-transparent px-4 text-13 outline-none", {
          [COMMON_FILTER_ITEM_BORDER_CLASSNAME]: !isDisabled,
          "hover:bg-surface-1": isDisabled,
        })}
        onChange={(event) => setSingleValue(event.target.value)}
        onBlur={commitSingleValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitSingleValue();
        }}
      />
    );
  }

  if (filterFieldConfig?.type === FILTER_FIELD_TYPE.NUMBER_RANGE) {
    const commitRangeValues = () => {
      const parsedMin = parseNumber(rangeValues.min);
      const parsedMax = parseNumber(rangeValues.max);

      if (parsedMin === undefined && parsedMax === undefined) {
        onChange([] as unknown as SingleOrArray<V>);
        return;
      }

      if (parsedMin !== undefined && parsedMax !== undefined) {
        onChange([parsedMin, parsedMax] as unknown as SingleOrArray<V>);
      }
    };

    return (
      <div
        className={cn("flex h-full min-w-36 items-center", {
          [COMMON_FILTER_ITEM_BORDER_CLASSNAME]: !isDisabled,
          "hover:bg-surface-1": isDisabled,
        })}
      >
        <input
          type="number"
          value={rangeValues.min}
          placeholder="Min"
          disabled={isDisabled}
          className="h-full w-1/2 bg-transparent px-3 text-13 outline-none"
          onChange={(event) =>
            setRangeValues((current) => ({
              ...current,
              min: event.target.value,
            }))
          }
          onBlur={commitRangeValues}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRangeValues();
          }}
        />
        <span className="text-13 text-placeholder">to</span>
        <input
          type="number"
          value={rangeValues.max}
          placeholder="Max"
          disabled={isDisabled}
          className="h-full w-1/2 bg-transparent px-3 text-13 outline-none"
          onChange={(event) =>
            setRangeValues((current) => ({
              ...current,
              max: event.target.value,
            }))
          }
          onBlur={commitRangeValues}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRangeValues();
          }}
        />
      </div>
    );
  }

  return (
    // Fallback
    <div className="flex h-full cursor-not-allowed items-center px-4 text-11 text-placeholder transition-opacity duration-200">
      Filter type not supported
    </div>
  );
});
