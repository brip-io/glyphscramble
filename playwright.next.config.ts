import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/next",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "pnpm --filter @brip/glyphscramble build && pnpm --filter @brip/glyphscramble-react build && pnpm --filter @brip/glyphscramble-next build && pnpm --dir examples/next prepare:glyphs && pnpm --dir examples/next build:fixture && pnpm --dir examples/next start",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      GLYPHSCRAMBLE_SECRET:
        "next fixture secret that is deliberately at least thirty two characters",
    },
  },
});
