import * as THREE from "three";

export const BG_COLOR = 0x050b16;
export const EDGE_COLOR = 0x8fe9ff;
export const WINDOW_COLOR = 0x2c7a94;
export const ACCENT_COLOR = 0xd6faff;
export const GROUND_COLOR = 0x1c4a5c;

// Standard alpha compositing (result = alpha*foreground + (1-alpha)*background),
// applied once per color at build time instead of every frame on the GPU.
// Lets many "translucent" line layers merge into one opaque draw call —
// see city-generator.js / scene-builder.js for where this gets used.
export function blendedColor(hex, alpha) {
  const c = new THREE.Color(hex);
  const bg = new THREE.Color(BG_COLOR);
  return [
    c.r * alpha + bg.r * (1 - alpha),
    c.g * alpha + bg.g * (1 - alpha),
    c.b * alpha + bg.b * (1 - alpha),
  ];
}
