import { clamp01 } from "./storyboard";

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
