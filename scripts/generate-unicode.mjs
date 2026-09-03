import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import process from "node:process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const manifest = JSON.parse(
  await readFile(join(scriptDirectory, "unicode-17-sources.json"), "utf8"),
);
const require = createRequire(
  new URL("../packages/core/package.json", import.meta.url),
);
const packageJson = require(`${manifest.package.name}/package.json`);
if (packageJson.version !== manifest.package.version)
  throw new Error(
    `${manifest.package.name} must be ${manifest.package.version}; found ${packageJson.version}.`,
  );
const unicodeRoot = dirname(
  require.resolve(`${manifest.package.name}/package.json`),
);
const LIMIT = 0x110000;

const argumentsList = process.argv.slice(2);
const check = argumentsList.includes("--check");
const option = (name) => {
  const index = argumentsList.indexOf(name);
  if (index < 0) return undefined;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${name} requires a directory.`);
  return resolve(value);
};
const sourceDirectory = option("--ucd-dir");
const downloadDirectory = option("--download-dir");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function enumerated(name, fallback) {
  const values = new Array(LIMIT).fill(fallback);
  for (const entry of await readdir(join(unicodeRoot, name), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const codepoints = require(
      join(unicodeRoot, name, entry.name, "code-points.js"),
    );
    for (const cp of codepoints) values[cp] = entry.name;
  }
  return values;
}

async function binary(name) {
  return new Set(
    require(join(unicodeRoot, "Binary_Property", name, "code-points.js")),
  );
}

function parseRanges(
  text,
  propertyIndex,
  target,
  normalize = (value) => value,
) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const fields = line.split(";").map((value) => value.trim());
    const [from, to = from] = fields[0]
      .split("..")
      .map((value) => Number.parseInt(value, 16));
    const property = normalize(fields[propertyIndex]);
    for (let cp = from; cp <= to; cp++) target[cp] = property;
  }
}

async function verifiedSource(name) {
  const entry = manifest.sources[name];
  if (!entry) throw new Error(`Unicode source ${name} is not in the manifest.`);
  let bytes;
  if (sourceDirectory) bytes = await readFile(join(sourceDirectory, name));
  else {
    const response = await globalThis.fetch(entry.url);
    if (!response.ok)
      throw new Error(`${entry.url} returned ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const actual = digest(bytes);
  if (actual !== entry.sha256)
    throw new Error(
      `${name} SHA-256 mismatch: expected ${entry.sha256}, received ${actual}.`,
    );
  if (downloadDirectory) {
    await mkdir(downloadDirectory, { recursive: true });
    await writeFile(join(downloadDirectory, name), bytes);
  }
  return bytes.toString("utf8");
}

function compactBooleanRanges(values) {
  const ranges = [];
  let start = -1;
  for (let cp = 0; cp <= LIMIT; cp++) {
    const set = cp < LIMIT && values(cp);
    if (set && start < 0) start = cp;
    else if (!set && start >= 0) {
      ranges.push([start, cp - 1]);
      start = -1;
    }
  }
  return ranges;
}

