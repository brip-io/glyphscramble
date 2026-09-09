"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  charClass,
  ENCODED,
  hash,
  L,
  LINES,
  PALETTE,
  SENTENCE,
  smoothstep,
} from "../choreography";
import type { GlyphAtlas } from "../glyph-atlas";
import { BodyBatch, GlyphBatch } from "../glyph-batch";
import { ease, hold, lerp } from "../storyboard";
import type { TimelineState } from "../timeline";
import { useTimeline } from "../timeline";

const COUNT = SENTENCE.length;
const SETS = 2;

interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

interface TileFrame extends Pose {
  alpha: number;
  encoded: number; // 0 plain glyph, 1 encoded glyph
  readable: number; // 0 raw atlas, 1 scrambled-font atlas
  hot: number;
  raw: number; // tint glyph with accent (raw scalars)
}

const classes = [...SENTENCE].map(charClass);
const lowerIndex: number[] = [];
const upperIndex: number[] = [];
const structuralIndex: number[] = [];
classes.forEach((c, i) => {
  if (c === "lower") lowerIndex.push(i);
  else if (c === "upper") upperIndex.push(i);
  else structuralIndex.push(i);
});

function ribbon(i: number, time: number, out: Pose) {
  const k = i - (COUNT - 1) / 2;
  out.x = k * 0.46 + Math.sin(time * 0.3 + i * 0.2) * 0.15;
  out.y = -3.1 + Math.sin(i * 0.42 + time * 0.55) * 0.5;
  out.z = -2.5 + Math.sin(i * 0.77 + time * 0.2) * 1.8;
  out.rx = Math.sin(time * 0.4 + i) * 0.18;
  out.ry = Math.sin(time * 0.5 + i * 0.6) * 0.35;
  out.rz = Math.sin(time * 0.35 + i * 0.9) * 0.08;
  out.s = 0.6;
}

function scatter(i: number, out: Pose) {
  const a = hash(i, 1) * Math.PI * 2;
  out.x = Math.cos(a) * 16;
  out.y = Math.sin(a) * 9;
  out.z = 4 + hash(i, 2) * 4;
  out.rx = hash(i, 3) * 4;
  out.ry = hash(i, 4) * 4;
  out.rz = 0;
  out.s = 0.3;
}

function binSlot(i: number, out: Pose) {
  const cls = classes[i];
  if (cls === "lower") {
    const k = lowerIndex.indexOf(i);
    const col = k % 7;
    const row = Math.floor(k / 7);
    out.x = L.binLl[0] + (col - 3) * 0.27;
    out.y = L.binLl[1] + 0.2;
    out.z = L.binLl[2] + (row - 2.5) * 0.27;
  } else if (cls === "upper") {
    const k = upperIndex.indexOf(i);
    out.x = L.binLu[0] + (k - (upperIndex.length - 1) / 2) * 0.3;
    out.y = L.binLu[1] + 0.2;
    out.z = L.binLu[2];
  } else {
    const k = structuralIndex.indexOf(i);
    out.x = (k - (structuralIndex.length - 1) / 2) * 0.6;
    out.y = L.gridY + 0.25;
    out.z = L.railZ;
  }
  out.rx = -Math.PI / 2;
  out.ry = 0;
  out.rz = 0;
  out.s = 0.24;
}

function above(i: number, out: Pose) {
  binSlot(i, out);
  out.x += (hash(i, 5) - 0.5) * 3;
  out.y = 9 + hash(i, 6) * 3;
  out.z += (hash(i, 7) - 0.5) * 3;
  out.rx = hash(i, 8) * 6;
  out.ry = hash(i, 9) * 6;
  out.s = 0.3;
}

function hover(i: number, out: Pose) {
  const cls = classes[i];
  if (cls === "lower") {
    const k = lowerIndex.indexOf(i);
    out.x = (k - (lowerIndex.length - 1) / 2) * 0.27;
    out.y = 1.75;
    out.z = 0.6;
    out.rx = -0.2;
  } else {
    binSlot(i, out);
  }
  out.ry = 0;
  out.rz = 0;
  out.s = 0.24;
}

function frameLine(
  i: number,
  origin: readonly [number, number, number],
  out: Pose,
) {
  const lineIndex = LINES.findIndex((line) => i >= line.start && i < line.end);
  const line = LINES[Math.max(0, lineIndex)] ?? {
    start: 0,
    end: SENTENCE.length,
  };
  const k = i - line.start;
  const length = line.end - line.start;
  out.x = origin[0] + (k - (length - 1) / 2) * 0.27;
  out.y = origin[1] + 0.35 - Math.max(0, lineIndex) * 0.62;
  out.z = origin[2] + 0.18;
  out.rx = 0;
  out.ry = 0;
  out.rz = 0;
  out.s = 0.24;
}

