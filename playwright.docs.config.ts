import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/docs",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4178",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node apps/docs/scripts/serve-static.mjs",
    url: "http://127.0.0.1:4178/docs/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
