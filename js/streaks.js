import { randRange } from "./rng.js";
import { facePoint, localPoint } from "./geometry.js";
import { blendedColor, WINDOW_COLOR, GROUND_COLOR } from "./colors.js";

// Walks every line segment in a merged position/color buffer and samples
// points continuously along its length (not just the two endpoints —
// that was the original bug: a 12-unit-tall edge only had a dot at the
// top and bottom, nothing between).
export function subdivideToPoints(mergedPositions, mergedColors, spacing, outPositions, outColors) {
  for (let vi = 0; vi < mergedPositions.length; vi += 6) {
    const x1 = mergedPositions[vi], y1 = mergedPositions[vi + 1], z1 = mergedPositions[vi + 2];
    const x2 = mergedPositions[vi + 3], y2 = mergedPositions[vi + 4], z2 = mergedPositions[vi + 5];
    const cr1 = mergedColors[vi], cg1 = mergedColors[vi + 1], cb1 = mergedColors[vi + 2];
    const cr2 = mergedColors[vi + 3], cg2 = mergedColors[vi + 4], cb2 = mergedColors[vi + 5];
    const segLen = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const steps = Math.max(1, Math.round(segLen / spacing));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      outPositions.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t);
      outColors.push(cr1 + (cr2 - cr1) * t, cg1 + (cg2 - cg1) * t, cb1 + (cb2 - cb1) * t);
    }
  }
}

// Surface-fill points scattered across building side faces (NOT roofs —
// a flat horizontal rooftop covered in vertical streaks reads as wrong,
// not just unnecessary, per direct visual comparison against the
// reference material) and across the ground plane. This is what makes
// surfaces read as "made of dots" up close, not just outlined.
export function generateFillPoints(buildingBoxes, cityRadius, outPositions, outColors) {
  const fillColorBuilding = blendedColor(WINDOW_COLOR, 0.5);
  const FILL_SPACING = 1.1;
  buildingBoxes.forEach((b) => {
    if (b.h < 3) return;
    for (let f = 0; f < 4; f++) {
      const faceLen = f < 2 ? b.w : b.d;
      const faceNormalOffset = (f < 2 ? b.d : b.w) / 2 + 0.03;
      const uCount = Math.max(2, Math.round(faceLen / FILL_SPACING));
      const yCount = Math.max(2, Math.round(b.h / FILL_SPACING));
      for (let iu = 0; iu <= uCount; iu++) {
        const u = -faceLen / 2 + (faceLen * iu) / uCount + randRange(-0.12, 0.12);
        for (let iy = 0; iy <= yCount; iy++) {
          const y = -b.h / 2 + (b.h * iy) / yCount + randRange(-0.12, 0.12);
          const fp = facePoint(b, f, u, y, faceNormalOffset);
          outPositions.push(fp[0], fp[1], fp[2]);
          outColors.push(fillColorBuilding[0], fillColorBuilding[1], fillColorBuilding[2]);
        }
      }
    }
    // Deliberately no roof or bottom fill — see note above.
  });

  const fillColorGround = blendedColor(GROUND_COLOR, 0.45);
  const GROUND_FILL_SPACING = 2.4;
  for (let gx = -cityRadius; gx <= cityRadius; gx += GROUND_FILL_SPACING) {
    for (let gz = -cityRadius; gz <= cityRadius; gz += GROUND_FILL_SPACING) {
      if (Math.hypot(gx, gz) > cityRadius) continue;
      outPositions.push(gx + randRange(-0.6, 0.6), 0.02, gz + randRange(-0.6, 0.6));
      outColors.push(fillColorGround[0], fillColorGround[1], fillColorGround[2]);
    }
  }
}

// Converts sample points into actual vertical line-segment "streaks" in
// world space. THREE.Points sprites always billboard flat toward the
// camera, so a streak TEXTURE on them would only look vertical from some
// angles and visibly rotate as the camera orbits — real short line
// segments stay vertical from every angle, matching the reference
// material's thin light-trails rather than round dots.
//
// Each streak extends mostly upward (biased, like the reference's
// upward drips), gets a random length and a random brightness
// multiplier, and fades from dim at its bottom to full brightness at
// its top — this randomness is what gives the noisy, uneven texture
// instead of a uniform grid of identical marks.
export function buildStreakVertexData(positions, colors, minLen, maxLen) {
  const verts = [];
  const vcolors = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const r = colors[i], g = colors[i + 1], bch = colors[i + 2];
    const len = randRange(minLen, maxLen);
    const bright = randRange(0.5, 1.25);
    const topY = y + len * 0.7;
    const botY = y - len * 0.3;
    verts.push(x, botY, z, x, topY, z);
    vcolors.push(
      r * bright * 0.3, g * bright * 0.3, bch * bright * 0.3,
      r * bright, g * bright, bch * bright
    );
  }
  return { verts, vcolors };
}
