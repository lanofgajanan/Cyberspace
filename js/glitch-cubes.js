import { randRange } from "./rng.js";
import { facePoint } from "./geometry.js";

// NOTE: toned down per feedback that these read as too large/bright/
// disconnected against the streak field — count, size, and color pulled
// back from an earlier pass. Placement/behavior intended to be reworked
// further later; this is a reasonable "present but not distracting"
// baseline, not a finished design.
//
// Each cube's offset from its wall is scaled to the cube's OWN size and
// starts at 0, so the cube center is always somewhere between "exactly
// on the wall surface" (half embedded, half poking out — reads as
// emerging from it) and "just clear of the surface" — never floating
// detached from the building the way an unbounded offset would.
export function generateGlitchCubes(buildingBoxes) {
  const cubes = [];
  buildingBoxes.forEach((b) => {
    if (b.h < 3) return;
    // Expanded capacity (10-22 cubes per building) so user can scale density from sparse to heavy
    const count = 10 + Math.floor(randRange(0, 13));
    for (let i = 0; i < count; i++) {
      const face = Math.floor(randRange(0, 4));
      const faceLen = face < 2 ? b.w : b.d;
      const u = randRange(-faceLen / 2 + 0.3, faceLen / 2 - 0.3);
      const y = randRange(-b.h / 2 + 0.8, b.h / 2 - 0.8);
      const faceNormalOffset = (face < 2 ? b.d : b.w) / 2;
      const cubeSize = randRange(0.22, 0.52);
      const pos = facePoint(b, face, u, y, faceNormalOffset);
      cubes.push({
        b,
        face,
        faceLen,
        faceNormalOffset,
        baseU: u,
        baseY: y,
        uRange: Math.max(0.4, faceLen / 2 - 0.35),
        yRange: Math.max(0.5, b.h / 2 - 0.9),
        x: pos[0],
        y: pos[1],
        z: pos[2],
        size: cubeSize,
        baseSize: cubeSize,
        baseRy: b.ry + randRange(-0.35, 0.35),
        ry: b.ry,
        seed: randRange(0, 1000),
        burstFreq: randRange(0.35, 1.3), // glitch burst cycle frequency
        stutterSpeed: randRange(20, 45), // high-frequency digital noise rate
        extrudeMax: randRange(0.7, 2.0), // extrusion depth when popped out
      });
    }
  });
  return cubes;
}
