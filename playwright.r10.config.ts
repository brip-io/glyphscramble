import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/r10",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --dir examples/astro start",
      url: "http://127.0.0.1:4322/plain",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ASTRO_TELEMETRY_DISABLED: "1",
        HOST: "127.0.0.1",
        PORT: "4322",
        GLYPHSCRAMBLE_SECRET:
          "astro fixture secret that is deliberately at least thirty two characters",
      },
    },
    {
      command: "pnpm --dir examples/vite-static preview",
      url: "http://127.0.0.1:4174/vite-static/",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --dir examples/node-fetch start",
      url: "http://127.0.0.1:3211/plain",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: "3211",
        GLYPHSCRAMBLE_SECRET:
          "node fixture secret that is deliberately at least thirty two characters",
      },
    },
  ],
});
