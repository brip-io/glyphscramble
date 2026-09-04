import { sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  addComponent,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";
import type { NuxtModule } from "@nuxt/schema";
import {
  loadGlyphConfig,
  validateGlyphConfig,
  type GlyphResponseFace,
} from "@brip/glyphscramble";
import { assertSupportedNitroPreset } from "./preset.js";
import { normalizeProtectedRoutes } from "./routes.js";

export interface GlyphScrambleNuxtModuleOptions {
  /** Config file relative to Nuxt's root directory. */
  configFile?: string;
  /** Fixed prepared-face scope authorized for every response context. */
  faces?: readonly GlyphResponseFace[];
  streaming?: {
    /**
     * Routes whose no-store policy must be committed before rendering starts.
     * Each entry matches the exact path and its descendants.
     */
    protectedRoutes?: readonly `/${string}`[];
  };
}

interface GlyphNitroBuildConfig {
  preset?: string;
  externals?: {
    external?: Array<string | RegExp>;
  };
  rollupConfig?: {
    external?: Array<string | RegExp>;
  };
}

const glyphscrambleModule: NuxtModule<
  GlyphScrambleNuxtModuleOptions,
  GlyphScrambleNuxtModuleOptions,
  false
> = defineNuxtModule<GlyphScrambleNuxtModuleOptions>({
  meta: {
    name: "@brip/glyphscramble-nuxt",
    configKey: "glyphscramble",
    compatibility: { nuxt: ">=4.0.0 <5.0.0" },
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url);
    const cwd = nuxt.options.rootDir;
    const configPath = resolver.resolve(
      cwd,
      options.configFile ?? "glyphscramble.config.ts",
    );
    const config = await loadGlyphConfig(configPath);
    validateGlyphConfig(config);
    const coreEntry = fileURLToPath(import.meta.resolve("@brip/glyphscramble"));
    const linkedWorkspaceCore = !coreEntry.includes(`${sep}node_modules${sep}`);
    const protectedRoutes = normalizeProtectedRoutes(
      options.streaming?.protectedRoutes,
    );
    const runtimeOptions = {
      cwd,
      faces: options.faces ?? null,
      protectedRoutes,
      routePrefix: config.routePrefix,
      instanceKey: pathToFileURL(configPath).href,
    };

    addServerTemplate({
      filename: "#glyphscramble/config.mjs",
      getContents: () =>
        `export default Object.freeze(${JSON.stringify(config)});\nexport const glyphscrambleRuntimeOptions = Object.freeze(${JSON.stringify(runtimeOptions)});\n`,
    });
    addComponent({
      name: "GlyphScramble",
      export: "GlyphScramble",
      filePath: "@brip/glyphscramble-vue",
    });
    addServerImports({
      name: "useGlyphScramble",
      from: "@brip/glyphscramble-nuxt/context",
    });
    addServerPlugin(resolver.resolve("./runtime/plugin.js"));
    addServerHandler({
      route: `${config.routePrefix}/font/:token/:face`,
      handler: resolver.resolve("./runtime/font-handler.js"),
    });
    const onNitroConfig = nuxt.hook as unknown as (
      name: "nitro:config",
      handler: (nitroConfig: GlyphNitroBuildConfig) => void,
    ) => void;
    onNitroConfig("nitro:config", (nitroConfig) => {
      assertSupportedNitroPreset(
        process.env.NITRO_PRESET ?? nitroConfig.preset,
      );
      nitroConfig.externals ??= {};
      nitroConfig.externals.external ??= [];
      if (!nitroConfig.externals.external.includes("@brip/glyphscramble"))
        nitroConfig.externals.external.push("@brip/glyphscramble");
      if (linkedWorkspaceCore) {
        // A monorepo symlink resolves outside node_modules, where Nitro cannot
        // infer its package name. Keep the specifier for local fixtures; npm
        // installs use Nitro's normal traced-external path above.
        nitroConfig.rollupConfig ??= {};
        nitroConfig.rollupConfig.external ??= [];
        if (!nitroConfig.rollupConfig.external.includes("@brip/glyphscramble"))
          nitroConfig.rollupConfig.external.push("@brip/glyphscramble");
      }
    });
    addTypeTemplate(
      {
        filename: "types/glyphscramble.d.ts",
        getContents:
          () => `import type { ResponseContext } from "@brip/glyphscramble";

declare module "h3" {
  interface H3EventContext {
    glyphscramble?: ResponseContext;
  }
}

export {};
`,
      },
      { nitro: true, nuxt: true },
    );
  },
});

export default glyphscrambleModule;
