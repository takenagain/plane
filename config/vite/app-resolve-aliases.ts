import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const popperjsCoreDir = path.dirname(require.resolve("@popperjs/core/package.json"));

/** Shared Vite resolve aliases for React Router apps (web, admin, space). */
export const sharedAppResolveAliases = {
  "@popperjs/core": path.resolve(configDir, "popperjs-core-shim"),
  "@popperjs/core-original": popperjsCoreDir,
} as const;
