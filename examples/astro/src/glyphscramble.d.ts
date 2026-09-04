import type { ResponseContext } from "@brip/glyphscramble";

declare global {
  namespace App {
    interface Locals {
      glyphscramble?: ResponseContext;
    }
  }
}

export {};
