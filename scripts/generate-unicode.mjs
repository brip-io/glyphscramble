import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readdir, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const require = createRequire(
  new URL("../packages/core/package.json", import.meta.url),
);
const root = dirname(require.resolve("@unicode/unicode-17.0.0/package.json"));
const LIMIT = 0x110000;

async function enumerated(name, fallback) {
  const values = new Array(LIMIT).fill(fallback);
  for (const entry of await readdir(join(root, name), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const codepoints = require(join(root, name, entry.name, "code-points.js"));
    for (const cp of codepoints) values[cp] = entry.name;
  }
  return values;
}

async function binary(name) {
  return new Set(
    require(join(root, "Binary_Property", name, "code-points.js")),
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

async function source(name) {
  const url = `https://www.unicode.org/Public/17.0.0/ucd/${name}`;
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

const category = require(join(root, "General_Category", "index.js"));
const bidi = require(join(root, "Bidi_Class", "index.js"));
const script = await enumerated("Script", "Unknown");
const scriptExtensions = Array.from({ length: LIMIT }, () => []);
for (const entry of await readdir(join(root, "Script_Extensions"), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const codepoints = require(
    join(root, "Script_Extensions", entry.name, "code-points.js"),
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
for (const raw of (await source("UnicodeData.txt")).split(/\r?\n/)) {
  if (!raw) continue;
  const fields = raw.split(";");
  const cp = Number.parseInt(fields[0], 16);
  combining[cp] = fields[3];
}
const eastAsianWidth = new Array(LIMIT).fill("N");
parseRanges(await source("EastAsianWidth.txt"), 1, eastAsianWidth);
const joiningType = new Array(LIMIT).fill("U");
const joiningGroup = new Array(LIMIT).fill("No_Joining_Group");
for (const raw of (await source("ArabicShaping.txt")).split(/\r?\n/)) {
  const line = raw.replace(/#.*/, "").trim();
  if (!line) continue;
  const [point, , type, group] = line.split(";").map((value) => value.trim());
  const cp = Number.parseInt(point, 16);
  joiningType[cp] = type;
  joiningGroup[cp] = group.replaceAll(" ", "_");
}

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
    keyId = keyIds.get(key);
    if (keyId === undefined) {
      keyId = keys.length;
      keys.push(key);
      keyIds.set(key, keyId);
    }
  }
  if (keyId !== rangeKey) {
    close(cp - 1);
    rangeStart = keyId < 0 ? -1 : cp;
    rangeKey = keyId;
  } else if (keyId >= 0 && rangeStart < 0) rangeStart = cp;
}
close(LIMIT - 1);

const output =
  `// Generated from Unicode 17.0.0 UCD. Do not edit by hand.\n` +
  `export const unicodePropertyKeys: readonly string[] = ${JSON.stringify(keys)};\n` +
  `export const unicodePropertyRanges: readonly (readonly [number, number, number])[] = ${JSON.stringify(ranges)};\n`;
await writeFile(
  new URL("../packages/core/src/generated/unicode17.ts", import.meta.url),
  output,
);
process.stdout.write(
  `Unicode 17: ${keys.length} signatures, ${ranges.length} ranges\n`,
);
