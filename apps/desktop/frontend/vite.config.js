import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vitejs.dev/config/
export default defineConfig({
  // Relative paths required for Wails embedded asset server (absolute /assets/* 404s).
  base: "./",
  plugins: [svelte()],
});
