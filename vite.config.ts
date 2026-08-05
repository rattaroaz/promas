/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const isE2E = process.env.VITE_E2E === "true";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  define: isE2E
    ? {
        "import.meta.env.VITE_E2E": JSON.stringify("true"),
      }
    : undefined,

  resolve: isE2E
    ? {
        alias: {
          "@tauri-apps/plugin-updater": `${rootDir}/e2e/mocks/tauriUpdater.ts`,
          "@tauri-apps/plugin-process": `${rootDir}/e2e/mocks/tauriProcess.ts`,
          "@tauri-apps/plugin-dialog": `${rootDir}/e2e/mocks/tauriDialog.ts`,
          "@tauri-apps/api/core": `${rootDir}/e2e/mocks/tauriCore.ts`,
          "@tauri-apps/api/window": `${rootDir}/e2e/mocks/tauriWindow.ts`,
        },
      }
    : undefined,

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/test/**",
        "src/pages/**",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
      ],
    },
  },
});
