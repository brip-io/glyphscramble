export type GlyphFramework = "next" | "nuxt" | "sveltekit" | "astro" | "vite";
export type GlyphDeliveryMode = "response" | "static";
export type GlyphPackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type GlyphPackageChannel =
  | { readonly kind: "beta" }
  | { readonly kind: "exact"; readonly version: string }
  | { readonly kind: "stable" };

export const GLYPH_BETA_CHANNEL = Object.freeze({ kind: "beta" } as const);
export const GLYPH_STABLE_CHANNEL = Object.freeze({ kind: "stable" } as const);

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function exactVersion(version: string): string {
  if (!EXACT_VERSION.test(version))
    throw new Error(
      `Expected an exact package version such as 0.1.0-beta.1; received ${JSON.stringify(version)}.`,
    );
  return version;
}

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

export function glyphExactChannel(version: string): GlyphPackageChannel {
  return Object.freeze({ kind: "exact", version: exactVersion(version) });
}

export function glyphPackageSpecifier(
  name: GlyphPackageName,
  channel: GlyphPackageChannel,
): string {
  switch (channel.kind) {
    case "beta":
      return `${name}@beta`;
    case "exact":
      return `${name}@${exactVersion(channel.version)}`;
    case "stable":
      return name;
  }
}

function commandText(parts: readonly string[]): string {
  return parts.join(" ");
}

export function glyphInstallCommandParts(
  packageManager: GlyphPackageManager,
  names: readonly GlyphPackageName[],
  channel: GlyphPackageChannel,
): readonly [command: string, ...args: string[]] {
  if (names.length === 0)
    throw new Error("At least one GlyphScramble package is required.");
  const packages = names.map((name) => glyphPackageSpecifier(name, channel));
  switch (packageManager) {
    case "npm":
      return ["npm", "install", "--save-exact", ...packages];
    case "pnpm":
      return ["pnpm", "add", "--save-exact", ...packages];
    case "yarn":
      return ["yarn", "add", "--exact", ...packages];
    case "bun":
      return ["bun", "add", "--exact", ...packages];
  }
}

export function glyphInstallCommand(
  packageManager: GlyphPackageManager,
  names: readonly GlyphPackageName[],
  channel: GlyphPackageChannel,
): string {
  return commandText(glyphInstallCommandParts(packageManager, names, channel));
}

export function glyphCliCommandParts(
  packageManager: GlyphPackageManager,
  channel: GlyphPackageChannel,
  args: readonly string[],
): readonly [command: string, ...args: string[]] {
  const executable = glyphPackageSpecifier(GLYPH_PACKAGE_NAMES.core, channel);
  switch (packageManager) {
    case "npm":
      return ["npx", executable, ...args];
    case "pnpm":
      return ["pnpm", "dlx", executable, ...args];
    case "yarn":
      return ["yarn", "dlx", executable, ...args];
    case "bun":
      return ["bunx", executable, ...args];
  }
}

export function glyphCliCommand(
  packageManager: GlyphPackageManager,
  channel: GlyphPackageChannel,
  args: readonly string[],
): string {
  return commandText(glyphCliCommandParts(packageManager, channel, args));
}

export function glyphLocalCliCommandParts(
  packageManager: GlyphPackageManager,
  args: readonly string[],
): readonly [command: string, ...args: string[]] {
  switch (packageManager) {
    case "npm":
      return ["npm", "exec", "glyphscramble", "--", ...args];
    case "pnpm":
      return ["pnpm", "exec", "glyphscramble", ...args];
    case "yarn":
      return ["yarn", "exec", "glyphscramble", ...args];
    case "bun":
      return ["bun", "run", "glyphscramble", ...args];
  }
}

export function glyphLocalCliCommand(
  packageManager: GlyphPackageManager,
  args: readonly string[],
): string {
  return commandText(glyphLocalCliCommandParts(packageManager, args));
}

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
  "astro-static": packages(GLYPH_PACKAGE_NAMES.core, GLYPH_PACKAGE_NAMES.astro),
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
