"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hash, L, PALETTE } from "../choreography";
import type { GlyphAtlas } from "../glyph-atlas";
import { BodyBatch, GlyphBatch } from "../glyph-batch";
import { createGlow, setGlow } from "./glow-sprite";
import { ease, hold, lerp, SFNT_TABLES } from "../storyboard";
import { useTimeline } from "../timeline";

const TABLES = SFNT_TABLES;
const CMAP = TABLES.indexOf("cmap");
const HEAD = TABLES.indexOf("head");
const HEX = "0123456789abcdef";

const cSurface = new THREE.Color(PALETTE.surface2);
const cDim = new THREE.Color("#121515");
const cHot = new THREE.Color(PALETTE.actionBright);
const cLock = new THREE.Color(PALETTE.fold);
const cInk = new THREE.Color(PALETTE.ink);
const cMuted = new THREE.Color(PALETTE.muted);
const cAccent = new THREE.Color(PALETTE.accent);
const cCard = new THREE.Color("#101414");
const color = new THREE.Color();

function ringSlot(k: number): [number, number, number] {
  const a = ((k - CMAP) / TABLES.length) * Math.PI * 2;
  return [
    L.slab[0] + Math.cos(a) * L.ringRadiusX,
    L.slab[1] + Math.sin(a) * L.ringRadiusY,
    L.slab[2] + ((k % 3) - 1) * 0.7,
  ];
}

/**
 * The font as a slab of SFNT tables. Beat 1 explodes it into a ring and
 * isolates cmap; beat 4 swaps the rewritten cmap in, fixes the head checksum,
 * reassembles the slab and squeezes it into a WOFF2 brick.
 */
