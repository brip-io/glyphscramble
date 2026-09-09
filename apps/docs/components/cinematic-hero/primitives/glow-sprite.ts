import * as THREE from "three";

let cachedTexture: THREE.CanvasTexture | undefined;

function glowTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.35)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.08)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  cachedTexture = new THREE.CanvasTexture(canvas);
  return cachedTexture;
}

/** Additive radial sprite: the cheap stand-in for a bloom pass. */
export function createGlow(
  color: THREE.ColorRepresentation,
  size = 2,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.8,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  return sprite;
}

export function setGlow(
  sprite: THREE.Sprite,
  x: number,
  y: number,
  z: number,
  size: number,
  opacity: number,
) {
  sprite.position.set(x, y, z);
  sprite.scale.setScalar(size);
  (sprite.material as THREE.SpriteMaterial).opacity = opacity;
  sprite.visible = opacity > 0.005 && size > 0.001;
}
