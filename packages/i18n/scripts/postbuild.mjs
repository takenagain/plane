/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";

const distDirectory = new URL("../dist/", import.meta.url);
const files = await readdir(distDirectory);

await Promise.all(
  files
    .filter((file) => file.endsWith(".js"))
    .map(async (file) => {
      const filePath = new URL(file, distDirectory);
      const source = await readFile(filePath, "utf8");
      const withoutInternalExports = source
        .split("\n")
        .filter((line) => !line.includes("__exportAll"))
        .join("\n")
        .replace(/[a-z_]*_exports as n, /g, "");
      await writeFile(filePath, withoutInternalExports);
    })
);

const declarationsPath = new URL("../dist/index.d.ts", import.meta.url);
const declarations = await readFile(declarationsPath, "utf8");
await writeFile(declarationsPath, declarations.replace(/, __exportAll as t/g, ""));