export function TableRing({ ui }: { ui: GlyphAtlas }) {
  const timeline = useTimeline();
  const parts = useMemo(
    () => ({
      bodies: new BodyBatch(new THREE.BoxGeometry(1, 1, 1), TABLES.length + 4),
      labels: new GlyphBatch(ui, 160),
      glow: createGlow(PALETTE.accent, 3),
      glowNew: createGlow(PALETTE.accent, 2),
    }),
    [ui],
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
    let bodies = 0;
    let labels = 0;
    let visible = false;
    let slabScale = 0;
    let slabX: number = L.slab[0];
    let slabY: number = L.slab[1];
    let slabZ: number = L.slab[2];
    let slabSy = 1;
    let slabSx = 1;
    let explode = 0;
    let cmapForward = 0;
    let dimOthers = 0;
    let lockCard = 0;
    let oldCmapEject = 0;
    let newCmapIn = 0;
    let headFix = 0;
    let collapse = 0;
    let squeeze = 0;
    let appear = 1;

    if (beat.id === "prepare") {
      visible = true;
      const flyIn = ease.outCubic(hold(t, 0, 0.16));
      slabX = lerp(L.slab[0] + 14, L.slab[0], flyIn);
      slabY = lerp(L.slab[1] + 3, L.slab[1], flyIn);
      slabScale = 1;
      explode = ease.outBack(hold(t, 0.24, 0.55));
      cmapForward = ease.outCubic(hold(t, 0.55, 0.78));
      dimOthers = hold(t, 0.55, 0.8);
      lockCard = ease.outCubic(hold(t, 0.7, 0.95));
    } else if (beat.id === "buckets") {
      visible = t < 0.2;
      appear = 1 - hold(t, 0, 0.18);
      explode = 1;
      cmapForward = 1;
      dimOthers = 1;
      lockCard = 1 - hold(t, 0, 0.12);
    } else if (beat.id === "bake") {
      visible = true;
      appear = ease.outCubic(hold(t, 0, 0.1));
      explode = 1;
      dimOthers = 1;
      oldCmapEject = ease.inQuad(hold(t, 0.1, 0.3));
      newCmapIn = ease.outCubic(hold(t, 0.14, 0.36));
      headFix = hold(t, 0.3, 0.5);
      collapse = ease.inOutCubic(hold(t, 0.38, 0.58));
      slabScale = collapse;
      if (t >= 0.6) {
        squeeze = ease.outCubic(hold(t, 0.6, 0.74));
        slabX = -7;
        slabY = L.conveyorY + 0.35;
        slabZ = L.heroLane;
        slabScale = 1;
        slabSy = lerp(1, 0.45, squeeze);
        slabSx = lerp(1.4, 0.9, squeeze);
        explode = 0;
        visible = t < 0.76;
      }
    }

    if (visible) {
      const slabSize = slabScale * appear;
      // Slab body.
      color.copy(cSurface).lerp(cHot, squeeze * 0.9);
      parts.bodies.set(bodies++, {
        x: slabX,
        y: slabY,
        z: slabZ,
        ry: t * 0.4,
        sx: 2.4 * slabSx * slabSize * (1 - explode),
        sy: 1.5 * slabSy * slabSize * (1 - explode),
        sz: 0.5 * slabSize * (1 - explode),
        color,
      });
      if (beat.id === "prepare" || (beat.id === "bake" && t < 0.6)) {
        labels += parts.labels.text(labels, "body@default.sfnt", {
          x: slabX,
          y: slabY + 1.05,
          z: slabZ + 0.3,
          size: 0.28,
          color: cMuted,
          alpha: (1 - explode) * appear * (1 - collapse),
          align: "center",
        });
      }

      // Ring of tables.
      for (let k = 0; k < TABLES.length; k++) {
        const slot = ringSlot(k);
        const isCmap = k === CMAP;
        const isHead = k === HEAD;
        let x = lerp(slabX, slot[0], explode);
        let y = lerp(slabY, slot[1], explode);
        let z = lerp(slabZ, slot[2], explode);
        let alpha = appear;
        let scale = explode * appear;
        color.copy(cSurface);
        if (isCmap) {
          z += cmapForward * 1.4;
          color.lerp(cHot, cmapForward);
          if (beat.id === "bake") {
            // Old cmap leaves; the rewritten one arrives from the decode lane.
            x += oldCmapEject * 6;
            y += oldCmapEject * 3;
            alpha *= 1 - oldCmapEject;
            scale *= 1 - oldCmapEject;
          }
        } else {
          color.lerp(cDim, dimOthers * 0.8);
        }
        if (beat.id === "bake") {
          x = lerp(x, slabX, collapse);
          y = lerp(y, slabY, collapse);
          z = lerp(z, slabZ, collapse);
          scale *= 1 - collapse;
        }
        const tumble = (1 - explode) * hash(k, 20) * 6;
        parts.bodies.set(bodies++, {
          x,
          y,
          z,
          rx: tumble,
          ry: tumble * 0.7 + Math.sin(time * 0.8 + k) * 0.08,
          sx: 1.25 * scale,
          sy: 0.62 * scale,
          sz: 0.26 * scale,
          color,
        });
        let text: string = TABLES[k]!;
        if (isHead && beat.id === "bake" && headFix > 0 && headFix < 1) {
          const n = Math.floor(time * 30 + k);
          text = `head ${HEX[n % 16]}${HEX[(n * 7) % 16]}${HEX[(n * 3) % 16]}${HEX[(n * 11) % 16]}`;
        } else if (isHead && beat.id === "bake" && headFix >= 1) {
          text = "head · checksum ok";
        }
        labels += parts.labels.text(labels, text, {
          x,
          y,
          z: z + 0.16 * scale,
          size: 0.26 * scale,
          color: isCmap ? cInk : cMuted,
          alpha:
            alpha *
            explode *
            (1 - collapse) *
            (isCmap ? 1 : 1 - dimOthers * 0.5),
          align: "center",
        });
        if (!isCmap && dimOthers > 0 && beat.id !== "bake") {
          labels += parts.labels.text(labels, "locked", {
            x,
            y: y - 0.36 * scale,
            z: z + 0.16 * scale,
            size: 0.14 * scale,
            color: cLock,
            alpha: alpha * dimOthers * explode,
            align: "center",
          });
        }
        if (isCmap) {
          setGlow(
            parts.glow,
            x,
            y,
            z + 0.3,
            2.6 * scale + Math.sin(time * 3) * 0.2,
            (cmapForward * 0.8 + (beat.id === "bake" ? 0.5 : 0)) *
              alpha *
              scale,
          );
        }
      }

      // The rewritten cmap flying in (bake only).
      if (beat.id === "bake" && newCmapIn > 0) {
        const slot = ringSlot(CMAP);
        let x = lerp(slot[0] + 9, slot[0], newCmapIn);
        let y = lerp(slot[1] + 1.5, slot[1], newCmapIn);
        let z = lerp(slot[2] + 2, slot[2] + 1.4, newCmapIn);
        x = lerp(x, slabX, collapse);
        y = lerp(y, slabY, collapse);
        z = lerp(z, slabZ, collapse);
        const scale = (1 - collapse) * appear;
        parts.bodies.set(bodies++, {
          x,
          y,
          z,
          ry: (1 - newCmapIn) * 3,
          sx: 1.25 * scale,
          sy: 0.62 * scale,
          sz: 0.26 * scale,
          color: cHot,
        });
        labels += parts.labels.text(labels, "cmap · rewritten", {
          x,
          y,
          z: z + 0.16,
          size: 0.24 * scale,
          color: cInk,
          alpha: newCmapIn * (1 - collapse),
          align: "center",
        });
        setGlow(
          parts.glowNew,
          x,
          y,
          z + 0.3,
          2.4 * scale,
          newCmapIn * (1 - collapse),
        );
      } else {
        setGlow(parts.glowNew, 0, 0, 0, 0, 0);
      }

      // Lockfile card.
      if (lockCard > 0) {
        const x = lerp(4.5, 2.2, lockCard);
        const y = lerp(-3.4, -2.5, lockCard);
        const z = -0.5;
        parts.bodies.set(bodies++, {
          x,
          y,
          z,
          sx: 3.4,
          sy: 0.62,
          sz: 0.08,
          color: cCard,
        });
        labels += parts.labels.text(labels, "glyphscramble.lock.json", {
          x,
          y: y + 0.08,
          z: z + 0.06,
          size: 0.2,
          color: cAccent,
          alpha: lockCard,
          align: "center",
        });
        labels += parts.labels.text(labels, "identity · sha256 · coverage", {
          x,
          y: y - 0.16,
          z: z + 0.06,
          size: 0.13,
          color: cMuted,
          alpha: lockCard,
          align: "center",
        });
      }
    } else {
      setGlow(parts.glow, 0, 0, 0, 0, 0);
      setGlow(parts.glowNew, 0, 0, 0, 0, 0);
    }

    parts.bodies.commit(bodies);
    parts.labels.commit(labels);
  });

  return (
    <>
      <primitive object={parts.bodies.mesh} />
      <primitive object={parts.labels.mesh} />
      <primitive object={parts.glow} />
      <primitive object={parts.glowNew} />
    </>
  );
}
