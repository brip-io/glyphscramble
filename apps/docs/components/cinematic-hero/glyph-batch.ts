import * as THREE from "three";
import type { GlyphAtlas } from "./glyph-atlas";

const vertexShader = /* glsl */ `
attribute vec4 aUv;
attribute vec3 aColor;
attribute float aAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = aUv.xy + uv * aUv.zw;
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float a = texture2D(map, vUv).a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export interface GlyphInstance {
  x: number;
  y: number;
  z: number;
  rx?: number | undefined;
  ry?: number | undefined;
  rz?: number | undefined;
  scale: number;
  char: string;
  color: THREE.Color;
  alpha: number;
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();
const direction = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * Instanced glyph quads sampling a canvas atlas. One draw call per batch.
 * Actors write instances every frame and call `commit`.
 */
export class GlyphBatch {
  readonly mesh: THREE.InstancedMesh;
  private readonly uvs: THREE.InstancedBufferAttribute;
  private readonly colors: THREE.InstancedBufferAttribute;
  private readonly alphas: THREE.InstancedBufferAttribute;
  private atlas: GlyphAtlas;

  constructor(atlas: GlyphAtlas, capacity: number) {
    this.atlas = atlas;
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.uvs = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 4),
      4,
    );
    this.colors = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    );
    this.alphas = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity),
      1,
    );
    geometry.setAttribute("aUv", this.uvs);
    geometry.setAttribute("aColor", this.colors);
    geometry.setAttribute("aAlpha", this.alphas);
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas.texture } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  setAtlas(atlas: GlyphAtlas) {
    this.atlas = atlas;
    const uniform = (this.mesh.material as THREE.ShaderMaterial).uniforms.map;
    if (uniform) uniform.value = atlas.texture;
  }

  set(index: number, instance: GlyphInstance, atlas: GlyphAtlas = this.atlas) {
    const glyph = atlas.glyphs.get(instance.char) ?? atlas.fallback;
    position.set(instance.x, instance.y, instance.z);
    euler.set(instance.rx ?? 0, instance.ry ?? 0, instance.rz ?? 0);
    quaternion.setFromEuler(euler);
    scale.setScalar(instance.scale);
    matrix.compose(position, quaternion, scale);
    this.mesh.setMatrixAt(index, matrix);
    this.uvs.setXYZW(index, glyph.u, glyph.v, glyph.w, glyph.h);
    this.colors.setXYZ(
      index,
      instance.color.r,
      instance.color.g,
      instance.color.b,
    );
    this.alphas.setX(index, instance.alpha);
  }

  commit(count: number) {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.uvs.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.alphas.needsUpdate = true;
  }

  /** Lay out a string as a row of glyphs; returns the number of instances. */
  text(
    start: number,
    text: string,
    options: {
      x: number;
      y: number;
      z: number;
      size: number;
      color: THREE.Color;
      alpha: number;
      align?: "left" | "center";
      ry?: number;
      atlas?: GlyphAtlas;
    },
  ): number {
    const atlas = options.atlas ?? this.atlas;
    const spacing = options.size * 0.62;
    let width = 0;
    for (const char of text) {
      const glyph = atlas.glyphs.get(char) ?? atlas.fallback;
      width += Math.max(glyph.advance, 0.25) * options.size + spacing * 0.15;
    }
    let cursor = options.align === "center" ? options.x - width / 2 : options.x;
    let index = start;
    for (const char of text) {
      const glyph = atlas.glyphs.get(char) ?? atlas.fallback;
      const advance = Math.max(glyph.advance, 0.25) * options.size;
      if (char !== " ") {
        this.set(
          index,
          {
            x: cursor + advance / 2,
            y: options.y,
            z: options.z,
            ry: options.ry,
            scale: options.size,
            char,
            color: options.color,
            alpha: options.alpha,
          },
          atlas,
        );
        index++;
      }
      cursor += advance + spacing * 0.15;
    }
    return index - start;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export interface BodyInstance {
  x: number;
  y: number;
  z: number;
  rx?: number | undefined;
  ry?: number | undefined;
  rz?: number | undefined;
  sx: number;
  sy: number;
  sz: number;
  color: THREE.Color;
}

/** Instanced solid bodies (tiles, pads, bricks) sharing one standard material. */
export class BodyBatch {
  readonly mesh: THREE.InstancedMesh;

  constructor(
    geometry: THREE.BufferGeometry,
    capacity: number,
    material: THREE.Material = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.55,
      metalness: 0.25,
    }),
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color("#ffffff"));
    if (this.mesh.instanceColor)
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  set(index: number, body: BodyInstance) {
    position.set(body.x, body.y, body.z);
    euler.set(body.rx ?? 0, body.ry ?? 0, body.rz ?? 0);
    quaternion.setFromEuler(euler);
    scale.set(body.sx, body.sy, body.sz);
    matrix.compose(position, quaternion, scale);
    this.mesh.setMatrixAt(index, matrix);
    this.mesh.setColorAt(index, body.color);
  }

  /** A bar stretched from `a` toward `b`, grown to `grow` of its length. */
  setFromTo(
    index: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thickness: number,
    color: THREE.Color,
    grow = 1,
  ) {
    direction.subVectors(b, a);
    const length = direction.length() * grow;
    direction.normalize();
    quaternion.setFromUnitVectors(X_AXIS, direction);
    position.copy(a).addScaledVector(direction, length / 2);
    scale.set(Math.max(length, 0.0001), thickness, thickness);
    matrix.compose(position, quaternion, scale);
    this.mesh.setMatrixAt(index, matrix);
    this.mesh.setColorAt(index, color);
  }

  commit(count: number) {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
