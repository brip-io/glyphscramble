/* global fetch */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const artifacts = resolve(process.argv[2] ?? "release-artifacts");
const inventory = JSON.parse(
  await readFile(join(artifacts, "package-inventory.json"), "utf8"),
);

for (const item of inventory.packages) {
  const encodedName = item.name.replace("/", "%2f");
  const response = await fetch(
    `https://registry.npmjs.org/${encodedName}/${item.version}`,
  );
  if (!response.ok)
    throw new Error(`${item.name}@${item.version} is unavailable from npm.`);
  const metadata = await response.json();
  const tarball = await fetch(metadata.dist?.tarball);
  if (!tarball.ok)
    throw new Error(`${item.name}@${item.version} tarball is unavailable.`);
  const digest = createHash("sha256")
    .update(new Uint8Array(await tarball.arrayBuffer()))
    .digest("hex");
  if (digest !== item.sha256)
    throw new Error(`${item.name}@${item.version} tarball digest drifted.`);
  if (
    !metadata.dist?.attestations?.url ||
    metadata.dist?.attestations?.provenance?.predicateType !==
      "https://slsa.dev/provenance/v1"
  )
    throw new Error(`${item.name}@${item.version} has no npm provenance.`);

  const packageResponse = await fetch(
    `https://registry.npmjs.org/${encodedName}`,
  );
  const packageMetadata = await packageResponse.json();
  if (packageMetadata["dist-tags"]?.[inventory.distTag] !== item.version)
    throw new Error(
      `${item.name} ${inventory.distTag} does not point to ${item.version}.`,
    );
  if (
    inventory.distTag === "beta" &&
    packageMetadata["dist-tags"]?.latest === item.version
  )
    throw new Error(`${item.name} prerelease moved the latest dist-tag.`);
}

process.stdout.write(
  `Verified npm digests, provenance, and ${inventory.distTag} dist-tags for ${inventory.packages.length} packages.\n`,
);
