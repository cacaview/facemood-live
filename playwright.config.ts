import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", headless: true },
  webServer: {
    command: "npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: true,
  },
  reporter: [["list"], ["json", { outputFile: "reports/playwright.json" }]],
});
