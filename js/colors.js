export const BG_COLOR = 0x050b16;
export const EDGE_COLOR = 0x8fe9ff;
export const WINDOW_COLOR = 0x2c7a94;
export const ACCENT_COLOR = 0xd6faff;
export const GROUND_COLOR = 0x1c4a5c;

export const SOVIET_PALETTE = {
  edge: 0xd4dcde,
  window: 0x82949e,
  accent: 0xff2828,
  ground: 0x24333c,
  centerline: 0x1c2830,
};

export function hexToRgb(hex) {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}

// Standard alpha compositing (result = alpha*foreground + (1-alpha)*background),
// applied once per color at build time instead of every frame on the GPU.
// Lets many "translucent" line layers merge into one opaque draw call —
// see city-generator.js / scene-builder.js for where this gets used.
export function blendedColor(hex, alpha) {
  const fg = hexToRgb(hex);
  const bg = hexToRgb(BG_COLOR);
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}
