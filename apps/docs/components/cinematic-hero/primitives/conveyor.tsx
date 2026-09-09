"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hash, L, PALETTE } from "../choreography";
import type { GlyphAtlas } from "../glyph-atlas";
import { BodyBatch, GlyphBatch } from "../glyph-batch";
import { createGlow, setGlow } from "./glow-sprite";
import { ease, fixture, hold, lerp } from "../storyboard";
import { useTimeline } from "../timeline";

const cRail = new THREE.Color("#141818");
const cBrick = new THREE.Color("#183a3c");
const cBrickHot = new THREE.Color(PALETTE.actionBright);
const cConsumed = new THREE.Color("#0f1313");
const cMuted = new THREE.Color(PALETTE.muted);
const cAccent = new THREE.Color(PALETTE.accent);
const cInk = new THREE.Color(PALETTE.ink);
const cCard = new THREE.Color("#101414");
const color = new THREE.Color();

/** Position of the hero brick during the lift-off (shared with the lanes). */
export function heroBrickLift(t: number): [number, number, number] {
  const u = ease.inOutCubic(hold(t, 0, 0.3));
  return [
    lerp(0, L.token[0], u),
    lerp(L.conveyorY + 0.3, L.token[1], u),
    lerp(L.heroLane, L.token[2], u),
  ];
}

/**
 * The variant pool: four worker lanes carrying pre-baked WOFF2 bricks. The
 * hero brick joins in beat 4 and is leased, exactly once, in beat 5.
 */
export function Conveyor({ ui, bricks }: { ui: GlyphAtlas; bricks: number }) {
  const timeline = useTimeline();
  const parts = useMemo(
    () => ({
      bodies: new BodyBatch(new THREE.BoxGeometry(1, 1, 1), bricks + 8),
      labels: new GlyphBatch(ui, 120),
      glow: createGlow(PALETTE.accent, 2),
    }),
    [ui, bricks],
  );
  useEffect(
    () => () => {
      parts.bodies.dispose();
      parts.labels.dispose();
    },
    [parts],
  );

  useFrame(() => {
    const state = timeline.current;
    const { beat, t, time } = state;
    let n = 0;
    let labels = 0;
    let appear = 0;
    let hero = 0;
    let lift = -1;
    if (beat.id === "bake" && t >= 0.6) {
      appear = 1;
      hero = hold(t, 0.75, 1);
    } else if (beat.id === "lease") {
      appear = 1 - hold(t, 0.55, 0.85);
      hero = 1;
      lift = t;
    }
    if (appear <= 0) {
      parts.bodies.commit(0);
      parts.labels.commit(0);
      setGlow(parts.glow, 0, 0, 0, 0, 0);
      return;
    }

    for (let lane = 0; lane < L.conveyorLanes.length; lane++) {
      parts.bodies.set(n++, {
        x: 0,
        y: L.conveyorY,
        z: L.conveyorLanes[lane]!,
        sx: L.conveyorHalf * 2 * appear,
        sy: 0.06,
        sz: 0.5,
        color: cRail,
      });
    }
    for (let k = 0; k < bricks; k++) {
      const lane = k % L.conveyorLanes.length;
      const speed = 0.7 + lane * 0.12;
      const x =
        ((k * 2.3 + time * speed + hash(k, 60) * 4) % (L.conveyorHalf * 2)) -
        L.conveyorHalf;
      const gone = lane === 1 && Math.abs(x) < 0.6 && lift >= 0 ? 1 : 0;
      color.copy(cBrick).lerp(cConsumed, gone);
      parts.bodies.set(n++, {
        x,
        y: L.conveyorY + 0.28,
        z: L.conveyorLanes[lane]!,
        sx: 0.9 * appear,
        sy: 0.45 * appear,
        sz: 0.42 * appear,
        color,
      });
    }

    // Hero brick: rides lane 1 to the pickup point, then lifts off.
    if (hero > 0) {
      let hx: number = lerp(-7, 0, ease.outCubic(hero));
      let hy: number = L.conveyorY + 0.3;
      let hz: number = L.heroLane;
      if (lift >= 0) [hx, hy, hz] = heroBrickLift(lift);
      const gone = lift >= 0.3 ? 1 : 0;
      if (!gone) {
        parts.bodies.set(n++, {
          x: hx,
          y: hy,
          z: hz,
          ry: lift > 0 ? lift * 2 : 0,
          sx: 0.9,
          sy: 0.45,
          sz: 0.6,
          color: cBrickHot,
        });
        setGlow(
          parts.glow,
          hx,
          hy,
          hz + 0.4,
          2 + Math.sin(time * 4) * 0.2,
          0.7,
        );
        labels += parts.labels.text(labels, "WOFF2 · variant", {
          x: hx,
          y: hy + 0.5,
          z: hz + 0.35,
          size: 0.18,
          color: cInk,
          alpha: 1,
          align: "center",
        });
      } else {
        setGlow(parts.glow, 0, 0, 0, 0, 0);
        labels += parts.labels.text(labels, "consumed · never reused", {
          x: 0,
          y: L.conveyorY + 0.7,
          z: L.heroLane + 0.3,
          size: 0.16,
          color: cMuted,
          alpha: appear,
          align: "center",
        });
      }
    }

    labels += parts.labels.text(
      labels,
      "worker pool · WOFF2 (Google WOFF2, WASM)",
      {
        x: -L.conveyorHalf + 0.2,
        y: L.conveyorY + 0.9,
        z: L.conveyorLanes[0]! - 0.4,
        size: 0.22,
        color: cAccent,
        alpha: appear,
        align: "left",
      },
    );
    const chipX = 5.4;
    const chipY = L.conveyorY + 1.9;
    parts.bodies.set(n++, {
      x: chipX,
      y: chipY,
      z: -2.4,
      sx: 4.6 * appear,
      sy: 0.66,
      sz: 0.08,
      color: cCard,
    });
    labels += parts.labels.text(labels, "static mode · one seed per build", {
      x: chipX,
      y: chipY + 0.1,
      z: -2.34,
      size: 0.17,
      color: cAccent,
      alpha: appear,
      align: "center",
    });
    labels += parts.labels.text(labels, fixture.staticFamily, {
      x: chipX,
      y: chipY - 0.17,
      z: -2.34,
      size: 0.12,
      color: cMuted,
      alpha: appear,
      align: "center",
    });

    parts.bodies.commit(n);
    parts.labels.commit(labels);
  });

  return (
    <>
      <primitive object={parts.bodies.mesh} />
      <primitive object={parts.labels.mesh} />
      <primitive object={parts.glow} />
    </>
  );
}
