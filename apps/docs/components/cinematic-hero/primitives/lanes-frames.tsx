"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { L, PALETTE } from "../choreography";
import type { GlyphAtlas } from "../glyph-atlas";
import { BodyBatch, GlyphBatch } from "../glyph-batch";
import { heroBrickLift } from "./conveyor";
import { createGlow, setGlow } from "./glow-sprite";
import { ease, fixture, hold, lerp } from "../storyboard";
import type { TimelineState } from "../timeline";
import { useTimeline } from "../timeline";

const cFrame = new THREE.Color(PALETTE.panel);
const cFrameEdge = new THREE.Color(PALETTE.line);
const cBar = new THREE.Color("#141818");
const cLane = new THREE.Color(PALETTE.fold);
const cLaneHot = new THREE.Color(PALETTE.accent);
const cCard = new THREE.Color("#101414");
const cHot = new THREE.Color(PALETTE.actionBright);
const cInk = new THREE.Color(PALETTE.ink);
const cMuted = new THREE.Color(PALETTE.muted);
const cAccent = new THREE.Color(PALETTE.accent);
const cDanger = new THREE.Color(PALETTE.danger);
const cDangerDim = new THREE.Color(PALETTE.dangerDim);
const cBolt = new THREE.Color("#ffffff");
const color = new THREE.Color();

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const TOKEN = new THREE.Vector3(...L.token);
const TERMINAL = new THREE.Vector3(...L.terminal);
const BROWSER = new THREE.Vector3(...L.browser);
const TERMINAL_DOCK = new THREE.Vector3(L.terminal[0], L.terminal[1] + 1, 0.25);
const BROWSER_DOCK = new THREE.Vector3(
  L.browser[0] - 1.2,
  L.browser[1] + 1,
  0.25,
);
const BRICK_DOCK = new THREE.Vector3(...L.brickDock);
const RECOVERY = new THREE.Vector3(...L.recovery);
const RECOVERY_START = new THREE.Vector3(
  L.browser[0],
  L.browser[1] - L.frameH / 2,
  0.3,
);

interface Phases {
  bolt: number;
  ring: number;
  split: number;
  frames: number;
  terminalChip: number;
  loadBar: number;
  sweep: number;
  sameBytes: number;
  recovery: number;
  headers: number;
}

function phases(state: TimelineState, out: Phases) {
  const { beat, t } = state;
  out.bolt = 0;
  out.ring = 0;
  out.split = 0;
  out.frames = 0;
  out.terminalChip = 0;
  out.loadBar = 0;
  out.sweep = 0;
  out.sameBytes = 0;
  out.recovery = 0;
  out.headers = 0;
  switch (beat.id) {
    case "lease":
      out.bolt = t < 0.12 ? 1 - hold(t, 0.02, 0.12) : 0;
      out.ring = ease.outCubic(hold(t, 0.28, 0.48));
      out.split = ease.inOutCubic(hold(t, 0.52, 0.95));
      out.frames = ease.outBack(hold(t, 0.55, 0.8));
      out.headers = hold(t, 0.62, 0.8);
      return;
    case "raw-agent":
      out.ring = 1;
      out.split = 1;
      out.frames = 1;
      out.headers = 1 - hold(t, 0.1, 0.3);
      out.terminalChip = ease.outCubic(hold(t, 0.45, 0.65));
      return;
    case "human":
      out.ring = 1;
      out.split = 1;
      out.frames = 1;
      out.terminalChip = 1;
      out.loadBar = hold(t, 0.4, 0.6);
      out.sweep = hold(t, 0.6, 0.92);
      out.sameBytes = hold(t, 0.9, 1);
      return;
    case "recovery":
      out.ring = 1;
      out.split = 1;
      out.frames = 1;
      out.terminalChip = 1;
      out.loadBar = 1;
      out.sweep = 1;
      out.sameBytes = 1;
      out.recovery = t;
      return;
  }
}

const phase: Phases = {
  bolt: 0,
  ring: 0,
  split: 0,
  frames: 0,
  terminalChip: 0,
  loadBar: 0,
  sweep: 0,
  sameBytes: 0,
  recovery: 0,
  headers: 0,
};

/**
 * Beats 5-8: the token forge, the two artifact lanes, the raw-fetch terminal,
 * the human browser frame, and the recovery lane.
 */