const category = require(join(unicodeRoot, "General_Category", "index.js"));
const bidi = require(join(unicodeRoot, "Bidi_Class", "index.js"));
const script = await enumerated("Script", "Unknown");
const scriptExtensions = Array.from({ length: LIMIT }, () => []);
for (const entry of await readdir(join(unicodeRoot, "Script_Extensions"), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const codepoints = require(
    join(unicodeRoot, "Script_Extensions", entry.name, "code-points.js"),
  );
  for (const cp of codepoints) scriptExtensions[cp].push(entry.name);
}
const grapheme = await enumerated("Grapheme_Cluster_Break", "Other");
const word = await enumerated("Word_Break", "Other");
const line = await enumerated("Line_Break", "Unknown");
const indicSyllabic = await enumerated("Indic_Syllabic_Category", "Other");
const indicPositional = await enumerated("Indic_Positional_Category", "NA");
const vertical = await enumerated("Vertical_Orientation", "Rotated");
const defaultIgnorable = await binary("Default_Ignorable_Code_Point");
const emojiSets = await Promise.all(
  [
    "Emoji",
    "Emoji_Presentation",
    "Emoji_Modifier",
    "Emoji_Modifier_Base",
    "Emoji_Component",
    "Extended_Pictographic",
  ].map(binary),
);

const combining = new Array(LIMIT).fill("0");
for (const raw of (await verifiedSource("UnicodeData.txt")).split(/\r?\n/)) {
  if (!raw) continue;
  const fields = raw.split(";");
  const cp = Number.parseInt(fields[0], 16);
  combining[cp] = fields[3];
}
const eastAsianWidth = new Array(LIMIT).fill("N");
parseRanges(await verifiedSource("EastAsianWidth.txt"), 1, eastAsianWidth);
const joiningType = new Array(LIMIT).fill("U");
const joiningGroup = new Array(LIMIT).fill("No_Joining_Group");
for (const raw of (await verifiedSource("ArabicShaping.txt")).split(/\r?\n/)) {
  const lineValue = raw.replace(/#.*/, "").trim();
  if (!lineValue) continue;
  const [point, , type, group] = lineValue
    .split(";")
    .map((value) => value.trim());
  const cp = Number.parseInt(point, 16);
  joiningType[cp] = type;
  joiningGroup[cp] = group.replaceAll(" ", "_");
}

const structuralRanges = compactBooleanRanges((cp) => {
  const general = category.get(cp);
  return (
    defaultIgnorable.has(cp) ||
    general === "Control" ||
    general === "Format" ||
    general.endsWith("_Separator") ||
    general.endsWith("_Mark") ||
    general.endsWith("_Punctuation")
  );
});

const keys = [];
const keyIds = new Map();
const ranges = [];
let rangeStart = -1;
let rangeKey = -1;
const close = (end) => {
  if (rangeStart >= 0) ranges.push([rangeStart, end, rangeKey]);
};

for (let cp = 0; cp < LIMIT; cp++) {
  const general = category.get(cp);
  const eligible =
    !defaultIgnorable.has(cp) &&
    combining[cp] === "0" &&
    !general.endsWith("_Punctuation") &&
    (general.endsWith("_Letter") ||
      general.endsWith("_Number") ||
      emojiSets[0].has(cp));
  let keyId = -1;
  if (eligible) {
    const extensions = scriptExtensions[cp].length
      ? scriptExtensions[cp].sort().join(",")
      : script[cp];
    const emoji = emojiSets.map((set) => (set.has(cp) ? "1" : "0")).join("");
    const key = [
      extensions,
      general,
      bidi.get(cp) ?? "Unassigned",
      joiningType[cp],
      joiningGroup[cp],
      combining[cp],
      grapheme[cp],
      word[cp],
      line[cp],
      eastAsianWidth[cp],
      indicSyllabic[cp],
      indicPositional[cp],
      vertical[cp],
      emoji,
      cp <= 0xffff ? "bmp" : "astral",
    ].join(":");
    let keyIdValue = keyIds.get(key);
    if (keyIdValue === undefined) {
      keyIdValue = keys.length;
      keys.push(key);
      keyIds.set(key, keyIdValue);
    }
    keyId = keyIdValue;
  }
  if (keyId !== rangeKey) {
    close(cp - 1);
    rangeStart = keyId < 0 ? -1 : cp;
    rangeKey = keyId;
  } else if (keyId >= 0 && rangeStart < 0) rangeStart = cp;
}
close(LIMIT - 1);

const sourceDigests = Object.fromEntries(
  Object.entries(manifest.sources).map(([name, entry]) => [name, entry.sha256]),
);
const output =
  `// Generated from verified Unicode 17.0.0 inputs. Do not edit by hand.\n` +
  `export const unicodeSourceDigests = ${JSON.stringify(sourceDigests)} as const;\n` +
  `export const unicodeStructuralRanges: readonly (readonly [number, number])[] = ${JSON.stringify(structuralRanges)};\n` +
  `export const unicodePropertyKeys: readonly string[] = ${JSON.stringify(keys)};\n` +
  `export const unicodePropertyRanges: readonly (readonly [number, number, number])[] = ${JSON.stringify(ranges)};\n`;
const outputPath = join(repositoryRoot, manifest.generated.path);
const outputDigest = digest(output);
if (check) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== output)
    throw new Error(
      "Generated Unicode data is stale; run pnpm generate:unicode.",
    );
  if (manifest.generated.sha256 !== outputDigest)
    throw new Error(
      `Generated Unicode SHA-256 mismatch: manifest has ${manifest.generated.sha256}, output is ${outputDigest}.`,
    );
} else await writeFile(outputPath, output);
process.stdout.write(
  `Unicode 17: ${keys.length} signatures, ${ranges.length} property ranges, ${structuralRanges.length} structural ranges, sha256 ${outputDigest}\n`,
);
