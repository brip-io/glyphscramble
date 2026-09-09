"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hash, L, PALETTE } from "../choreography";
import type { GlyphAtlas } from "../glyph-atlas";
import { BodyBatch, GlyphBatch } from "../glyph-batch";
import { ease, hold } from "../storyboard";
import { useTimeline } from "../timeline";

const cPad = new THREE.Color("#131717");
const cPadLit = new THREE.Color(PALETTE.action);
const cBin = new THREE.Color(PALETTE.surface2);
const cBinHot = new THREE.Color(PALETTE.actionBright);
const cRail = new THREE.Color(PALETTE.fold);
const cAccent = new THREE.Color(PALETTE.accent);
const cMuted = new THREE.Color(PALETTE.muted);
const color = new THREE.Color();

/**
 * Unicode property buckets: a field of 763 signature pads with the two
 * buckets the sentence touches raised and lit, plus the structural rail that
 * nothing ever leaves.
 */
export function BucketGrid({ ui, pads }: { ui: GlyphAtlas; pads: number }) {
  const timeline = useTimeline();
  const cols = Math.ceil(Math.sqrt(pads));
  const spacing = pads > 200 ? 0.5 : 1.4;
  const parts = useMemo(
    () => ({
      bodies: new BodyBatch(new THREE.BoxGeometry(1, 1, 1), pads + 3),
      labels: new GlyphBatch(ui, 140),
    }),
    [ui, pads],
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
    let field = 0;
    let bins = 0;
    let dim = 0;
    if (beat.id === "buckets") {
      field = hold(t, 0, 0.35);
      bins = ease.outBack(hold(t, 0.08, 0.3));
    } else if (beat.id === "permute") {
      field = 1;
      bins = 1;
      dim = hold(t, 0, 0.3);
    } else if (beat.id === "bake") {
      field = 1 - hold(t, 0, 0.1);
      bins = 1 - hold(t, 0, 0.1);
      dim = 1;
    }

    if (field > 0 || bins > 0) {
      for (let k = 0; k < pads; k++) {
        const col = k % cols;
        const row = Math.floor(k / cols);
        const x = (col - (cols - 1) / 2) * spacing;
        const z = (row - (cols - 1) / 2) * spacing - 0.5;
        const dist = Math.hypot(x, z) / (cols * spacing * 0.7);
        const reveal = ease.outCubic(hold(field, dist * 0.6, dist * 0.6 + 0.4));
        const lit = hash(k, 30) < 0.14;
        const pulse = lit
          ? 0.5 + 0.5 * Math.sin(time * 2 + hash(k, 31) * 6)
          : 0;
        color.copy(cPad).lerp(cPadLit, pulse * (1 - dim * 0.7));
        const size = spacing * 0.68 * reveal;
        parts.bodies.set(n++, {
          x,
          y: L.gridY,
          z,
          sx: size,
          sy: 0.05,
          sz: size,
          color,
        });
      }
      // Bin platforms and structural rail.
      const binPulse = 0.5 + 0.5 * Math.sin(time * 3);
      color.copy(cBin).lerp(cBinHot, 0.25 + binPulse * 0.25);
      parts.bodies.set(n++, {
        x: L.binLl[0],
        y: L.binLl[1] - 0.05,
        z: L.binLl[2],
        sx: 2.3 * bins,
        sy: 0.18 * bins,
        sz: 2.1 * bins,
        color,
      });
      color.copy(cBin).lerp(cBinHot, 0.15 + binPulse * 0.15);
      parts.bodies.set(n++, {
        x: L.binLu[0],
        y: L.binLu[1] - 0.05,
        z: L.binLu[2],
        sx: 1.4 * bins,
        sy: 0.18 * bins,
        sz: 1.4 * bins,
        color,
      });
      parts.bodies.set(n++, {
        x: 0,
        y: L.gridY + 0.05,
        z: L.railZ,
        sx: 9 * bins,
        sy: 0.1 * bins,
        sz: 0.7 * bins,
        color: cRail,
      });

      const labelAlpha = bins * (1 - dim * 0.6);
      labels += parts.labels.text(labels, "Ll · Latin lowercase", {
        x: L.binLl[0],
        y: L.binLl[1] + 0.2,
        z: L.binLl[2] + 1.45,
        size: 0.22,
        color: cAccent,
        alpha: labelAlpha,
        align: "center",
      });
      labels += parts.labels.text(labels, "Lu · Latin uppercase", {
        x: L.binLu[0],
        y: L.binLu[1] + 0.2,
        z: L.binLu[2] + 1.1,
        size: 0.18,
        color: cAccent,
        alpha: labelAlpha,
        align: "center",
      });
      labels += parts.labels.text(labels, "structural · never permuted", {
        x: 0,
        y: L.gridY + 0.25,
        z: L.railZ + 0.75,
        size: 0.2,
        color: cMuted,
        alpha: labelAlpha,
        align: "center",
      });
      labels += parts.labels.text(
        labels,
        "763 property signatures · Unicode 17",
        {
          x: -5.2,
          y: L.gridY + 0.3,
          z: -5.4,
          size: 0.26,
          color: cMuted,
          alpha: field * (1 - dim),
          align: "left",
        },
      );
    }
    parts.bodies.commit(n);
    parts.labels.commit(labels);
  });

  return (
    <>
      <primitive object={parts.bodies.mesh} />
      <primitive object={parts.labels.mesh} />
    </>
  );
}
