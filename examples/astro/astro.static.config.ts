import { defineConfig } from "astro/config";

export default defineConfig({
  base: "/astro-static",
  outDir: "./dist-static-input",
  srcDir: "./static-src",
});
