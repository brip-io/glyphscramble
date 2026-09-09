"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTimeline } from "../timeline";

/** Ambient drifting motes: depth cues for the camera moves. */
export function Dust({ count }: { count: number }) {
  const timeline = useTimeline();
  const { points, base } = useMemo(() => {
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = (Math.random() - 0.5) * 34;
      base[i * 3 + 1] = (Math.random() - 0.5) * 18;
      base[i * 3 + 2] = (Math.random() - 0.5) * 26 - 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(base.slice(), 3),
    );
    const material = new THREE.PointsMaterial({
      color: "#79c5c8",
      size: 0.05,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, base };
  }, [count]);

  useEffect(
    () => () => {
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    },
    [points],
  );

  useFrame(() => {
    const time = timeline.current.time;
    const attribute = points.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const phase = i * 0.37;
      array[i * 3] = base[i * 3]! + Math.sin(time * 0.15 + phase) * 0.6;
      array[i * 3 + 1] = base[i * 3 + 1]! + Math.cos(time * 0.11 + phase) * 0.4;
      array[i * 3 + 2] = base[i * 3 + 2]!;
    }
    attribute.needsUpdate = true;
  });

  return <primitive object={points} />;
}
