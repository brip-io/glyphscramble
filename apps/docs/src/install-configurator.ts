import {
  GLYPH_BETA_CHANNEL,
  glyphInstallCommand as sharedInstallCommand,
  glyphLocalCliCommand,
  type GlyphDeliveryMode,
  type GlyphFramework,
  type GlyphPackageManager,
  type GlyphPackageName,
} from "@brip/glyphscramble/package-surface";

export type InstallerFramework = GlyphFramework;
export type InstallerMode = GlyphDeliveryMode;
export type InstallerPackageManager = GlyphPackageManager;

export type InstallationProfiles = Readonly<
  Record<string, readonly GlyphPackageName[]>
>;

interface FrameworkOption {
  readonly id: InstallerFramework;
  readonly label: string;
  readonly description: string;
  readonly modes: readonly InstallerMode[];
  readonly defaultMode: InstallerMode;
  readonly guidePath: string;
  readonly nextAction: Readonly<Record<InstallerMode, string | undefined>>;
}

export const FRAMEWORK_OPTIONS: readonly FrameworkOption[] = [
  {
    id: "next",
    label: "Next.js",
    description: "App Router on the Node runtime",
    modes: ["response"],
    defaultMode: "response",
    guidePath: "/docs/#frameworks",
    nextAction: {
      response:
        "Call the generated server helper, then render its payload with GlyphText.",
      static: undefined,
    },
  },
  {
    id: "nuxt",
    label: "Nuxt",
    description: "Nuxt 4 with a Nitro Node server",
    modes: ["response"],
    defaultMode: "response",
    guidePath: "/docs/#frameworks",
    nextAction: {
      response:
        "Create the payload in a server route. The initializer adds the Nuxt module.",
      static: undefined,
    },
  },
  {
    id: "sveltekit",
    label: "SvelteKit",
    description: "SvelteKit 2 with adapter-node",
    modes: ["response"],
    defaultMode: "response",
    guidePath: "/docs/#frameworks",
    nextAction: {
      response:
        "Scramble in a server load. The initializer wires the handle and typed locals.",
      static: undefined,
    },
  },
  {
    id: "astro",
    label: "Astro",
    description: "SSR or a static post-build",
    modes: ["response", "static"],
    defaultMode: "response",
    guidePath: "/docs/#frameworks",
    nextAction: {
      response:
        "Use the generated middleware and create payloads through Astro.locals.",
      static:
        "Mark non-hydrated blocks, build Astro, then run the static transform on dist.",
    },
  },
  {
    id: "vite",
    label: "Vite",
    description: "Static output with per-build rotation",
    modes: ["static"],
    defaultMode: "static",
    guidePath: "/docs/#frameworks",
    nextAction: {
      response: undefined,
      static:
        "Mark non-hydrated blocks. The generated Vite plugin transforms them during build.",
    },
  },
] as const;

export const PACKAGE_MANAGERS: readonly {
  readonly id: InstallerPackageManager;
  readonly label: string;
}[] = [
  { id: "npm", label: "npm" },
  { id: "pnpm", label: "pnpm" },
  { id: "yarn", label: "Yarn" },
  { id: "bun", label: "Bun" },
] as const;

export function frameworkOption(
  framework: InstallerFramework,
): FrameworkOption {
  return FRAMEWORK_OPTIONS.find((option) => option.id === framework)!;
}

export function availableModes(
  framework: InstallerFramework,
): readonly InstallerMode[] {
  return frameworkOption(framework).modes;
}

export function modeForFramework(
  framework: InstallerFramework,
  requested: InstallerMode,
): InstallerMode {
  const option = frameworkOption(framework);
  return option.modes.includes(requested) ? requested : option.defaultMode;
}

export function profileFor(
  framework: InstallerFramework,
  mode: InstallerMode,
): string {
  return framework === "astro" && mode === "static"
    ? "astro-static"
    : framework;
}

export function installCommand(
  packageManager: InstallerPackageManager,
  packages: readonly GlyphPackageName[],
): string {
  return sharedInstallCommand(packageManager, packages, GLYPH_BETA_CHANNEL);
}

export function initCommand(
  packageManager: InstallerPackageManager,
  framework: InstallerFramework,
  mode: InstallerMode,
): string {
  return glyphLocalCliCommand(packageManager, [
    "init",
    "--framework",
    framework,
    "--mode",
    mode,
    "--package-manager",
    packageManager,
    "--no-install",
  ]);
}

export function packagesForSelection(
  profiles: InstallationProfiles,
  framework: InstallerFramework,
  mode: InstallerMode,
): readonly GlyphPackageName[] {
  const profile = profileFor(framework, mode);
  const packages = profiles[profile];
  if (!packages)
    throw new Error(`Missing GlyphScramble installation profile: ${profile}`);
  return packages;
}