export function LanesAndFrames({ ui }: { ui: GlyphAtlas }) {
  const timeline = useTimeline();
  const parts = useMemo(() => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.05, 12, 64),
      new THREE.MeshStandardMaterial({
        color: PALETTE.accent,
        emissive: PALETTE.accent,
        emissiveIntensity: 1.4,
        roughness: 0.3,
        metalness: 0.4,
      }),
    );
    ring.visible = false;
    return {
      bodies: new BodyBatch(new THREE.BoxGeometry(1, 1, 1), 40),
      labels: new GlyphBatch(ui, 520),
      ring,
      ringGlow: createGlow(PALETTE.accent, 3),
      boltGlow: createGlow("#ffffff", 5),
      packetA: createGlow(PALETTE.accent, 0.9),
      packetB: createGlow(PALETTE.accent, 0.9),
      sweepGlow: createGlow(PALETTE.accent, 4),
      recoveryGlow: createGlow(PALETTE.danger, 2.4),
    };
  }, [ui]);
  useEffect(
    () => () => {
      parts.bodies.dispose();
      parts.labels.dispose();
      parts.ring.geometry.dispose();
      (parts.ring.material as THREE.Material).dispose();
    },
    [parts],
  );

  useFrame(() => {
    const state = timeline.current;
    const { beat, t, time } = state;
    phases(state, phase);
    let n = 0;
    let labels = 0;
    const active =
      beat.id === "lease" ||
      beat.id === "raw-agent" ||
      beat.id === "human" ||
      beat.id === "recovery";
    if (!active) {
      parts.bodies.commit(0);
      parts.labels.commit(0);
      parts.ring.visible = false;
      setGlow(parts.ringGlow, 0, 0, 0, 0, 0);
      setGlow(parts.boltGlow, 0, 0, 0, 0, 0);
      setGlow(parts.packetA, 0, 0, 0, 0, 0);
      setGlow(parts.packetB, 0, 0, 0, 0, 0);
      setGlow(parts.sweepGlow, 0, 0, 0, 0, 0);
      setGlow(parts.recoveryGlow, 0, 0, 0, 0, 0);
      return;
    }

    // Request bolt.
    if (phase.bolt > 0) {
      const [bx, by, bz] = heroBrickLift(0);
      parts.bodies.set(n++, {
        x: bx,
        y: by + 5,
        z: bz,
        sx: 0.06,
        sy: 10 * phase.bolt,
        sz: 0.06,
        color: cBolt,
      });
      setGlow(parts.boltGlow, bx, by, bz + 0.5, 5 * phase.bolt, phase.bolt);
      labels += parts.labels.text(labels, "GET /article · beginResponse()", {
        x: bx,
        y: by + 1.4,
        z: bz + 0.4,
        size: 0.22,
        color: cInk,
        alpha: phase.bolt,
        align: "center",
      });
    } else {
      setGlow(parts.boltGlow, 0, 0, 0, 0, 0);
    }

    // Hero brick after lift-off, the token ring around it, and its journey.
    const brickStage = beat.id === "lease" ? hold(t, 0.3, 0.3001) : 1;
    if (brickStage > 0) {
      vA.copy(TOKEN);
      vB.copy(BRICK_DOCK);
      const u = phase.split;
      const bx = lerp(vA.x, vB.x, u);
      const by = lerp(vA.y, vB.y, u) + Math.sin(u * Math.PI) * 1.6;
      const bz = lerp(vA.z, vB.z, u);
      const scale = lerp(1, 0.75, u);
      parts.bodies.set(n++, {
        x: bx,
        y: by,
        z: bz,
        ry: time * 0.6 * (1 - u),
        sx: 0.9 * scale,
        sy: 0.45 * scale,
        sz: 0.6 * scale,
        color: cHot,
      });
      parts.ring.visible = phase.ring > 0;
      const ringScale = lerp(3.2, 1, phase.ring) * lerp(1, 0.8, u);
      parts.ring.position.set(bx, by, bz);
      parts.ring.scale.setScalar(ringScale);
      parts.ring.rotation.set(time * 0.7, time * 0.9, 0);
      (parts.ring.material as THREE.MeshStandardMaterial).opacity = 1;
      setGlow(
        parts.ringGlow,
        bx,
        by,
        bz + 0.5,
        2.6 * ringScale * 0.6,
        phase.ring * 0.8,
      );
      labels += parts.labels.text(
        labels,
        "font URL · AES-256-GCM token · expires",
        {
          x: bx,
          y: by - 0.95 * ringScale * 0.5 - 0.35,
          z: bz + 0.4,
          size: 0.18,
          color: cAccent,
          alpha: phase.ring * (1 - u),
          align: "center",
        },
      );
      labels += parts.labels.text(labels, "WOFF2 · cmap", {
        x: bx,
        y: by + 0.5,
        z: bz + 0.4,
        size: 0.16,
        color: cInk,
        alpha: u,
        align: "center",
      });
    } else {
      parts.ring.visible = false;
      setGlow(parts.ringGlow, 0, 0, 0, 0, 0);
    }

    // Lanes and payload cards.
    if (phase.split > 0) {
      const grow = phase.split;
      parts.bodies.setFromTo(n++, TOKEN, TERMINAL_DOCK, 0.05, cLane, grow);
      parts.bodies.setFromTo(n++, TOKEN, BROWSER_DOCK, 0.05, cLane, grow);
      parts.bodies.setFromTo(n++, TOKEN, BRICK_DOCK, 0.05, cLaneHot, grow);
      const flow = (time * 0.35) % 1;
      vA.copy(TOKEN).lerp(TERMINAL_DOCK, flow);
      setGlow(parts.packetA, vA.x, vA.y, vA.z + 0.1, 0.9, grow * 0.9);
      vB.copy(TOKEN).lerp(BROWSER_DOCK, (flow + 0.5) % 1);
      setGlow(parts.packetB, vB.x, vB.y, vB.z + 0.1, 0.9, grow * 0.9);

      for (const [dock, tag] of [
        [TERMINAL_DOCK, "payload v3 → raw-fetch agent"],
        [BROWSER_DOCK, "payload v3 → human browser"],
      ] as const) {
        const u = ease.inOutCubic(grow);
        const x = lerp(TOKEN.x, dock.x, u);
        const y = lerp(TOKEN.y, dock.y, u) + Math.sin(u * Math.PI) * 1.2;
        const z = lerp(TOKEN.z, dock.z, u);
        parts.bodies.set(n++, {
          x,
          y,
          z,
          sx: 3,
          sy: 0.5,
          sz: 0.08,
          color: cCard,
        });
        labels += parts.labels.text(labels, tag, {
          x,
          y: y + 0.08,
          z: z + 0.06,
          size: 0.16,
          color: cAccent,
          alpha: 1,
          align: "center",
        });
        labels += parts.labels.text(
          labels,
          "encodedText · family · fontUrl · expiresAt",
          {
            x,
            y: y - 0.14,
            z: z + 0.06,
            size: 0.11,
            color: cMuted,
            alpha: 1,
            align: "center",
          },
        );
      }
    } else {
      setGlow(parts.packetA, 0, 0, 0, 0, 0);
      setGlow(parts.packetB, 0, 0, 0, 0, 0);
    }

    // Cache header chips.
    if (phase.headers > 0) {
      const a = phase.headers;
      for (const [x, text] of [
        [3.6, `document · ${fixture.documentCache}`],
        [-3.6, `font · ${fixture.fontCache}`],
      ] as const) {
        const y = 3 - (1 - a) * 0.6;
        parts.bodies.set(n++, {
          x,
          y,
          z: -1,
          sx: 4.2 * a,
          sy: 0.46,
          sz: 0.08,
          color: cCard,
        });
        labels += parts.labels.text(labels, text, {
          x,
          y,
          z: -0.94,
          size: 0.14,
          color: cMuted,
          alpha: a,
          align: "center",
        });
      }
    }

    // Frames.
    if (phase.frames > 0) {
      const s = phase.frames;
      for (const [origin, title, subtitle] of [
        [TERMINAL, "raw-fetch agent", "GET /article → 200 · text/html"],
        [BROWSER, "human in a browser", "FontFace · document.fonts"],
      ] as const) {
        parts.bodies.set(n++, {
          x: origin.x,
          y: origin.y,
          z: origin.z - 0.05,
          sx: (L.frameW + 0.12) * s,
          sy: (L.frameH + 0.12) * s,
          sz: 0.06,
          color: cFrameEdge,
        });
        parts.bodies.set(n++, {
          x: origin.x,
          y: origin.y,
          z: origin.z,
          sx: L.frameW * s,
          sy: L.frameH * s,
          sz: 0.08,
          color: cFrame,
        });
        parts.bodies.set(n++, {
          x: origin.x,
          y: origin.y + L.frameH / 2 - 0.3,
          z: origin.z + 0.05,
          sx: L.frameW * s,
          sy: 0.6 * s,
          sz: 0.04,
          color: cBar,
        });
        labels += parts.labels.text(labels, title, {
          x: origin.x - L.frameW / 2 + 0.25,
          y: origin.y + L.frameH / 2 - 0.24,
          z: origin.z + 0.1,
          size: 0.2,
          color: cInk,
          alpha: s,
          align: "left",
        });
        labels += parts.labels.text(labels, subtitle, {
          x: origin.x - L.frameW / 2 + 0.25,
          y: origin.y + L.frameH / 2 - 0.46,
          z: origin.z + 0.1,
          size: 0.13,
          color: cMuted,
          alpha: s,
          align: "left",
        });
      }
    }

    // Terminal chip: no decoder here.
    if (phase.terminalChip > 0) {
      const a = phase.terminalChip;
      const y = TERMINAL.y - 1.45;
      parts.bodies.set(n++, {
        x: TERMINAL.x,
        y,
        z: 0.2,
        sx: 5.2 * a,
        sy: 0.5,
        sz: 0.06,
        color: cDangerDim,
      });
      labels += parts.labels.text(
        labels,
        "no mapping · no decoder in the document",
        {
          x: TERMINAL.x,
          y,
          z: 0.26,
          size: 0.16,
          color: cDanger,
          alpha: a,
          align: "center",
        },
      );
    }

    // Browser load bar and sweep.
    if (phase.frames > 0 && (beat.id === "human" || beat.id === "recovery")) {
      const width = 5;
      const y = BROWSER.y - 1.45;
      parts.bodies.set(n++, {
        x: BROWSER.x,
        y,
        z: 0.2,
        sx: width,
        sy: 0.12,
        sz: 0.04,
        color: cBar,
      });
      parts.bodies.set(n++, {
        x: BROWSER.x - width / 2 + (width * phase.loadBar) / 2,
        y,
        z: 0.24,
        sx: width * phase.loadBar,
        sy: 0.12,
        sz: 0.04,
        color: cAccent,
      });
      labels += parts.labels.text(
        labels,
        phase.loadBar >= 1
          ? "document.fonts.load() → ready"
          : "document.fonts.load() …",
        {
          x: BROWSER.x,
          y: y - 0.3,
          z: 0.26,
          size: 0.15,
          color: phase.loadBar >= 1 ? cAccent : cMuted,
          alpha: 1,
          align: "center",
        },
      );
      if (phase.sweep > 0 && phase.sweep < 1) {
        const sx = lerp(BROWSER.x - 4, BROWSER.x + 4, phase.sweep);
        parts.bodies.set(n++, {
          x: sx,
          y: BROWSER.y,
          z: 0.35,
          sx: 0.06,
          sy: L.frameH - 0.3,
          sz: 0.04,
          color: cAccent,
        });
        setGlow(parts.sweepGlow, sx, BROWSER.y, 0.5, 3.4, 0.9);
      } else {
        setGlow(parts.sweepGlow, 0, 0, 0, 0, 0);
      }
      if (phase.sameBytes > 0) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 4);
        color.copy(cCard).lerp(cHot, 0.4 * pulse);
        parts.bodies.set(n++, {
          x: BROWSER.x + 1.5,
          y: BROWSER.y + 2.35,
          z: 0.1,
          sx: 3.2 * phase.sameBytes,
          sy: 0.46,
          sz: 0.06,
          color,
        });
        labels += parts.labels.text(
          labels,
          "same bytes · rendered by the cmap",
          {
            x: BROWSER.x + 1.5,
            y: BROWSER.y + 2.35,
            z: 0.16,
            size: 0.15,
            color: cInk,
            alpha: phase.sameBytes,
            align: "center",
          },
        );
      }
    } else {
      setGlow(parts.sweepGlow, 0, 0, 0, 0, 0);
    }

    // Recovery lane.
    if (phase.recovery > 0) {
      const grow = ease.outCubic(hold(phase.recovery, 0.05, 0.4));
      const card = ease.outBack(hold(phase.recovery, 0.35, 0.6));
      parts.bodies.setFromTo(
        n++,
        RECOVERY_START,
        RECOVERY,
        0.06,
        cDanger,
        grow,
      );
      parts.bodies.set(n++, {
        x: RECOVERY.x,
        y: RECOVERY.y,
        z: RECOVERY.z,
        sx: 6.2 * card,
        sy: 0.9 * card,
        sz: 0.08,
        color: cDangerDim,
      });
      labels += parts.labels.text(
        labels,
        "headless browser · OCR · font analysis",
        {
          x: RECOVERY.x,
          y: RECOVERY.y + 0.16,
          z: RECOVERY.z + 0.06,
          size: 0.19,
          color: cInk,
          alpha: card,
          align: "center",
        },
      );
      labels += parts.labels.text(
        labels,
        "recoverable · higher cost, not prevented",
        {
          x: RECOVERY.x,
          y: RECOVERY.y - 0.2,
          z: RECOVERY.z + 0.06,
          size: 0.15,
          color: cDanger,
          alpha: card,
          align: "center",
        },
      );
      setGlow(
        parts.recoveryGlow,
        RECOVERY.x,
        RECOVERY.y,
        RECOVERY.z + 0.3,
        3 * card,
        card * (0.5 + 0.3 * Math.sin(time * 3)),
      );
    } else {
      setGlow(parts.recoveryGlow, 0, 0, 0, 0, 0);
    }

    parts.bodies.commit(n);
    parts.labels.commit(labels);
  });

  return (
    <>
      <primitive object={parts.bodies.mesh} />
      <primitive object={parts.labels.mesh} />
      <primitive object={parts.ring} />
      <primitive object={parts.ringGlow} />
      <primitive object={parts.boltGlow} />
      <primitive object={parts.packetA} />
      <primitive object={parts.packetB} />
      <primitive object={parts.sweepGlow} />
      <primitive object={parts.recoveryGlow} />
    </>
  );
}
