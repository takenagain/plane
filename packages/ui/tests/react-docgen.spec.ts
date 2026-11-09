import { parse } from "react-docgen";
import { describe, expect, it } from "vitest";

const document = (source: string, filename = "Component.tsx") =>
  parse(source, { filename, babelOptions: { babelrc: false, configFile: false } })[0];

describe("Storybook prop documentation with Babel 8", () => {
  it("documents typed function props", () => {
    const result = document(`
      import React from "react";
      export function Plain({ label }: { label: string }) { return <div>{label}</div>; }
    `);
    expect(result.props?.label).toMatchObject({ required: true, tsType: { name: "string" } });
  });

  it("documents FC, builtin wrappers, and generic prop types", () => {
    const result = document(`
      import React from "react";
      type Props = { value: Array<string> };
      export const Typed: React.FC<React.PropsWithChildren<Props>> = ({ value }) => <div>{value}</div>;
    `);
    expect(result.props?.value).toMatchObject({
      required: true,
      tsType: { name: "Array", elements: [{ name: "string" }] },
    });
  });

  it("resolves forwardRef arguments and inherited generic interfaces", () => {
    const result = document(`
      import React from "react";
      interface Base<T> { value: T }
      interface Props extends Base<string> { count?: number }
      export const Ref = React.forwardRef<HTMLDivElement, Props>((props, ref) => <div ref={ref}>{props.value}</div>);
    `);
    expect(result.props?.value).toMatchObject({ required: true, tsType: { name: "string" } });
    expect(result.props?.count).toMatchObject({ required: false, tsType: { name: "number" } });
  });

  it("documents TypeScript class props", () => {
    const result = document(`
      import React from "react";
      type Props = { label: string };
      export class ClassComponent extends React.Component<Props> { render() { return <div>{this.props.label}</div>; } }
    `);
    expect(result.props?.label).toMatchObject({ required: true, tsType: { name: "string" } });
  });

  it("documents callback argument and return types", () => {
    const result = document(`
      import React from "react";
      type Props = { onChange: (value: string, count?: number) => boolean };
      export function Callback(props: Props) { return <div />; }
    `);
    expect(result.props?.onChange.tsType).toMatchObject({
      type: "function",
      signature: {
        arguments: [
          { name: "value", type: { name: "string" } },
          { name: "count", type: { name: "number" } },
        ],
        return: { name: "boolean" },
      },
    });
  });

  it("documents index and mapped type constraints", () => {
    const result = document(`
      import React from "react";
      type Props = { counts: { [key: string]: number }; flags: { [Key in "one" | "two"]?: boolean } };
      export function Collection(props: Props) { return <div />; }
    `);
    expect(result.props?.counts.tsType).toMatchObject({
      type: "object",
      signature: { properties: [{ key: { name: "string" }, value: { name: "number" } }] },
    });
    expect(result.props?.flags.tsType).toMatchObject({
      type: "object",
      signature: { properties: [{ key: { name: "union" }, value: { name: "boolean" } }] },
    });
  });

  it("retains Flow class and generic prop documentation", () => {
    const result = document(
      `
      import React from "react";
      type Props = { value: string, items: Array<string> };
      export class Legacy extends React.Component<Props> { render() { return <div>{this.props.value}</div>; } }
    `,
      "Component.jsx"
    );
    expect(result.props?.value).toMatchObject({ required: true, flowType: { name: "string" } });
    expect(result.props?.items).toMatchObject({
      required: true,
      flowType: { name: "Array", elements: [{ name: "string" }] },
    });
  });
});
