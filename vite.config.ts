import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  worker: { format: "es" },
  build: { target: "es2022" },
  server: { host: "0.0.0.0" },
  test: { include: ["src/**/*.test.ts"] },
});
