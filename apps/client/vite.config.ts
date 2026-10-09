import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { workspaceSourceResolution } from "../../vitest.shared";

const SERVER_URL = process.env.LUDO_SERVER_URL ?? "http://localhost:3001";

export default defineConfig({
  ...workspaceSourceResolution,
  plugins: [react(), tailwindcss()],
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
