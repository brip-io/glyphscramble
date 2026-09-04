import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";
import type { GlyphConfig } from "./types.js";

/** Load TypeScript or JavaScript config consistently across the Node 22/24 range. */
export async function loadGlyphConfig(path: string): Promise<GlyphConfig> {
  const absolute = resolve(path);
  if (!existsSync(absolute))
    throw new Error(`Configuration not found: ${absolute}`);
  const jiti = createJiti(import.meta.url, {
    interopDefault: false,
    moduleCache: false,
  });
  const imported = (await jiti.import(absolute)) as {
    default?: GlyphConfig;
  };
  if (!imported.default) throw new Error(`${path} must have a default export.`);
  return imported.default;
}
