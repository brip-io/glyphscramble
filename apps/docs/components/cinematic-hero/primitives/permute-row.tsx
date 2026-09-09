"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ALPHABET, hash, L, LOWER_PERMUTATION, PALETTE } from "../choreography";
import type { GlyphAtlas } from "../glyph-atlas";
import { BodyBatch, GlyphBatch } from "../glyph-batch";
import { createGlow, setGlow } from "./glow-sprite";
import { ease, hold, lerp } from "../storyboard";
import { useTimeline } from "../timeline";

const N = ALPHABET.length;
const SPACING = 0.42;
const TOP_Y = 0.7;
const BOTTOM_Y = -0.3;
const SEED: [number, number, number] = [0, 3.3, -1];
const SHUFFLE_START = 0.22;
const SHUFFLE_END = 0.76;

const cTile = new THREE.Color(PALETTE.surface2);
const cTileDim = new THREE.Color("#121515");
const cHot = new THREE.Color(PALETTE.actionBright);
const cInk = new THREE.Color(PALETTE.ink);
const cMuted = new THREE.Color(PALETTE.muted);
const cAccent = new THREE.Color(PALETTE.accent);
const cCard = new THREE.Color("#101414");
const cLock = new THREE.Color(PALETTE.fold);
const color = new THREE.Color();

function slotX(slot: number): number {
  return (slot - (N - 1) / 2) * SPACING;
}

/**
 * The lowercase bucket laid out as two rows: the fixed members above and the
 * copy below that a seeded Fisher-Yates shuffle rearranges, swap by swap,
 * until each column reads as one entry of the real encode map.
 */
