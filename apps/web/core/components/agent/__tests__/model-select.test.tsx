import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { IAgentModel } from "@plane/types";
import { AgentModelSelect } from "../model-select";

vi.mock("@plane/ui", () => {
  const CustomSelect = Object.assign(
    ({
      ariaLabel,
      children,
      label,
      customButton,
    }: {
      ariaLabel?: string;
      children: ReactNode;
      label?: ReactNode;
      customButton?: ReactNode;
    }) => (
      <div>
        <button aria-label={ariaLabel}>{customButton ?? label}</button>
        <div>{children}</div>
      </div>
    ),
    {
      Option: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    }
  );

  return { CustomSelect };
});

const models: IAgentModel[] = [
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    input_price: 2,
    output_price: 12,
    lifecycle: "preview",
    pricing_note: "$4 in · $18 out / 1M for prompts above 200k tokens.",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    input_price: 1.25,
    output_price: 10,
    lifecycle: "previous",
    pricing_note: "",
  },
];

describe("AgentModelSelect", () => {
  it("renders friendly names, exact IDs, prices, and lifecycle badges", () => {
    render(<AgentModelSelect models={models} value="gemini-3.1-pro-preview" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Model: Gemini 3.1 Pro" })).toBeInTheDocument();

    expect(screen.getAllByText("Gemini 3.1 Pro")).toHaveLength(2);
    expect(screen.getByText("gemini-3.1-pro-preview")).toBeInTheDocument();
    expect(screen.getByText("$2 in · $12 out / 1M")).toBeInTheDocument();
    expect(screen.getByText("preview")).toBeInTheDocument();
    expect(screen.getByText("previous")).toBeInTheDocument();
    expect(screen.getByText("$4 in · $18 out / 1M for prompts above 200k tokens.")).toBeInTheDocument();
  });
});
