export type GlyphFramework = "next" | "nuxt" | "sveltekit" | "astro" | "vite";
export type GlyphDeliveryMode = "response" | "static";

export const GLYPH_PACKAGE_NAMES = Object.freeze({
  core: "@brip/glyphscramble",
  react: "@brip/glyphscramble-react",
  next: "@brip/glyphscramble-next",
  vue: "@brip/glyphscramble-vue",
  nuxt: "@brip/glyphscramble-nuxt",
  svelte: "@brip/glyphscramble-svelte",
  sveltekit: "@brip/glyphscramble-sveltekit",
  astro: "@brip/glyphscramble-astro",
  vite: "@brip/glyphscramble-vite",
} as const);

export type GlyphPackageName =
  (typeof GLYPH_PACKAGE_NAMES)[keyof typeof GLYPH_PACKAGE_NAMES];

function packages<const Names extends readonly GlyphPackageName[]>(
  ...names: Names
): Readonly<Names> {
  return Object.freeze(names);
}

/**
 * Canonical direct dependencies for every supported application shape.
 * Platform adapters own their UI renderer dependency; applications do not.
 */
export const GLYPH_INSTALLATION_PROFILES = Object.freeze({
  "generic-node": packages(GLYPH_PACKAGE_NAMES.core),
  react: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.react),
  vue: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.vue),
  svelte: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.svelte),
  next: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.next),
  nuxt: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.nuxt),
  sveltekit: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.sveltekit),
  astro: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.astro),
  "astro-static": packages(GLYPH_PACKAGE_NAMES.core),
  vite: packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.vite),
} as const);

export type GlyphInstallationProfile = keyof typeof GLYPH_INSTALLATION_PROFILES;

export const GLYPH_PUBLIC_PACKAGE_NAMES = packages(
  GLYPH_PACKAGE_NAMES.core,
  GLYPH_PACKAGE_NAMES.react,
  GLYPH_PACKAGE_NAMES.next,
  GLYPH_PACKAGE_NAMES.vue,
  GLYPH_PACKAGE_NAMES.nuxt,
  GLYPH_PACKAGE_NAMES.svelte,
  GLYPH_PACKAGE_NAMES.sveltekit,
  GLYPH_PACKAGE_NAMES.astro,
  GLYPH_PACKAGE_NAMES.vite,
);

export function glyphInstallationProfile(
  framework: GlyphFramework,
  mode: GlyphDeliveryMode,
): GlyphInstallationProfile {
  return framework === "astro" && mode === "static"
    ? "astro-static"
    : framework;
}

export function glyphPackagesFor(
  framework: GlyphFramework,
  mode: GlyphDeliveryMode,
): readonly GlyphPackageName[] {
  return GLYPH_INSTALLATION_PROFILES[glyphInstallationProfile(framework, mode)];
}
