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
    const count = 3 + Math.floor(randRange(0, 5)); // 3-7 cubes per building
    for (let i = 0; i < count; i++) {
      const face = Math.floor(randRange(0, 4));
      const faceLen = face < 2 ? b.w : b.d;
      const u = randRange(-faceLen / 2, faceLen / 2);
      const y = randRange(-b.h / 2 + 0.8, b.h / 2 - 0.8);
      const faceNormalOffset = (face < 2 ? b.d : b.w) / 2;
      const cubeSize = randRange(0.2, 0.5);
      const jitter = randRange(0, cubeSize * 0.9);
      const pos = facePoint(b, face, u, y, faceNormalOffset + jitter);
      cubes.push({
        x: pos[0],
        y: pos[1],
        z: pos[2],
        size: cubeSize,
        ry: b.ry + randRange(-0.35, 0.35),
      });
    }
  });
  return cubes;
}
