"use client";

import { invalidate, useFrame } from "@react-three/fiber";
import type { ReactNode, RefObject } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import { MathUtils } from "three";
import type { ProgressStore } from "./scroll-progress";
import type { Beat, BeatId } from "./storyboard";
import { beatAt, beatById, segment } from "./storyboard";

export interface TimelineState {
  /** Smoothed global progress in [0, 1]. */
  p: number;
  /** Raw (unsmoothed) scroll progress. */
  raw: number;
  /** Beat at the smoothed progress. */
  beat: Beat;
  /** Local time inside `beat`. */
  t: number;
  /** Seconds since mount. */
  time: number;
  delta: number;
}

const TimelineContext = createContext<RefObject<TimelineState> | null>(null);

export function useTimeline(): RefObject<TimelineState> {
  const context = useContext(TimelineContext);
  if (!context) throw new Error("useTimeline outside TimelineDriver");
  return context;
}

/** Local time of a beat at the smoothed progress, clamped to [0, 1]. */
export function local(state: TimelineState, id: BeatId): number {
  return segment(state.p, beatById(id).range);
}

/** True while smoothed progress is inside [first.start - pad, last.end + pad]. */
export function within(
  state: TimelineState,
  first: BeatId,
  last: BeatId = first,
  pad = 0,
): boolean {
  return (
    state.p >= beatById(first).range[0] - pad &&
    state.p < beatById(last).range[1] + pad
  );
}

interface TimelineDriverProps {
  store: ProgressStore;
  inView: boolean;
  children: ReactNode;
}

/**
 * Damps scroll progress every frame and keeps the demand-mode render loop
 * alive only while the stage is on screen.
 */
export function TimelineDriver({
  store,
  inView,
  children,
}: TimelineDriverProps) {
  const ref = useMemo<RefObject<TimelineState>>(
    () => ({
      current: {
        p: store.get(),
        raw: store.get(),
        beat: beatAt(store.get()),
        t: 0,
        time: 0,
        delta: 0,
      },
    }),
    [store],
  );

  // Demand mode only re-renders on invalidate(); the frame callback keeps the
  // loop alive while visible, and these listeners restart it after a pause.
  useEffect(() => {
    const wake = () => invalidate();
    const unsubscribe = store.subscribe(wake);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [store, inView]);

  useFrame((_, delta) => {
    const state = ref.current;
    const raw = store.get();
    const dt = Math.min(delta, 1 / 20);
    state.raw = raw;
    state.p =
      Math.abs(raw - state.p) < 0.00005
        ? raw
        : MathUtils.damp(state.p, raw, 7, dt);
    state.beat = beatAt(state.p);
    state.t = segment(state.p, state.beat.range);
    state.time += dt;
    state.delta = dt;
    if (inView && document.visibilityState === "visible") invalidate();
  }, -10);

  return (
    <TimelineContext.Provider value={ref}>{children}</TimelineContext.Provider>
  );
}
