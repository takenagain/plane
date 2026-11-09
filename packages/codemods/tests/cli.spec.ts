/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const cli = require.resolve("jscodeshift/bin/jscodeshift.js");
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runCli(transform: string, source: string) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "plane-codemod-cli-"));
  const fixture = join(fixtureDir, "component.tsx");
  writeFileSync(fixture, source);
  try {
    const output = stripVTControlCharacters(
      execFileSync(
        process.execPath,
        [
          cli,
          "-t",
          join(packageDir, transform),
          "--extensions=tsx",
          "--parser=tsx",
          "--dry",
          "--print",
          "--cpus=1",
          fixture,
        ],
        { cwd: packageDir, encoding: "utf8", timeout: 20_000 }
      )
    );
    // The CLI can exit zero after a transform error; check its counters too.
    expect(output).toMatch(/\b0 errors\b/);
    expect(output).toMatch(/\b1 ok\b/);
    expect(readFileSync(fixture, "utf8")).toBe(source);
    return output.replace(/\s+/g, " ");
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

describe("codemod CLI with the installed Babel toolchain", () => {
  it("preserves component type arguments and generic declarations through the actual worker", () => {
    const output = runCli(
      "function-declaration.ts",
      `
      import React, { memo, forwardRef, type FC } from "react";
      import { observer } from "mobx-react";
      type Props<T = string> = { label: T };
      export const Greeting: FC<Props<string>> = ({ label }) => <div>{label}</div>;
      export const Observed = observer<React.FC<Props<string>>>((props) => <div>{props.label}</div>);
      export const Memoized = memo<Props<string>>((props) => <div>{props.label}</div>);
      export const Button = forwardRef<HTMLButtonElement, Props<string>>((props, ref) => <button ref={ref}>{props.label}</button>);
      export const Generic = memo(<T extends string,>(props: Props<T>) => <div>{props.label}</div>);
    `
    );
    expect(output).toContain("}: Props<string>");
    expect(output).toContain(
      "observer(function Observed(props: Props<string>)"
    );
    expect(output).toContain("memo(function Memoized(props: Props<string>)");
    expect(output).toContain(
      "function Button(props: Props<string>, ref: React.ForwardedRef<HTMLButtonElement>)"
    );
    expect(output).toMatch(
      /function Generic<T extends string,?>\(props: Props<T>\)/
    );
  }, 30_000);

  it("removes directives through the same worker while retaining the component", () => {
    const output = runCli(
      "remove-directives.ts",
      `"use client"; export const Greeting = () => <div>Hello</div>;`
    );
    expect(output).not.toContain('"use client"');
    expect(output).toContain("export const Greeting = () => <div>Hello</div>");
  }, 30_000);
});
