"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Beat, CameraKey } from "../storyboard";
import { beats, ease } from "../storyboard";
import { useTimeline } from "../timeline";

interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const ENTRY_BLEND = 0.3;

function keyAt(key: CameraKey): number {
  return key.at ?? 0;
}

function mixPose(out: Pose, a: CameraKey, b: CameraKey, t: number) {
  const k = ease.inOutCubic(t);
  out.position.set(
    THREE.MathUtils.lerp(a.position[0], b.position[0], k),
    THREE.MathUtils.lerp(a.position[1], b.position[1], k),
    THREE.MathUtils.lerp(a.position[2], b.position[2], k),
  );
  out.target.set(
    THREE.MathUtils.lerp(a.target[0], b.target[0], k),
    THREE.MathUtils.lerp(a.target[1], b.target[1], k),
    THREE.MathUtils.lerp(a.target[2], b.target[2], k),
  );
  out.fov = THREE.MathUtils.lerp(a.fov, b.fov, k);
}

/** Desired pose for a beat and local time. Returns the id of the active key. */
function desiredPose(out: Pose, beat: Beat, t: number): string {
  const keys = beat.camera;
  const previous = beat.index > 0 ? beats[beat.index - 1] : undefined;
  const first = keys[0]!;
  const from = previous?.camera[previous.camera.length - 1];
  if (from && !first.cut && t < ENTRY_BLEND && keyAt(first) === 0) {
    mixPose(out, from, first, t / ENTRY_BLEND);
    return `${beat.index}:entry`;
  }
  let index = 0;
  for (let i = 0; i < keys.length; i++) {
    if (t >= keyAt(keys[i]!)) index = i;
  }
  const current = keys[index]!;
  const next = keys[index + 1];
  if (!next || next.cut) {
    mixPose(out, current, current, 0);
    return `${beat.index}:${index}`;
  }
  const span = keyAt(next) - keyAt(current);
  const local = span > 0 ? (t - keyAt(current)) / span : 1;
  mixPose(out, current, next, local);
  return `${beat.index}:${index}`;
}

/** Keyframed camera with damping, hard cuts, and a hint of handheld drift. */
export function CameraRig() {
  const timeline = useTimeline();
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((state) => state.viewport.aspect);
  const desired = useRef<Pose>({
    position: new THREE.Vector3(0, 0.6, 14),
    target: new THREE.Vector3(),
    fov: 38,
  });
  const smoothed = useRef<Pose>({
    position: new THREE.Vector3(0, 0.6, 14),
    target: new THREE.Vector3(),
    fov: 38,
  });
  const lastKey = useRef("0:0");
  const lookAt = useRef(new THREE.Vector3());

  useFrame(() => {
    const state = timeline.current;
    const want = desired.current;
    const have = smoothed.current;
    const keyId = desiredPose(want, state.beat, state.t);
    const keyIndex = Number(keyId.split(":")[1]);
    const cut =
      keyId !== lastKey.current &&
      Number.isFinite(keyIndex) &&
      state.beat.camera[keyIndex]?.cut === true;
    lastKey.current = keyId;

    const dt = state.delta;
    if (cut) {
      have.position.copy(want.position);
      have.target.copy(want.target);
      have.fov = want.fov;
    } else {
      have.position.x = THREE.MathUtils.damp(
        have.position.x,
        want.position.x,
        4,
        dt,
      );
      have.position.y = THREE.MathUtils.damp(
        have.position.y,
        want.position.y,
        4,
        dt,
      );
      have.position.z = THREE.MathUtils.damp(
        have.position.z,
        want.position.z,
        4,
        dt,
      );
      have.target.x = THREE.MathUtils.damp(
        have.target.x,
        want.target.x,
        4.5,
        dt,
      );
      have.target.y = THREE.MathUtils.damp(
        have.target.y,
        want.target.y,
        4.5,
        dt,
      );
      have.target.z = THREE.MathUtils.damp(
        have.target.z,
        want.target.z,
        4.5,
        dt,
      );
      have.fov = THREE.MathUtils.damp(have.fov, want.fov, 5, dt);
    }

    const time = state.time;
    const drift = state.beat.index === 0 ? 1 : 0.55;
    // Portrait viewports see less width, so back the camera off along its
    // own view axis to keep each beat framed.
    const boost =
      aspect < 1.25 && state.beat.index > 0 ? Math.pow(1.25 / aspect, 0.85) : 1;
    camera.position.set(
      have.target.x +
        (have.position.x - have.target.x) * boost +
        Math.sin(time * 0.6) * 0.08 * drift,
      have.target.y +
        (have.position.y - have.target.y) * boost +
        Math.sin(time * 0.83 + 1.3) * 0.06 * drift,
      have.target.z +
        (have.position.z - have.target.z) * boost +
        Math.cos(time * 0.47) * 0.05 * drift,
    );
    lookAt.current.set(
      have.target.x + Math.sin(time * 0.5 + 0.7) * 0.03,
      have.target.y + Math.cos(time * 0.62) * 0.03,
      have.target.z,
    );
    camera.lookAt(lookAt.current);
    if (Math.abs(camera.fov - have.fov) > 0.01) {
      camera.fov = have.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
