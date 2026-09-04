import { defineConfig } from "vite";
import glyphConfig from "./glyphscramble.config.ts";
import { glyphscrambleStatic } from "@brip/glyphscramble-vite";

export default defineConfig({
  base: "/vite-static/",
  build: { outDir: "dist-site" },
  plugins: [glyphscrambleStatic(glyphConfig)],
});
