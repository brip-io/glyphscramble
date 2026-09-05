import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { discoverGlyphConfigPath, loadGlyphConfig } from "./config-loader.js";
import type { DoctorFinding } from "./types.js";

const GUIDE = "https://github.com/brip-io/glyphscramble#install-and-prepare";
const USAGE =
  "https://github.com/brip-io/glyphscramble/blob/main/docs/USAGE-GUIDE.md";

async function sourceFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  if (!existsSync(root)) return paths;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await sourceFiles(path)));
    else if (
      [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".vue",
        ".svelte",
        ".astro",
        ".html",
      ].includes(extname(path))
    )
      paths.push(path);
  }
  return paths;
}

function finding(
  severity: DoctorFinding["severity"],
  code: string,
  message: string,
  file?: string,
): DoctorFinding {
  return { severity, code, message, ...(file ? { file } : {}) };
}

async function inspectSources(root: string): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, "utf8");
    if (
      /^["']use client["'];?/m.test(source) &&
      /\.scramble(?:Async)?\s*\(/.test(source)
    )
      findings.push(
        finding(
          "error",
          "CLIENT-PLAINTEXT",
          `Move scramble() into the server boundary; plaintext may enter a JavaScript chunk. ${USAGE}#protect-selectively`,
          file,
        ),
      );
    if (
      /<(?:h[1-6]|button|label|form|input|textarea)[^>]*data-glyphscramble/iu.test(
        source,
      )
    )
      findings.push(
        finding(
          "warning",
          "ESSENTIAL-CONTENT",
          `Remove protection from navigation, headings, or forms; those uses create SEO and accessibility risk. ${USAGE}#protect-selectively`,
          file,
        ),
      );
    if (/aria-label\s*=.*(?:encodedText|glyph)/iu.test(source))
      findings.push(
        finding(
          "warning",
          "A11Y-MIRROR",
          `Remove the ARIA mirror; do not expose scrambled or plaintext content through accessibility attributes. ${USAGE}#accessibility`,
          file,
        ),
      );
    if (
      /data-glyphscramble-font/iu.test(source) &&
      /(?:use client|client:|data-(?:reactroot|vue|sveltekit))/iu.test(source)
    )
      findings.push(
        finding(
          "error",
          "STATIC-HYDRATION",
          `Keep static protected blocks outside hydrated islands. ${USAGE}#static-compiler-boundary`,
          file,
        ),
      );
  }
  return findings;
}

const SUPPORT = {
  next: {
    package: "next",
    adapter: "@brip/glyphscramble-next",
    min: 16,
    max: 17,
  },
  nuxt: {
    package: "nuxt",
    adapter: "@brip/glyphscramble-nuxt",
    min: 4,
    max: 5,
  },
  sveltekit: {
    package: "@sveltejs/kit",
    adapter: "@brip/glyphscramble-sveltekit",
    min: 2,
    max: 3,
  },
  astro: {
    package: "astro",
    adapter: "@brip/glyphscramble-astro",
    min: 7,
    max: 8,
  },
  vite: {
    package: "vite",
    adapter: "@brip/glyphscramble-vite",
    min: 7,
    max: 9,
  },
} as const;

