import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { build } from "vite";

const output = join(process.cwd(), "dist-site");
const staging = join(process.cwd(), ".glyphscramble/vite-input");

async function manifestIdentity() {
  const root = join(output, "_glyphscramble");
  const builds = await readdir(root);
  if (builds.length !== 1)
    throw new Error(`Expected one static build, received ${builds.length}.`);
  const files = await readdir(join(root, builds[0]));
  const manifest = files.find((file) =>
    file.startsWith("glyphscramble-static-manifest."),
  );
  if (!manifest) throw new Error("Static manifest is missing.");
  const value = JSON.parse(
    await readFile(join(root, builds[0], manifest), "utf8"),
  );
  return value.buildId;
}

const first = await manifestIdentity();
const stale = join(output, "stale-output.txt");
await writeFile(stale, "must not survive the next Vite build");
await build();
const second = await manifestIdentity();
if (first === second)
  throw new Error("Two unseeded Vite builds reused one static mapping.");
await access(stale).then(
  () => {
    throw new Error("The fresh Vite publication retained stale output.");
  },
  () => undefined,
);
await access(staging).then(
  () => {
    throw new Error("The Vite staging tree survived successful publication.");
  },
  () => undefined,
);
