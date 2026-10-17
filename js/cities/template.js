import { currentFrame, setFrame, frameX, frameZ } from "../frame.js";
import { pushSegment, pushLoop, localPoint, facePoint } from "../geometry.js";
import { randRange } from "../rng.js";
import { createSpatialHash } from "../spatial-hash.js";

/**
 * ============================================================================
 * CYBERSPACE CITY STARTER TEMPLATE
 * ============================================================================
 *
 * HOW TO ADD A NEW CITY TO CYBERSPACE:
 * 1. Copy this file to `js/cities/<your-city-id>.js`.
 * 2. Configure the profile object at the bottom (`templateCity`).
 * 3. Implement your procedural logic inside `generateCustomCity()`.
 * 4. Add 2 lines to `js/cities/registry.js` (import + add to CITIES array).
 *
 * THAT'S IT! The UI segmented buttons, select dropdown, world card, loading
 * text, color palette, and lifecycle will automatically configure themselves.
 * ============================================================================
 */

export function generateCustomCity(options = {}) {
  // 1. Data arrays required by the renderer contract
  const buildingBoxes = [];
  const edgeVerts = [];
  const windowVerts = [];
  const accentVerts = [];
  const groundVerts = [];
  const centerlineVerts = [];
  const roadList = [];

  const counts = { buildings: 0 };
  const CITY_RADIUS = 300;
  const GY = 0.02; // standard ground elevation

  // 2. Standard box primitive helper
  function addBox(x, y0, z, w, h, d, ry = 0, win = true) {
    const X = frameX(x, z);
    const Z = frameZ(x, z);
    const b = { x: X, cy: y0 + h / 2, z: Z, w, h, d, ry: ry + currentFrame.r };
    b.c = Math.cos(b.ry);
    b.s = Math.sin(b.ry);
    buildingBoxes.push(b);

    // 8 box corners
    const cs = [];
    for (let i = 0; i < 8; i++) {
      cs.push(localPoint(b, (i & 1 ? 1 : -1) * w / 2, (i & 2 ? 1 : -1) * h / 2, (i & 4 ? 1 : -1) * d / 2));
    }
    // 12 edges
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 3; k++) {
        const bit = 1 << k;
        if (!(i & bit)) {
          pushSegment(edgeVerts, cs[i][0], cs[i][1], cs[i][2], cs[i | bit][0], cs[i | bit][1], cs[i | bit][2]);
        }
      }
    }
    if (win !== false && h > 3) addWindows(b);
    counts.buildings++;
    return b;
  }

  function addWindows(b) {
    const yb = -b.h / 2 + 1.2;
    const yt = b.h / 2 - 0.6;
    const rows = Math.min(18, Math.floor((yt - yb) / 1.6));
    if (rows < 1) return;
    for (let f = 0; f < 4; f++) {
      const L = f < 2 ? b.w : b.d;
      const n = (f < 2 ? b.d : b.w) / 2 + 0.03;
      const m = L * 0.12;
      const cols = Math.max(1, Math.floor(L / 1.6));
      for (let i = 0; i <= cols; i++) {
        const u = -L / 2 + m + (L - 2 * m) * i / cols;
        const p = facePoint(b, f, u, yb, n);
        const q = facePoint(b, f, u, yt, n);
        pushSegment(windowVerts, p[0], p[1], p[2], q[0], q[1], q[2]);
      }
      for (let i = 0; i <= rows; i++) {
        const y = yb + (yt - yb) * i / rows;
        const p = facePoint(b, f, -L / 2 + m, y, n);
        const q = facePoint(b, f, L / 2 - m, y, n);
        pushSegment(windowVerts, p[0], p[1], p[2], q[0], q[1], q[2]);
      }
    }
  }

  // --- Example generation logic: replace with your own procedural rules ---
  addBox(0, 0, 0, 30, 60, 30, 0, true);

  // Ground perimeter
  const SEG = 64;
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2;
    const a1 = ((i + 1) / SEG) * Math.PI * 2;
    pushSegment(groundVerts, Math.cos(a0) * CITY_RADIUS, GY, Math.sin(a0) * CITY_RADIUS, Math.cos(a1) * CITY_RADIUS, GY, Math.sin(a1) * CITY_RADIUS);
  }

  const stats = `${roadList.length} roads · ${buildingBoxes.length} solids`;

  // 3. Return the full data contract
  return {
    buildingBoxes,
    edgeVerts,
    windowVerts,
    accentVerts,
    groundVerts,
    centerlineVerts,
    roadList,
    orgSites: [],
    typeCounts: counts,
    stats,
    CITY_RADIUS,
  };
}

/**
 * City Profile Configuration
 * Export either as a named export or default export.
 */
export const templateCity = {
  id: "template",
  name: "Template City",
  shortName: "TEMPLATE",
  badge: "04",
  kicker: "CUSTOM PROTOTYPE",
  description: "Starter template for new city generators",
  seed: "RUNTIME",
  seedNumber: null,
  chunks: "01 / 01",
  status: "TEMPLATE ONLINE",
  loadingMessage: "Building template city structures",
  hasGlitchCubes: false,
  palette: {
    edge: 0x8fe9ff,       // Cyan edge lines
    window: 0x2c7a94,     // Deep teal windows
    accent: 0xd6faff,     // Bright white-cyan accents
    ground: 0x1c4a5c,     // Dark teal kerbs/ground
    centerline: 0x1c4a5c, // Dark teal centerlines
  },
  generate: (options) => generateCustomCity(options),
};

export default templateCity;
