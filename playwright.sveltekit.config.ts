import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/sveltekit",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3230",
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
      "pnpm --filter @brip/glyphscramble build && pnpm --filter @brip/glyphscramble-svelte build && pnpm --filter @brip/glyphscramble-sveltekit build && pnpm --dir examples/sveltekit prepare:glyphs && pnpm --dir examples/sveltekit check && pnpm --dir examples/sveltekit build:fixture && pnpm --dir examples/sveltekit start",
    url: "http://127.0.0.1:3230",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      PORT: "3230",
      HOST: "127.0.0.1",
      GLYPHSCRAMBLE_SECRET:
        "sveltekit fixture secret deliberately longer than thirty two characters",
    },
  },
});
