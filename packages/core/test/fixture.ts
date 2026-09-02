import { buildCmap } from "../src/cmap.js";
import { buildSfnt, type SfntFont } from "../src/sfnt.js";

export function syntheticFont(): Uint8Array {
  const head = new Uint8Array(54);
  const headView = new DataView(head.buffer);
  headView.setUint32(0, 0x00010000);
  headView.setUint32(12, 0x5f0f3cf5);
  headView.setUint16(18, 1000);
  const maxp = new Uint8Array(6);
  const maxpView = new DataView(maxp.buffer);
  maxpView.setUint32(0, 0x00010000);
  maxpView.setUint16(4, 512);
  const mapping = new Map<number, number>();
  let glyph = 1;
  for (let cp = 0x20; cp <= 0x7e; cp++) mapping.set(cp, glyph++);
  for (const cp of [
    0x05d0, 0x05d1, 0x05d2, 0x0627, 0x0628, 0x062a, 0x0915, 0x0916, 0x0917,
    0x0e01, 0x0e02, 0x0e04, 0x1f600, 0x1f601,
  ]) {
    mapping.set(cp, glyph++);
  }
  const font: SfntFont = {
    flavor: 0x00010000,
    tables: new Map([
      [
        "cmap",
        buildCmap(mapping, [
          {
            selector: 0xfe0f,
            defaults: new Set([0x1f600]),
            nonDefault: new Map([[0x1f601, mapping.get(0x1f601)!]]),
          },
        ]),
      ],
      ["head", head],
      ["maxp", maxp],
      ["name", new TextEncoder().encode("preserve-this-table")],
    ]),
  };
  return buildSfnt(font);
}