export function PermuteRow({
  ui,
  particles,
}: {
  ui: GlyphAtlas;
  particles: number;
}) {
  const timeline = useTimeline();
  const parts = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(particles * 3), 3),
    );
    const material = new THREE.PointsMaterial({
      color: PALETTE.accent,
      size: 0.07,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return {
      bodies: new BodyBatch(new THREE.BoxGeometry(1, 1, 1), N * 2 + 4),
      labels: new GlyphBatch(ui, N * 2 + 160),
      points,
      glow: createGlow(PALETTE.accent, 3),
      swapGlowA: createGlow(PALETTE.accent, 1.2),
      swapGlowB: createGlow(PALETTE.accent, 1.2),
    };
  }, [ui, particles]);
  useEffect(
    () => () => {
      parts.bodies.dispose();
      parts.labels.dispose();
      parts.glow.material.dispose();
      parts.swapGlowA.material.dispose();
      parts.swapGlowB.material.dispose();
      parts.points.geometry.dispose();
      (parts.points.material as THREE.Material).dispose();
    },
    [parts],
  );

  // Current slot of each letter (bottom row) plus arc progress, replayed from
  // the swap trace every frame so scrubbing backwards stays exact.
  const slots = useMemo(() => new Float32Array(N), []);
  const lift = useMemo(() => new Float32Array(N), []);

  useFrame(() => {
    const state = timeline.current;
    const { beat, t, time } = state;
    let n = 0;
    let labels = 0;
    const active = beat.id === "permute" || (beat.id === "bake" && t < 0.12);
    if (!active) {
      parts.bodies.commit(0);
      parts.labels.commit(0);
      parts.points.visible = false;
      setGlow(parts.glow, 0, 0, 0, 0, 0);
      setGlow(parts.swapGlowA, 0, 0, 0, 0, 0);
      setGlow(parts.swapGlowB, 0, 0, 0, 0, 0);
      return;
    }
    const local = beat.id === "permute" ? t : 1;
    const fade = beat.id === "bake" ? 1 - hold(t, 0, 0.12) : 1;
    const rise = ease.outCubic(hold(local, 0, 0.2));

    // Replay the swap trace.
    for (let k = 0; k < N; k++) {
      slots[k] = k;
      lift[k] = 0;
    }
    const swaps = LOWER_PERMUTATION.swaps;
    const each = (SHUFFLE_END - SHUFFLE_START) / swaps.length;
    let activeA = -1;
    let activeB = -1;
    for (let s = 0; s < swaps.length; s++) {
      const start = SHUFFLE_START + s * each;
      const u = hold(local, start, start + each);
      if (u <= 0) break;
      const [i, j] = swaps[s]!;
      const letterAtI = slots.indexOf(i);
      const letterAtJ = slots.indexOf(j);
      if (letterAtI < 0 || letterAtJ < 0) continue;
      if (u >= 1) {
        slots[letterAtI] = j;
        slots[letterAtJ] = i;
      } else {
        const k = ease.inOutCubic(u);
        slots[letterAtI] = lerp(i, j, k);
        slots[letterAtJ] = lerp(j, i, k);
        lift[letterAtI] = Math.sin(u * Math.PI);
        lift[letterAtJ] = -Math.sin(u * Math.PI);
        activeA = letterAtI;
        activeB = letterAtJ;
      }
    }
    const shuffled = hold(local, SHUFFLE_END, SHUFFLE_END + 0.02);

    // Rows.
    for (let k = 0; k < N; k++) {
      const delay = hash(k, 40) * 0.08;
      const r = ease.outCubic(hold(rise, delay, delay + 0.6));
      const alpha = r * fade;
      // Top row: fixed bucket members.
      const topX = slotX(k);
      const topY = lerp(L.binLl[1], TOP_Y, r);
      parts.bodies.set(n++, {
        x: topX,
        y: topY,
        z: 0,
        sx: 0.34 * r,
        sy: 0.34 * r,
        sz: 0.1 * r,
        color: cTileDim,
      });
      labels += parts.labels.text(labels, ALPHABET[k]!, {
        x: topX,
        y: topY,
        z: 0.07,
        size: 0.3 * r,
        color: cMuted,
        alpha,
        align: "center",
      });
      // Bottom row: the shuffled copy.
      const slot = slots[k]!;
      const arc = lift[k]!;
      const x = slotX(slot);
      const y = lerp(L.binLl[1], BOTTOM_Y, r) - arc * 0.55;
      const z = 0.2 + Math.abs(arc) * 0.6;
      const hot = k === activeA || k === activeB ? 1 : 0;
      color.copy(cTile).lerp(cHot, Math.max(hot, shuffled * 0.55));
      parts.bodies.set(n++, {
        x,
        y,
        z,
        rz: arc * 0.6,
        sx: 0.34 * r,
        sy: 0.34 * r,
        sz: 0.1 * r,
        color,
      });
      labels += parts.labels.text(labels, ALPHABET[k]!, {
        x,
        y,
        z: z + 0.07,
        size: 0.3 * r,
        color: cInk,
        alpha,
        align: "center",
      });
      if (hot && k === activeA)
        setGlow(parts.swapGlowA, x, y, z + 0.2, 1.2, fade);
      if (hot && k === activeB)
        setGlow(parts.swapGlowB, x, y, z + 0.2, 1.2, fade);
    }
    if (activeA < 0) {
      setGlow(parts.swapGlowA, 0, 0, 0, 0, 0);
      setGlow(parts.swapGlowB, 0, 0, 0, 0, 0);
    }

    // Seed cube.
    const seedPop = ease.outBack(hold(local, 0.06, 0.18)) * fade;
    parts.bodies.set(n++, {
      x: SEED[0],
      y: SEED[1],
      z: SEED[2],
      rx: time * 1.4,
      ry: time * 1.9,
      sx: 0.5 * seedPop,
      sy: 0.5 * seedPop,
      sz: 0.5 * seedPop,
      color: cHot,
    });
    setGlow(
      parts.glow,
      SEED[0],
      SEED[1],
      SEED[2],
      2.4 + Math.sin(time * 5) * 0.3,
      seedPop * (0.6 + 0.4 * (activeA >= 0 ? 1 : 0)),
    );
    labels += parts.labels.text(
      labels,
      "seed · CSPRNG · AES-256-CTR keystream",
      {
        x: SEED[0],
        y: SEED[1] + 0.55,
        z: SEED[2],
        size: 0.2,
        color: cAccent,
        alpha: seedPop,
        align: "center",
      },
    );
    labels += parts.labels.text(labels, "bucket members (fixed)", {
      x: -6.4,
      y: TOP_Y,
      z: 0,
      size: 0.16,
      color: cMuted,
      alpha: rise * fade,
      align: "left",
    });
    labels += parts.labels.text(labels, "Fisher-Yates", {
      x: -6.4,
      y: BOTTOM_Y,
      z: 0,
      size: 0.16,
      color: cAccent,
      alpha: rise * fade,
      align: "left",
    });

    // Keystream particles: seed → bottom row.
    const stream =
      hold(local, 0.14, 0.22) * (1 - hold(local, SHUFFLE_END, 0.86));
    parts.points.visible = stream > 0.01;
    if (parts.points.visible) {
      const attribute = parts.points.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let i = 0; i < particles; i++) {
        const u = (time * 0.5 + hash(i, 50)) % 1;
        const tx = (hash(i, 51) - 0.5) * N * SPACING;
        const k = ease.inQuad(u);
        array[i * 3] = lerp(SEED[0], tx, k) + Math.sin(u * 12 + i) * 0.1;
        array[i * 3 + 1] = lerp(SEED[1], BOTTOM_Y + 0.2, k);
        array[i * 3 + 2] = lerp(SEED[2], 0.4, k) + (hash(i, 52) - 0.5) * 0.4;
      }
      attribute.needsUpdate = true;
      (parts.points.material as THREE.PointsMaterial).opacity =
        0.9 * stream * fade;
    }

    // Encode / decode cards split after the shuffle.
    const split = ease.outCubic(hold(local, 0.8, 1));
    if (split > 0) {
      const ex = lerp(0, -6.2, split);
      const ey = lerp(-1.4, -2.6, split);
      const ez = lerp(1, 0, split);
      parts.bodies.set(n++, {
        x: ex,
        y: ey,
        z: ez,
        sx: 3.6,
        sy: 0.6,
        sz: 0.08,
        color: cCard,
      });
      labels += parts.labels.text(labels, "encode map · stays on the server", {
        x: ex,
        y: ey,
        z: ez + 0.06,
        size: 0.18,
        color: cLock,
        alpha: split * fade,
        align: "center",
      });
      const dx = lerp(0, 6.4, split);
      const dy = lerp(-1.4, 0.6, split);
      const dz = lerp(1, -1, split);
      parts.bodies.set(n++, {
        x: dx,
        y: dy,
        z: dz,
        sx: 3.2,
        sy: 0.6,
        sz: 0.08,
        color: cHot,
      });
      labels += parts.labels.text(labels, "decode map → cmap", {
        x: dx,
        y: dy,
        z: dz + 0.06,
        size: 0.2,
        color: cInk,
        alpha: split * fade,
        align: "center",
      });
    }

    parts.bodies.commit(n);
    parts.labels.commit(labels);
  });

  return (
    <>
      <primitive object={parts.bodies.mesh} />
      <primitive object={parts.labels.mesh} />
      <primitive object={parts.points} />
      <primitive object={parts.glow} />
      <primitive object={parts.swapGlowA} />
      <primitive object={parts.swapGlowB} />
    </>
  );
}
