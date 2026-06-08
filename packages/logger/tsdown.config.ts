import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  exports: true,
  external: ["express", "express-winston", "winston"],
});
