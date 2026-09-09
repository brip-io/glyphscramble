"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { BeatId } from "../storyboard";
import { useTimeline } from "../timeline";

const HOT_SPOTS: Record<BeatId, [number, number, number]> = {
  title: [0, 0.5, -2],
  prepare: [-2, 1, -1],
  buckets: [0, 1, 0],
  permute: [0, 1.5, 1],
  bake: [-2, 1, -1],
  lease: [0, 2, -1],
  "raw-agent": [5, 1, 1.5],
  human: [-5, 1, 1.5],
  recovery: [0, 1, 1],
};

/** Palette-tinted three-point lighting plus a follow light and depth fog. */
export function StageLights() {
  const timeline = useTimeline();
  const follow = useRef<THREE.PointLight>(null);

  useFrame(() => {
    const light = follow.current;
    if (!light) return;
    const state = timeline.current;
    const spot: readonly [number, number, number] =
      state.beat.id === "bake" && state.t > 0.6
        ? [0, 1, -2]
        : HOT_SPOTS[state.beat.id];
    const dt = state.delta;
    light.position.x = THREE.MathUtils.damp(light.position.x, spot[0], 5, dt);
    light.position.y = THREE.MathUtils.damp(light.position.y, spot[1], 5, dt);
    light.position.z = THREE.MathUtils.damp(light.position.z, spot[2], 5, dt);
    light.intensity = 18 + Math.sin(state.time * 2.1) * 2;
  });

  return (
    <>
      <fog attach="fog" args={["#090a0a", 12, 40]} />
      <hemisphereLight args={["#cdeee8", "#283d3c", 1.8]} />
      <ambientLight intensity={1.15} color="#cee4df" />
      <directionalLight position={[5, 8, 6]} intensity={2.4} color="#79c5c8" />
      <directionalLight
        position={[-6, 4, -4]}
        intensity={1.4}
        color="#f1f3f1"
      />
      <pointLight
        ref={follow}
        position={[0, 1, 0]}
        intensity={18}
        distance={14}
        decay={2}
        color="#79c5c8"
      />
    </>
  );
}
