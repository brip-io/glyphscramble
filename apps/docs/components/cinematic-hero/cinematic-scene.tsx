"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import type { HeroTier } from "./capabilities";
import { ENCODED, SENTENCE } from "./choreography";
import type { GlyphAtlas } from "./glyph-atlas";
import { buildGlyphAtlas, LABEL_CHARS } from "./glyph-atlas";
import { BucketGrid } from "./primitives/bucket-grid";
import { CameraRig } from "./primitives/camera-rig";
import { Conveyor } from "./primitives/conveyor";
import { Dust } from "./primitives/dust";
import { LanesAndFrames } from "./primitives/lanes-frames";
import { PermuteRow } from "./primitives/permute-row";
import { StageLights } from "./primitives/stage-lights";
import { TableRing } from "./primitives/table-ring";
import { TileSet } from "./primitives/tile-set";
import type { ProgressStore } from "./scroll-progress";
import { fixture } from "./storyboard";
import { TimelineDriver } from "./timeline";

interface CinematicSceneProps {
  store: ProgressStore;
  tier: HeroTier;
  inView: boolean;
  onFallback: () => void;
}

interface Atlases {
  ui: GlyphAtlas;
  scrambled: GlyphAtlas;
}

const BUDGET = {
  full: {
    pads: 763,
    particles: 1500,
    dust: 600,
    bricks: 24,
    dpr: [1, 1.5] as [number, number],
  },
  lite: {
    pads: 96,
    particles: 500,
    dust: 180,
    bricks: 12,
    dpr: [1, 1.25] as [number, number],
  },
};

/**
 * The WebGL stage. Loaded through next/dynamic with ssr:false, so nothing in
 * this module runs on the server.
 */
export default function CinematicScene({
  store,
  tier,
  inView,
  onFallback,
}: CinematicSceneProps) {
  const [atlases, setAtlases] = useState<Atlases | null>(null);
  const budget = BUDGET[tier];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [uiResult, scrambledResult] = await Promise.allSettled([
          buildGlyphAtlas({
            chars: `${LABEL_CHARS}${SENTENCE}${ENCODED}${fixture.staticFamily}`,
            family: "Instrument Sans Variable",
            weight: 620,
            px: 96,
          }),
          buildGlyphAtlas({
            chars: ENCODED,
            family: fixture.family,
            weight: 400,
            px: 96,
            sample: ENCODED,
            requireFont: true,
          }),
        ]);
        if (
          cancelled ||
          uiResult.status === "rejected" ||
          scrambledResult.status === "rejected"
        ) {
          if (uiResult.status === "fulfilled") uiResult.value.texture.dispose();
          if (scrambledResult.status === "fulfilled")
            scrambledResult.value.texture.dispose();
          if (!cancelled) onFallback();
          return;
        }
        setAtlases({ ui: uiResult.value, scrambled: scrambledResult.value });
      } catch {
        if (!cancelled) onFallback();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onFallback]);

  useEffect(
    () => () => {
      atlases?.ui.texture.dispose();
      atlases?.scrambled.texture.dispose();
    },
    [atlases],
  );

  return (
    <Canvas
      frameloop="demand"
      dpr={budget.dpr}
      gl={{
        antialias: tier === "full",
        alpha: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true,
      }}
      camera={{ fov: 38, near: 0.1, far: 60, position: [0, 0.6, 14] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onFallback();
        });
      }}
      style={{ background: "transparent" }}
    >
      <TimelineDriver store={store} inView={inView}>
        <StageLights />
        <CameraRig />
        <Dust count={budget.dust} />
        {atlases ? (
          <>
            <TileSet ui={atlases.ui} scrambled={atlases.scrambled} />
            <TableRing ui={atlases.ui} />
            <BucketGrid ui={atlases.ui} pads={budget.pads} />
            <PermuteRow ui={atlases.ui} particles={budget.particles} />
            <Conveyor ui={atlases.ui} bricks={budget.bricks} />
            <LanesAndFrames ui={atlases.ui} />
          </>
        ) : null}
      </TimelineDriver>
    </Canvas>
  );
}
