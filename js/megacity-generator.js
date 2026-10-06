import { resetSeed, nextRandom, randRange } from "./rng.js";
import { pushSegment, pushLoop } from "./geometry.js";
import { createTerrain } from "./terrain.js";

// This module deliberately produces renderer-neutral data. scene-builder.js
// turns the solids into one InstancedMesh and the line arrays into merged
// batches, so the city can be dense without multiplying draw calls.
const DISTRICT_PROFILES = [
  { id: "city-center", label: "City Center / megatowers", kind: "tower", accent: 0xc27dff, height: [55, 150] },
];

const TAU = Math.PI * 2;
const CITY_RADIUS = 360;
const BLACKWALL_SCALE = 7;
const BLACKWALL_BASE_RADIUS = CITY_RADIUS + 3;
const BLACKWALL_RADIUS = BLACKWALL_BASE_RADIUS * BLACKWALL_SCALE;
const BLACKWALL_HEIGHT = 62;

export function generateMegacity(seed = 4242) {
  resetSeed(seed);
  const terrain = createTerrain(seed);
  const buildingBoxes = [], edgeVerts = [], windowVerts = [], accentVerts = [];
  const groundVerts = [], centerlineVerts = [], trafficVerts = [], blackwallVerts = [];
  const districts = [], shelves = [], roads = [];

  const terrainY = terrain.groundHeightAt;
  function line(arr, a, b) { pushSegment(arr, a[0], a[1], a[2], b[0], b[1], b[2]); }
  function boxCorners(b) {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const x = (i & 1 ? 1 : -1) * b.w / 2, y = (i & 2 ? 1 : -1) * b.h / 2, z = (i & 4 ? 1 : -1) * b.d / 2;
      out.push([b.x + x * b.c + z * b.s, b.cy + y, b.z - x * b.s + z * b.c]);
    }
    return out;
  }
  function addWindows(b, density = 1) {
    if (b.h < 7 || density <= 0) return;
    const rows = Math.min(16, Math.max(1, Math.floor(b.h / 4.2)));
    const sides = [[b.w, b.d, 0], [b.w, b.d, 1], [b.d, b.w, 2], [b.d, b.w, 3]];
    sides.forEach(([length, depth, face]) => {
      const cols = Math.min(12, Math.max(1, Math.floor(length / (4.2 / density))));
      for (let c = 1; c < cols; c++) {
        const u = -length / 2 + length * c / cols;
        const p = (y, n) => {
          let lx = u, lz = depth / 2 + n;
          if (face === 1) { lx = -u; lz = -depth / 2 - n; }
          if (face === 2) { lx = depth / 2 + n; lz = -u; }
          if (face === 3) { lx = -depth / 2 - n; lz = u; }
          return [b.x + lx * b.c + lz * b.s, b.cy + y, b.z - lx * b.s + lz * b.c];
        };
        for (let r = 0; r <= rows; r++) {
          const y = -b.h / 2 + 1.5 + (b.h - 2.4) * r / rows;
          line(windowVerts, p(y - 0.45, 0.025), p(y + 0.45, 0.025));
        }
      }
    });
  }
  function addBox(x, y0, z, w, h, d, ry = 0, windows = true, detail = false) {
    const b = { x, cy: y0 + h / 2, z, w, h, d, ry, c: Math.cos(ry), s: Math.sin(ry) };
    buildingBoxes.push(b);
    const cs = boxCorners(b);
    for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) if (!(i & (1 << k))) {
      line(edgeVerts, cs[i], cs[i | (1 << k)]);
    }
    if (windows) addWindows(b, detail ? 0.65 : 1);
    return b;
  }
  function roofKit(x, y, z, w, d, ry, accent, kind) {
    if (kind === "tower" || kind === "corporate") {
      addBox(x, y, z, w * 0.66, randRange(3, 8), d * 0.66, ry, false);
      line(accentVerts, [x - w * 0.32, y + 0.1, z - d * 0.32], [x + w * 0.32, y + 0.1, z - d * 0.32]);
      addBox(x, y + 5, z, 0.35, randRange(8, 18), 0.35, 0, false);
    } else if (kind === "industrial") {
      addBox(x + w * 0.25, y, z, w * 0.14, randRange(4, 10), d * 0.14, 0, false);
      line(accentVerts, [x - w / 2, y + 0.2, z], [x + w / 2, y + 0.2, z]);
    } else {
      line(accentVerts, [x - w / 2, y + 0.05, z - d / 2], [x + w / 2, y + 0.05, z - d / 2]);
    }
    if (accent) line(accentVerts, [x - w * 0.4, y + 0.08, z], [x + w * 0.4, y + 0.08, z]);
  }
  function addRoad(a, b, width = 7, glow = true) {
    roads.push({ a, b, width });
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * width / 2, nz = dx / len * width / 2;
    line(groundVerts, [a[0] + nx, terrainY(a[0], a[1]) + 0.12, a[1] + nz], [b[0] + nx, terrainY(b[0], b[1]) + 0.12, b[1] + nz]);
    line(groundVerts, [a[0] - nx, terrainY(a[0], a[1]) + 0.12, a[1] - nz], [b[0] - nx, terrainY(b[0], b[1]) + 0.12, b[1] - nz]);
    line(centerlineVerts, [a[0], terrainY(a[0], a[1]) + 0.2, a[1]], [b[0], terrainY(b[0], b[1]) + 0.2, b[1]]);
    if (glow) line(trafficVerts, [a[0], terrainY(a[0], a[1]) + 0.28, a[1]], [b[0], terrainY(b[0], b[1]) + 0.28, b[1]]);
  }
  function addPark(cx, cz, y, profile) {
    pushLoop(groundVerts, [[cx - 30, cz - 22], [cx + 30, cz - 22], [cx + 30, cz + 22], [cx - 30, cz + 22]], y + 0.15);
    pushLoop(accentVerts, [[cx - 18, cz - 10], [cx + 18, cz - 10], [cx + 18, cz + 10], [cx - 18, cz + 10]], y + 0.2);
    for (let i = 0; i < 24; i++) {
      const x = cx + randRange(-26, 26), z = cz + randRange(-18, 18);
      addBox(x, y, z, 0.7, randRange(2, 4), 0.7, 0, false);
      addBox(x, y + 3, z, randRange(2, 4), randRange(1, 3), randRange(2, 4), randRange(0, TAU), false);
    }
    line(accentVerts, [cx - 22, y + 0.25, cz], [cx + 22, y + 0.25, cz]);
    if (profile.kind === "pacifica") pushLoop(groundVerts, [[cx - 10, cz - 6], [cx + 10, cz - 6], [cx + 10, cz + 6], [cx - 10, cz + 6]], y + 0.3);
  }
  function addLot(cx, cz, y, profile, row, col) {
    const w = randRange(5.2, 10.5), d = randRange(5.2, 10.5);
    const variation = ((row * 7 + col * 3) % 5) * 0.08;
    let h = randRange(profile.height[0], profile.height[1]) * (1 + variation);
    if (profile.kind === "tower") h += 35 * Math.max(0, 1 - Math.hypot(cx, cz) / 260);
    if (profile.kind === "badlands") h *= 0.5;
    if (profile.kind === "dogtown") h = Math.min(h, randRange(10, 30));
    const ry = profile.kind === "bazaar" ? randRange(-0.18, 0.18) : 0;
    addBox(cx, y, cz, w, h, d, ry, true, h < 14);
    if (profile.kind === "industrial") {
      addBox(cx + randRange(-2, 2), y + h, cz + randRange(-2, 2), randRange(1, 3), randRange(3, 12), randRange(1, 3), 0, false);
      line(accentVerts, [cx - w / 2, y + h * 0.55, cz], [cx + w / 2, y + h * 0.55, cz]);
    } else if (profile.kind === "pacifica") {
      addBox(cx, y + h, cz, w * 0.72, randRange(2, 5), d * 0.72, ry, false);
      line(accentVerts, [cx - w / 2, y + 1, cz - d / 2], [cx - w / 2, y + h - 1, cz - d / 2]);
    } else if (profile.kind === "dogtown") {
      addBox(cx + randRange(-3, 3), y + h, cz + randRange(-3, 3), w * 0.4, randRange(1, 3), d * 0.4, ry, false);
    } else {
      roofKit(cx, y + h, cz, w, d, ry, profile.accent, profile.kind);
    }
    if (h > 52 && nextRandom() < 0.7) {
      line(accentVerts, [cx, y + h, cz], [cx, y + h + randRange(5, 15), cz]);
    }
  }

  for (let level = 0; level <= terrain.diagnostics.terraceLevels; level++) {
    shelves.push({ level, y: level * terrain.H });
  }
  const cityCenter = { roads: 0, blocks: [], lots: [], buildings: 0, terraceY: terrainY(0, 0) + 3 };
  const centerRng = (() => {
    let state = (seed ^ 0x9e3779b9) >>> 0;
    return () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17; state >>>= 0;
      state ^= state << 5; state >>>= 0;
      return state / 4294967296;
    };
  })();
  function addCenterRoad(a, b, width, tier, glow = true) {
    const y = cityCenter.terraceY;
    roads.push({ a, b, width, tier, district: "city-center" });
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * width / 2, nz = dx / len * width / 2;
    line(groundVerts, [a[0] + nx, y + 0.12, a[1] + nz], [b[0] + nx, y + 0.12, b[1] + nz]);
    line(groundVerts, [a[0] - nx, y + 0.12, a[1] - nz], [b[0] - nx, y + 0.12, b[1] - nz]);
    line(centerlineVerts, [a[0], y + 0.2, a[1]], [b[0], y + 0.2, b[1]]);
    if (glow) line(trafficVerts, [a[0], y + 0.28, a[1]], [b[0], y + 0.28, b[1]]);
    cityCenter.roads++;
  }
  function addCenterLoop(radius, segments, width, tier) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * TAU, b = (i + 1) / segments * TAU;
      addCenterRoad([Math.cos(a) * radius, Math.sin(a) * radius], [Math.cos(b) * radius, Math.sin(b) * radius], width, tier);
    }
  }
  function addCenterBuilding(lot, style) {
    const before = buildingBoxes.length;
    const y = cityCenter.terraceY;
    const ry = lot.ry || 0;
    if (style === "tower") {
      addBox(lot.x, y, lot.z, lot.w + 4, 9, lot.d + 4, ry, false);
      addBox(lot.x, y + 9, lot.z, lot.w * 0.62, lot.h - 9, lot.d * 0.62, ry, true);
      line(accentVerts, [lot.x - lot.w * 0.3, y + lot.h, lot.z], [lot.x + lot.w * 0.3, y + lot.h, lot.z]);
      if (lot.h > 62) line(accentVerts, [lot.x, y + lot.h, lot.z], [lot.x, y + lot.h + 11, lot.z]);
    } else if (style === "civic") {
      addBox(lot.x, y, lot.z, lot.w, lot.h, lot.d, ry, true);
      addBox(lot.x, y + lot.h, lot.z, lot.w * 0.72, 3, lot.d * 0.72, ry, false);
      line(accentVerts, [lot.x - lot.w / 2, y + lot.h + 0.2, lot.z], [lot.x + lot.w / 2, y + lot.h + 0.2, lot.z]);
    } else {
      addBox(lot.x, y, lot.z, lot.w, lot.h, lot.d, ry, true);
      if (style === "podium") addBox(lot.x, y + lot.h, lot.z, lot.w * 0.76, 4, lot.d * 0.76, ry, false);
    }
    cityCenter.buildings += buildingBoxes.length - before;
  }
  function buildCityCenter() {
    const y = cityCenter.terraceY;
    pushLoop(groundVerts, [[-124, -124], [124, -124], [124, 124], [-124, 124]], y);
    addCenterLoop(112, 48, 10, "transition");
    addCenterLoop(48, 32, 8, "civic-ring");
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      addCenterRoad([Math.cos(a) * 48, Math.sin(a) * 48], [Math.cos(a) * 112, Math.sin(a) * 112], i % 2 ? 7 : 11, "arterial");
    }
    const edges = [-100, -66, -30, 10, 48, 84, 100];
    for (let i = 1; i < edges.length - 1; i++) {
      addCenterRoad([-100, edges[i]], [100, edges[i]], 5, "secondary", false);
      addCenterRoad([edges[i], -100], [edges[i], 100], 5, "secondary", false);
    }
    // Short alleys sit inside the secondary grid, leaving service access and
    // a readable margin around every authored building footprint.
    [-83, -48, -10, 29, 66, 83].forEach((p) => {
      addCenterRoad([-100, p], [-66, p], 2.5, "service", false);
      addCenterRoad([48, p], [84, p], 2.5, "service", false);
      addCenterRoad([p, -100], [p, -66], 2.5, "service", false);
      addCenterRoad([p, 48], [p, 84], 2.5, "service", false);
    });
    pushLoop(accentVerts, [[-31, -31], [31, -31], [31, 31], [-31, 31]], y + 0.3);
    pushLoop(groundVerts, [[-23, -23], [23, -23], [23, 23], [-23, 23]], y + 0.2);
    addCenterBuilding({ x: 0, z: -37, w: 18, d: 8, h: 14 }, "civic");
    addCenterBuilding({ x: 0, z: 37, w: 18, d: 8, h: 14 }, "civic");
    // A clipped orthogonal parcel grid keeps the lots legible around the
    // civic ring while naturally transitioning into the neighboring districts.
    for (let xi = 0; xi < edges.length - 1; xi++) for (let zi = 0; zi < edges.length - 1; zi++) {
      const x0 = edges[xi], x1 = edges[xi + 1], z0 = edges[zi], z1 = edges[zi + 1];
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.hypot(cx, cz) < 51 || Math.hypot(cx, cz) > 105) continue;
      const block = { x: cx, z: cz, w: x1 - x0, d: z1 - z0, tier: Math.hypot(cx, cz) < 76 ? "core" : "edge" };
      cityCenter.blocks.push(block);
      pushLoop(groundVerts, [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x1 - 2, z1 - 2], [x0 + 2, z1 - 2]], y + 0.35);
      const lotW = (block.w - 13) / 2, lotD = (block.d - 13) / 2;
      for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
        const x = x0 + 5.5 + lx * (lotW + 3), z = z0 + 5.5 + lz * (lotD + 3);
        const h = block.tier === "core" ? 34 + centerRng() * 34 : 22 + centerRng() * 28;
        const lot = { x, z, w: lotW, d: lotD, h, ry: (centerRng() - 0.5) * 0.08, block: cityCenter.blocks.length - 1 };
        cityCenter.lots.push(lot);
        addCenterBuilding(lot, h > 52 && centerRng() > 0.35 ? "tower" : "podium");
      }
    }
    // Four civic landmarks frame the open plaza without filling it.
    [[-66, -66, 76], [66, -66, 92], [66, 66, 70], [-66, 66, 84]].forEach(([x, z, h]) => {
      const lot = { x, z, w: 18, d: 18, h, ry: 0 };
      cityCenter.lots.push({ ...lot, landmark: true });
      addCenterBuilding(lot, "tower");
    });
  }

  const centerDistrict = {
    id: "city-center",
    label: "City Center / megatowers",
    profile: "tower",
    x: 0,
    z: 0,
    baseY: terrainY(0, 0),
    accent: 0xc27dff,
    cityCenter,
  };
  districts.push(centerDistrict);
  buildCityCenter();
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * TAU, b = (i + 1) / 72 * TAU, r = BLACKWALL_RADIUS;
    line(blackwallVerts, [Math.cos(a) * r, 2, Math.sin(a) * r], [Math.cos(b) * r, 2, Math.sin(b) * r]);
    if (i % 2 === 0) line(blackwallVerts, [Math.cos(a) * r, 2, Math.sin(a) * r], [Math.cos(a) * r, BLACKWALL_HEIGHT, Math.sin(a) * r]);
  }
  return {
    buildingBoxes, edgeVerts, windowVerts, accentVerts, groundVerts, centerlineVerts, trafficVerts, blackwallVerts,
    terrain, districts, shelves, connector: [], roads, CITY_RADIUS, blackwallRadius: BLACKWALL_RADIUS, blackwallHeight: BLACKWALL_HEIGHT, seed, profiles: DISTRICT_PROFILES,
    terrainEdgeVerts: terrain.edgeVerts,
    terrainEdgeColors: terrain.edgeColors,
    terrainHeatmapVerts: terrain.heatmapVerts,
    terrainHeatmapColors: terrain.heatmapColors,
    terrainSlopeVerts: terrain.slopeVerts,
    terrainSlopeColors: terrain.slopeColors,
    stats: `${districts.length} districts · ${buildingBoxes.length} structures · ${roads.length} road segments · ${terrain.diagnostics.terraceLevels} terrain levels · seeded ${seed}`,
    diagnostics: {
      chunks: terrain.diagnostics.chunkCount,
      worker: typeof Worker !== "undefined",
      heightfield: "terraced",
      blackwall: true,
      density: buildingBoxes.length,
      terrain: terrain.diagnostics,
      cityCenter: {
        roads: cityCenter.roads,
        blocks: cityCenter.blocks.length,
        lots: cityCenter.lots.length,
        buildings: cityCenter.buildings,
        terraceY: cityCenter.terraceY,
      },
    },
  };
}
