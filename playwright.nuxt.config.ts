import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/nuxt",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3220",
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
      "pnpm --filter @brip/glyphscramble build && pnpm --filter @brip/glyphscramble-vue build && pnpm --filter @brip/glyphscramble-nuxt build && pnpm --dir examples/nuxt prepare:glyphs && pnpm --dir examples/nuxt prepare:types && pnpm --dir examples/nuxt build:fixture && pnpm --dir examples/nuxt start",
    url: "http://127.0.0.1:3220",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NITRO_PORT: "3220",
      GLYPHSCRAMBLE_SECRET:
        "nuxt fixture secret that is deliberately at least thirty two characters",
    },
  },
});