export async function doctorProject(
  options: {
    cwd?: string;
    root?: string;
    configPath?: string;
  } = {},
): Promise<DoctorFinding[]> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const findings = await inspectSources(resolve(cwd, options.root ?? "src"));
  let configPath: string;
  try {
    configPath = options.configPath
      ? resolve(cwd, options.configPath)
      : discoverGlyphConfigPath(cwd);
  } catch (error) {
    findings.push(
      finding(
        "error",
        "CONFIG-MISSING",
        `${error instanceof Error ? error.message : String(error)} Repair: npx @brip/glyphscramble init --dry-run. ${GUIDE}`,
      ),
    );
    return findings;
  }

  try {
    const config = await loadGlyphConfig(configPath);
    findings.push(
      finding(
        "info",
        "CONFIG-READY",
        `Loaded ${relative(cwd, configPath)} with ${Object.keys(config.fonts).length} configured font(s).`,
      ),
    );
    const secret = process.env[config.rotation.secretEnv];
    if (!secret || secret.length < 32)
      findings.push(
        finding(
          "error",
          "SECRET-MISSING",
          `Set ${config.rotation.secretEnv} to at least 32 characters before runtime. Repair: openssl rand -base64 48. ${USAGE}#runtime-secrets-and-rotation`,
        ),
      );
    else
      findings.push(
        finding(
          "info",
          "SECRET-READY",
          `${config.rotation.secretEnv} satisfies the minimum runtime length.`,
        ),
      );

    const lockPath = join(cwd, ".glyphscramble", "glyphscramble.lock.json");
    try {
      const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
        version?: unknown;
        fonts?: Record<string, { license?: { noticeFile?: unknown } }>;
      };
      if (lock.version !== 2)
        throw new Error(`unsupported lock version ${String(lock.version)}`);
      const missingNotices = Object.values(lock.fonts ?? {})
        .map((font) => font.license?.noticeFile)
        .filter(
          (file): file is string =>
            typeof file === "string" &&
            !existsSync(join(cwd, ".glyphscramble", file)),
        );
      if (missingNotices.length)
        throw new Error(`missing licence output ${missingNotices.join(", ")}`);
      findings.push(
        finding(
          "info",
          "FONTS-READY",
          `Prepared assets and licence notices are present in .glyphscramble/.`,
        ),
      );
    } catch (error) {
      findings.push(
        finding(
          "error",
          "FONTS-NOT-PREPARED",
          `Prepared assets are unavailable or invalid (${error instanceof Error ? error.message : String(error)}). Repair: npm exec glyphscramble -- prepare. ${GUIDE}`,
        ),
      );
    }
  } catch (error) {
    findings.push(
      finding(
        "error",
        "CONFIG-INVALID",
        `${error instanceof Error ? error.message : String(error)} Repair the config, then run npm exec glyphscramble -- prepare. ${GUIDE}`,
      ),
    );
  }

  const packagePath = join(cwd, "package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(await readFile(packagePath, "utf8"));
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    const framework = (
      Object.keys(SUPPORT) as Array<keyof typeof SUPPORT>
    ).find((candidate) => dependencies[SUPPORT[candidate].package]);
    if (!framework) {
      if (dependencies["@brip/glyphscramble"])
        findings.push(
          finding(
            "info",
            "BOUNDARY-GENERIC",
            "Core package detected without a framework adapter; verify that a generic Fetch/Node server boundary owns plaintext and font routing.",
          ),
        );
      else
        findings.push(
          finding(
            "error",
            "CORE-MISSING",
            `Install @brip/glyphscramble in the server application. Repair: npm install @brip/glyphscramble. ${GUIDE}`,
          ),
        );
    } else {
      const support = SUPPORT[framework];
      const rawVersion = dependencies[support.package];
      const major = Number(String(rawVersion ?? "").match(/\d+/u)?.[0]);
      if (
        !Number.isInteger(major) ||
        major < support.min ||
        major >= support.max
      )
        findings.push(
          finding(
            "error",
            "FRAMEWORK-UNSUPPORTED",
            `${support.package}@${String(rawVersion)} is outside the supported >=${support.min} <${support.max} range. ${GUIDE}`,
          ),
        );
      else if (!dependencies[support.adapter])
        findings.push(
          finding(
            "error",
            "ADAPTER-MISSING",
            `Install ${support.adapter}. Repair: npm install @brip/glyphscramble ${support.adapter}. ${GUIDE}`,
          ),
        );
      else
        findings.push(
          finding(
            "info",
            "ADAPTER-READY",
            `${support.adapter} matches detected ${support.package}@${rawVersion}.`,
          ),
        );
    }
  }

  if (
    !findings.some((item) =>
      [
        "CLIENT-PLAINTEXT",
        "ESSENTIAL-CONTENT",
        "A11Y-MIRROR",
        "STATIC-HYDRATION",
      ].includes(item.code),
    )
  )
    findings.push(
      finding(
        "info",
        "SOURCE-READY",
        "No obvious client leakage, hydrated-static, ARIA-mirror, or essential-content usage found.",
      ),
    );
  return findings;
}
