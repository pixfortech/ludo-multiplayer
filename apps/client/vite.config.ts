import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { workspaceSourceResolution } from "../../vitest.shared";

const SERVER_URL = process.env.LUDO_SERVER_URL ?? "http://localhost:3001";

export default defineConfig({
  ...workspaceSourceResolution,
  plugins: [react(), tailwindcss()],
  // The 3D board's chunk (three.js, React Three Fiber, the renderer) is about 950 kB minified,
  // 260 kB gzipped: lazy-loaded only for the 3D views and within its 650 kB gzip budget
  // (docs/design/performance-budgets.md). The main bundle stays far below this limit.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    proxy: {
      "/api": SERVER_URL,
      "/socket.io": { target: SERVER_URL, ws: true },
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // CSS is stubbed in tests, except the raw stylesheet read by the design-token drift test.
    css: { include: [/index\.css\?raw$/] },
  },
});
