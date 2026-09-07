import type { ResponseContext } from "@brip/glyphscramble-astro";

declare global {
  namespace App {
    interface Locals {
      glyphscramble?: ResponseContext;
    }
  }
}

export {};
