/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { LegendProps } from "recharts";
// plane imports
import type { TChartLegend } from "@plane/types";
import { cn } from "../../utils/classname";

type LegendPayloadItem = {
  value?: string;
  color?: string;
  payload?: { name?: string; key?: string };
};

type CustomLegendProps = TChartLegend & {
  payload?: readonly LegendPayloadItem[];
  formatter?: LegendProps["formatter"];
  onClick?: LegendProps["onClick"];
  onMouseEnter?: LegendProps["onMouseEnter"];
  onMouseLeave?: LegendProps["onMouseLeave"];
};

export const getLegendProps = (args: TChartLegend): LegendProps => {
  const { align, layout, verticalAlign } = args;
  return {
    layout,
    align,
    verticalAlign,
    wrapperStyle: {
      display: "flex",
      overflow: "hidden",
      ...(layout === "vertical"
        ? {
            top: 0,
            alignItems: "center",
            height: "100%",
          }
        : {
            left: 0,
            bottom: 0,
            width: "100%",
            justifyContent: "center",
          }),
      ...args.wrapperStyles,
    },
    content: (legendProps) => (
      <CustomLegend
        {...args}
        payload={legendProps.payload}
        formatter={legendProps.formatter}
        onClick={legendProps.onClick}
        onMouseEnter={legendProps.onMouseEnter}
        onMouseLeave={legendProps.onMouseLeave}
      />
    ),
  };
};

const CustomLegend = React.forwardRef(function CustomLegend(
  props: CustomLegendProps,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const { formatter, layout, onClick, onMouseEnter, onMouseLeave, payload } = props;

  if (!payload?.length) return null;

  return (
    <div
      ref={ref}
      className={cn("vertical-scrollbar flex scrollbar-sm items-center overflow-scroll px-4", {
        "max-h-full flex-col items-start py-4": layout === "vertical",
      })}
    >
      {payload.map((item, index) => (
        <div
          key={String(item.value ?? index)}
          className={cn("flex items-center gap-1.5 text-13 font-medium whitespace-nowrap text-tertiary", {
            "px-2": layout === "horizontal",
            "py-2": layout === "vertical",
            "pt-0 pl-0": index === 0,
            "pr-0 pb-0": index === payload.length - 1,
            "cursor-pointer": !!props.onClick,
          })}
          onClick={(e) => onClick?.(item as Parameters<NonNullable<LegendProps["onClick"]>>[0], index, e)}
          onMouseEnter={(e) =>
            onMouseEnter?.(item as Parameters<NonNullable<LegendProps["onMouseEnter"]>>[0], index, e)
          }
          onMouseLeave={(e) =>
            onMouseLeave?.(item as Parameters<NonNullable<LegendProps["onMouseLeave"]>>[0], index, e)
          }
        >
          <div
            className="size-2 flex-shrink-0 rounded-xs"
            style={{
              backgroundColor: item.color,
            }}
          />
          {formatter?.(item.value, { value: item.value }, index) ?? item.payload?.name}
        </div>
      ))}
    </div>
  );
});
CustomLegend.displayName = "CustomLegend";