function mixPose(a: Pose, b: Pose, t: number, out: Pose) {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
  out.rx = lerp(a.rx, b.rx, t);
  out.ry = lerp(a.ry, b.ry, t);
  out.rz = lerp(a.rz, b.rz, t);
  out.s = lerp(a.s, b.s, t);
}

const A: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 0 };
const B: Pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 0 };

/** Compute one tile's frame for the terminal copy (set 0). */
function frameSet0(i: number, state: TimelineState, out: TileFrame) {
  const { beat, t, time } = state;
  out.alpha = 1;
  out.encoded = 0;
  out.readable = 0;
  out.hot = 0;
  out.raw = 0;
  switch (beat.id) {
    case "title": {
      ribbon(i, time, out);
      return;
    }
    case "prepare": {
      ribbon(i, time, A);
      scatter(i, B);
      const u = ease.inQuad(hold(t, 0, 0.4));
      mixPose(A, B, u, out);
      out.alpha = 1 - hold(t, 0.1, 0.4);
      return;
    }
    case "buckets": {
      above(i, A);
      binSlot(i, B);
      const delay = hash(i, 10) * 0.4;
      const u = ease.outCubic(hold(t, delay, delay + 0.4));
      mixPose(A, B, u, out);
      out.alpha = hold(t, delay, delay + 0.08);
      out.hot = (1 - u) * 0.6;
      return;
    }
    case "permute": {
      binSlot(i, A);
      hover(i, B);
      const u = ease.inOutCubic(hold(t, 0.02 + hash(i, 11) * 0.1, 0.3));
      mixPose(A, B, u, out);
      const flipAt = 0.8 + hash(i, 12) * 0.12;
      const flip = hold(t, flipAt, flipAt + 0.05);
      out.encoded = classes[i] === "structural" ? 0 : flip;
      out.hot = classes[i] === "structural" ? 0 : Math.sin(flip * Math.PI);
      return;
    }
    case "bake": {
      hover(i, out);
      out.encoded = classes[i] === "structural" ? 0 : 1;
      out.alpha = 1 - hold(t, 0, 0.12);
      return;
    }
    case "lease": {
      hover(i, out);
      out.encoded = 1;
      out.alpha = 0;
      return;
    }
    case "raw-agent": {
      A.x = L.token[0] + 3;
      A.y = L.token[1] + 1.5;
      A.z = L.token[2];
      A.rx = hash(i, 13) * 3;
      A.ry = hash(i, 14) * 3;
      A.rz = 0;
      A.s = 0.1;
      frameLine(i, L.terminal, B);
      const delay = i * 0.004;
      const u = ease.outCubic(hold(t, delay, delay + 0.3));
      mixPose(A, B, u, out);
      out.alpha = hold(t, delay, delay + 0.05);
      out.encoded = 1;
      out.raw = 1;
      out.hot = (1 - u) * 0.8;
      return;
    }
    case "human":
    case "recovery": {
      frameLine(i, L.terminal, out);
      out.encoded = 1;
      out.raw = 1;
      return;
    }
  }
}

/** Frame for the browser copy (set 1): the same bytes, rendered. */
function frameSet1(i: number, state: TimelineState, out: TileFrame) {
  const { beat, t, time } = state;
  out.alpha = 0;
  out.encoded = 1;
  out.readable = 0;
  out.hot = 0;
  out.raw = 0;
  if (beat.id === "human") {
    frameLine(i, L.terminal, A);
    frameLine(i, L.browser, B);
    const delay = i * 0.004;
    const u = ease.inOutCubic(hold(t, delay, delay + 0.3));
    mixPose(A, B, u, out);
    out.z += Math.sin(u * Math.PI) * 2.5;
    out.ry = Math.sin(u * Math.PI) * 1.2;
    out.alpha = hold(t, 0, 0.05);
    out.raw = 1 - u;
    const sweepX = lerp(L.browser[0] - 4, L.browser[0] + 4, hold(t, 0.6, 0.92));
    out.readable = smoothstep(out.x - 0.35, out.x + 0.15, sweepX);
    out.hot =
      Math.max(0, 1 - Math.abs(sweepX - out.x) / 0.8) * (t > 0.6 ? 1 : 0);
    return;
  }
  if (beat.id === "recovery") {
    frameLine(i, L.browser, out);
    out.alpha = 1;
    out.readable = 1;
    out.y += Math.sin(time * 1.2 + i * 0.3) * 0.01;
    return;
  }
}

