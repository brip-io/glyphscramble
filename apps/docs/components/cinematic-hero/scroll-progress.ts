import { beatAt, beats, clamp01 } from "./storyboard";

export interface ProgressStore {
  get(): number;
  set(value: number): void;
  subscribe(listener: (value: number) => void): () => void;
}

/**
 * Tiny external store for scroll progress. Written from a passive scroll
 * listener and read inside the render loop, so React state is never touched
 * per frame.
 */
export function createProgressStore(initial = 0): ProgressStore {
  let value = clamp01(initial);
  const listeners = new Set<(value: number) => void>();
  return {
    get: () => value,
    set(next) {
      const clamped = clamp01(next);
      if (clamped === value) return;
      value = clamped;
      for (const listener of listeners) listener(clamped);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Progress at which a beat starts, nudged inside its window. */
export function beatStart(index: number): number {
  const beat = beats[Math.min(Math.max(index, 0), beats.length - 1)]!;
  return beat.index === 0 ? 0 : Math.min(beat.range[0] + 0.002, 1);
}

/**
 * Where a keyboard step should land: the start of the next beat for +1, the
 * start of the previous beat for -1 (or of the current beat when the reader
 * is already well inside it). Returns null when stepping past either end.
 */
export function stepProgress(p: number, direction: 1 | -1): number | null {
  const beat = beatAt(p);
  if (direction === 1) {
    if (beat.index >= beats.length - 1) return null;
    return beatStart(beat.index + 1);
  }
  const insideBy = p - beat.range[0];
  if (insideBy > 0.02 && beat.index > 0) return beatStart(beat.index);
  if (beat.index === 0) return p <= 0 ? null : 0;
  return beatStart(beat.index - 1);
}

/** Scroll progress of a tall scroller whose sticky stage fills the viewport. */
export function scrollerProgress(
  scrollerTop: number,
  scrollerHeight: number,
  viewportHeight: number,
  scrollY: number,
): number {
  const travel = scrollerHeight - viewportHeight;
  if (travel <= 0) return 0;
  return clamp01((scrollY - scrollerTop) / travel);
}
