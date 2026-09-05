import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createJiti } from "jiti";
import type { GlyphConfig } from "./types.js";

const CONFIG_NAMES = [
  "glyphscramble.config.ts",
  "glyphscramble.config.mts",
  "glyphscramble.config.js",
  "glyphscramble.config.mjs",
] as const;

/** Find the one canonical config without assuming that a JavaScript app uses TypeScript. */
export function discoverGlyphConfigPath(cwd = process.cwd()): string {
  const candidates = CONFIG_NAMES.filter((name) => existsSync(join(cwd, name)));
  if (candidates.length === 0)
    throw new Error(
      `Configuration not found in ${resolve(cwd)}. Run glyphscramble init or pass --config <path>.`,
    );
  if (candidates.length > 1)
    throw new Error(
      `Multiple GlyphScramble configs exist (${candidates.join(", ")}). Keep one canonical config or pass --config <path>.`,
    );
  return join(cwd, candidates[0]!);
}

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