interface TileSetProps {
  ui: GlyphAtlas;
  scrambled: GlyphAtlas;
}

const tmp: TileFrame = {
  x: 0,
  y: 0,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  s: 0,
  alpha: 0,
  encoded: 0,
  readable: 0,
  hot: 0,
  raw: 0,
};
const bodyColor = new THREE.Color();
const glyphColor = new THREE.Color();
const cInk = new THREE.Color(PALETTE.ink);
const cAccent = new THREE.Color(PALETTE.accent);
const cSurface = new THREE.Color(PALETTE.surface2);
const cHot = new THREE.Color(PALETTE.actionBright);
const cWhite = new THREE.Color("#ffffff");

/**
 * The 48 sentence tiles: the one actor that survives every beat, so the
 * viewer follows the same characters from plaintext to scrambled scalars to
 * the rendered result.
 */
export function TileSet({ ui, scrambled }: TileSetProps) {
  const timeline = useTimeline();
  const batches = useMemo(() => {
    const capacity = COUNT * SETS;
    const geometry = new THREE.BoxGeometry(1, 1, 0.16);
    return {
      bodies: new BodyBatch(geometry, capacity),
      glyphsUi: new GlyphBatch(ui, capacity),
      glyphsReadable: new GlyphBatch(scrambled, capacity),
    };
  }, [ui, scrambled]);

  useEffect(
    () => () => {
      batches.bodies.dispose();
      batches.glyphsUi.dispose();
      batches.glyphsReadable.dispose();
    },
    [batches],
  );

  useFrame(() => {
    const state = timeline.current;
    let n = 0;
    for (let set = 0; set < SETS; set++) {
      for (let i = 0; i < COUNT; i++) {
        if (set === 0) frameSet0(i, state, tmp);
        else frameSet1(i, state, tmp);
        const structural = classes[i] === "structural";
        const plainChar = SENTENCE[i]!;
        const encodedChar = ENCODED[i]!;
        const char = tmp.encoded > 0.5 ? encodedChar : plainChar;
        const visible =
          tmp.alpha > 0.003 && !(structural && SENTENCE[i] === " ");
        const alpha = visible ? tmp.alpha : 0;
        const scale = visible ? tmp.s : 0.0001;
        bodyColor.copy(cSurface).lerp(cHot, tmp.hot);
        if (structural) bodyColor.lerp(new THREE.Color(PALETTE.fold), 0.35);
        batches.bodies.set(n, {
          x: tmp.x,
          y: tmp.y,
          z: tmp.z,
          rx: tmp.rx,
          ry: tmp.ry,
          rz: tmp.rz,
          sx: scale,
          sy: scale,
          sz: scale * (alpha > 0.5 ? 1 : alpha * 2),
          color: bodyColor,
        });
        glyphColor
          .copy(cInk)
          .lerp(cAccent, tmp.raw)
          .lerp(cWhite, tmp.hot * 0.8);
        const forward = 0.09 * scale;
        const fx = tmp.x + Math.sin(tmp.ry) * forward;
        const fy = tmp.y - Math.sin(tmp.rx) * forward;
        const fz = tmp.z + Math.cos(tmp.ry) * Math.cos(tmp.rx) * forward;
        const uiAlpha = alpha * (1 - tmp.readable);
        const readableAlpha = alpha * tmp.readable;
        batches.glyphsUi.set(n, {
          x: fx,
          y: fy,
          z: fz,
          rx: tmp.rx,
          ry: tmp.ry,
          rz: tmp.rz,
          scale: scale * 0.82,
          char,
          color: glyphColor,
          alpha: uiAlpha,
        });
        batches.glyphsReadable.set(n, {
          x: fx,
          y: fy,
          z: fz,
          rx: tmp.rx,
          ry: tmp.ry,
          rz: tmp.rz,
          scale: scale * 0.82,
          char: encodedChar,
          color: cInk,
          alpha: readableAlpha,
        });
        n++;
      }
    }
    batches.bodies.commit(n);
    batches.glyphsUi.commit(n);
    batches.glyphsReadable.commit(n);
  });

  return (
    <>
      <primitive object={batches.bodies.mesh} />
      <primitive object={batches.glyphsUi.mesh} />
      <primitive object={batches.glyphsReadable.mesh} />
    </>
  );
}
