import { describe, expect, it } from "vitest";
import {
  beatAt,
  beats,
  fixture,
  segment,
} from "../components/cinematic-hero/storyboard";
import {
  beatStart,
  beatPreview,
  createProgressStore,
  scrollerProgress,
  stepProgress,
} from "../components/cinematic-hero/scroll-progress";

const forbiddenClaims = [
  /\bblocks?\b/i,
  /\bprevents?\b/i,
  /\bstops?\b/i,
  /\ball agents\b/i,
  /\bevery agent\b/i,
  /\bunreadable\b/i,
];

describe("cinematic storyboard", () => {
  it("covers scroll progress contiguously from 0 to 1", () => {
    expect(beats[0]?.range[0]).toBe(0);
    expect(beats[beats.length - 1]?.range[1]).toBe(1);
    for (let index = 1; index < beats.length; index++) {
      const beat = beats[index]!;
      const previous = beats[index - 1]!;
      expect(beat.range[0]).toBe(previous.range[1]);
      expect(beat.range[1]).toBeGreaterThan(beat.range[0]);
      expect(beat.index).toBe(index);
    }
  });

  it("starts on the title and ends on the recovery boundary", () => {
    expect(beats[0]?.id).toBe("title");
    expect(beats[beats.length - 1]?.id).toBe("recovery");
    expect(beatAt(0).id).toBe("title");
    expect(beatAt(1).id).toBe("recovery");
    expect(beatAt(2).id).toBe("recovery");
    expect(beatAt(-1).id).toBe("title");
  });

  it("keeps camera keys ordered inside each beat", () => {
    for (const beat of beats) {
      let previous = -1;
      for (const key of beat.camera) {
        const at = key.at ?? 0;
        expect(at).toBeGreaterThanOrEqual(previous);
        expect(at).toBeLessThanOrEqual(1);
        previous = at;
      }
    }
  });

  it("never overclaims in captions", () => {
    for (const beat of beats) {
      for (const pattern of forbiddenClaims) {
        expect(
          [beat.caption, beat.headline, beat.summary].join(" "),
        ).not.toMatch(pattern);
      }
      if (/DRM/.test(beat.caption)) {
        expect(beat.caption).toMatch(/not DRM/);
      }
    }
    const recovery = beats.find((beat) => beat.id === "recovery");
    expect(recovery?.caption).toMatch(/recover/i);
    const raw = beats.find((beat) => beat.id === "raw-agent");
    expect(raw?.caption).toMatch(/raw-fetch/i);
  });

  it("uses the real fixture strings", () => {
    expect(fixture.encodedText).not.toBe(fixture.sentence);
    expect(fixture.encodedText.length).toBe(fixture.sentence.length);
    expect(fixture.family).toMatch(/^GlyphScrambleDemo-runtime-a$/);
    expect(fixture.fontFile).toMatch(/\.woff2$/);
  });

  it("maps progress to local beat time", () => {
    expect(segment(0.5, [0.4, 0.6])).toBeCloseTo(0.5);
    expect(segment(0.1, [0.4, 0.6])).toBe(0);
    expect(segment(0.9, [0.4, 0.6])).toBe(1);
    expect(segment(0.5, [0.5, 0.5])).toBe(1);
  });
});

describe("scroll progress store", () => {
  it("clamps, deduplicates, and notifies", () => {
    const store = createProgressStore();
    const seen: number[] = [];
    const stop = store.subscribe((value) => seen.push(value));
    store.set(0.25);
    store.set(0.25);
    store.set(2);
    store.set(-1);
    stop();
    store.set(0.5);
    expect(seen).toEqual([0.25, 1, 0]);
    expect(store.get()).toBe(0.5);
  });

  it("steps between beats with the arrow keys", () => {
    const prepare = beats[1]!;
    expect(stepProgress(0, 1)).toBeCloseTo(beatPreview(1));
    expect(beatStart(1)).toBeGreaterThan(prepare.range[0]);
    expect(stepProgress(beatPreview(1), 1)).toBeCloseTo(beatPreview(2));
    // Up from just inside a beat returns to the previous beat.
    expect(stepProgress(beatPreview(2), -1)).toBeCloseTo(beatPreview(1));
    // Previous always changes chapters, including from a settled preview.
    expect(stepProgress(0.28, -1)).toBeCloseTo(beatPreview(1));
    expect(stepProgress(0.04, -1)).toBeNull();
    expect(stepProgress(0, -1)).toBeNull();
    expect(stepProgress(1, 1)).toBeNull();
    expect(stepProgress(0.95, 1)).toBeNull();
  });

  it("chapter previews remain inside their chapter and show the completed human reveal", () => {
    for (const beat of beats)
      expect(beatAt(beatPreview(beat.index))).toBe(beat);
    expect(segment(beatPreview(7), beats[7]!.range)).toBeGreaterThan(0.92);
    expect(beatPreview(-1)).toBe(0);
    expect(beatAt(beatPreview(99)).id).toBe("recovery");
  });

  it("derives progress from the scroller geometry", () => {
    expect(scrollerProgress(100, 1000, 100, 100)).toBe(0);
    expect(scrollerProgress(100, 1000, 100, 550)).toBeCloseTo(0.5);
    expect(scrollerProgress(100, 1000, 100, 5000)).toBe(1);
    expect(scrollerProgress(100, 100, 100, 5000)).toBe(0);
  });
});
