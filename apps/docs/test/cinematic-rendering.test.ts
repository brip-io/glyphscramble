import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildGlyphAtlas } from "../components/cinematic-hero/glyph-atlas";
import {
  BodyBatch,
  GlyphBatch,
} from "../components/cinematic-hero/glyph-batch";

function mockDocument(load: () => Promise<unknown>) {
  const context = {
    clearRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 40 }),
  };
  const createElement = vi.fn(() => ({ getContext: () => context }));
  vi.stubGlobal("document", { fonts: { load }, createElement });
  return { context, createElement };
}

afterEach(() => vi.unstubAllGlobals());

describe("glyph atlas font integrity", () => {
  const options = {
    chars: "xy",
    family: "EncodedFixture",
    weight: 400,
    sample: "xy",
    requireFont: true,
  };

  it("rejects a failed required font before rasterizing encoded characters", async () => {
    const error = new Error("font download failed");
    const { createElement } = mockDocument(() => Promise.reject(error));
    await expect(buildGlyphAtlas(options)).rejects.toBe(error);
    expect(createElement).not.toHaveBeenCalled();
  });

  it("rejects an undeclared face even when FontFaceSet.load resolves", async () => {
    const { createElement } = mockDocument(() => Promise.resolve([]));
    await expect(buildGlyphAtlas(options)).rejects.toThrow(
      "Required glyph font unavailable",
    );
    expect(createElement).not.toHaveBeenCalled();
  });

  it("rasterizes only after the required face loads with its subset sample", async () => {
    const load = vi.fn(() => Promise.resolve([{ status: "loaded" }]));
    const { context } = mockDocument(load);
    const atlas = await buildGlyphAtlas(options);
    expect(load).toHaveBeenCalledWith('400 96px "EncodedFixture"', "xy");
    expect(context.fillText).toHaveBeenCalledTimes(2);
    expect([...atlas.glyphs.keys()]).toEqual(["x", "y"]);
    atlas.texture.dispose();
  });

  it("still permits a system font fallback for ordinary UI labels", async () => {
    const { context } = mockDocument(() =>
      Promise.reject(new Error("offline")),
    );
    const atlas = await buildGlyphAtlas({ ...options, requireFont: false });
    expect(context.fillText).toHaveBeenCalledTimes(2);
    atlas.texture.dispose();
  });
});

describe("instanced batch resource ownership", () => {
  it.each(["glyph", "body"] as const)(
    "releases %s mesh buffers as well as geometry and material",
    (kind) => {
      const texture = new THREE.CanvasTexture({} as HTMLCanvasElement);
      const atlas = {
        texture,
        glyphs: new Map(),
        fallback: { u: 0, v: 0, w: 1, h: 1, advance: 1 },
      };
      const batch =
        kind === "glyph"
          ? new GlyphBatch(atlas, 4)
          : new BodyBatch(new THREE.BoxGeometry(), 4);
      const meshDisposed = vi.fn();
      const geometryDisposed = vi.fn();
      const materialDisposed = vi.fn();
      const textureDisposed = vi.fn();
      batch.mesh.addEventListener("dispose", meshDisposed);
      batch.mesh.geometry.addEventListener("dispose", geometryDisposed);
      (batch.mesh.material as THREE.Material).addEventListener(
        "dispose",
        materialDisposed,
      );
      texture.addEventListener("dispose", textureDisposed);

      batch.dispose();

      expect(meshDisposed).toHaveBeenCalledOnce();
      expect(geometryDisposed).toHaveBeenCalledOnce();
      expect(materialDisposed).toHaveBeenCalledOnce();
      // Atlas textures are shared by multiple batches and owned by the scene.
      expect(textureDisposed).not.toHaveBeenCalled();
      texture.dispose();
    },
  );
});
