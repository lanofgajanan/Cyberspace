import { resetSeed, nextRandom, randRange } from "./rng.js";
import { pushSegment, pushLoop } from "./geometry.js";
import { createTerrain } from "./terrain.js";

// This module deliberately produces renderer-neutral data. scene-builder.js
// turns the solids into one InstancedMesh and the line arrays into merged
// batches, so the city can be dense without multiplying draw calls.
const DISTRICT_PROFILES = [
  { id: "watson", label: "Watson / stacked markets", kind: "market", accent: 0xffb84f, height: [8, 34] },
  { id: "westbrook", label: "Westbrook / corporate spine", kind: "corporate", accent: 0x4fd1ff, height: [28, 86] },
  { id: "heywood", label: "Heywood / residential terraces", kind: "residential", accent: 0x69e0c0, height: [8, 42] },
  { id: "santo-domingo", label: "Santo Domingo / industrial", kind: "industrial", accent: 0xff6c4f, height: [12, 55] },
  { id: "pacifica", label: "Pacifica / flooded arcology", kind: "pacifica", accent: 0x5bd8ff, height: [18, 68] },
  { id: "dogtown", label: "Dogtown / fortified sprawl", kind: "dogtown", accent: 0xff405f, height: [6, 32] },
  { id: "city-center", label: "City Center / megatowers", kind: "tower", accent: 0xc27dff, height: [55, 150] },
  { id: "badlands", label: "Badlands / solar yards", kind: "badlands", accent: 0xffd15b, height: [4, 22] },
  { id: "arroyo", label: "Arroyo / transit works", kind: "transit", accent: 0x7da8ff, height: [16, 64] },
  { id: "kabuki", label: "Kabuki / neon bazaar", kind: "bazaar", accent: 0xff65dcff, height: [10, 48] },
];

const TAU = Math.PI * 2;
const CITY_RADIUS = 360;
const DISTRICT_RADIUS = 215;

export function generateMegacity(seed = 4242) {
  resetSeed(seed);
  const terrain = createTerrain(seed);
  const buildingBoxes = [], edgeVerts = [], windowVerts = [], accentVerts = [];
  const groundVerts = [], centerlineVerts = [], trafficVerts = [], blackwallVerts = [];
  const districts = [], shelves = [], roads = [];
  const districtCenters = [];

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
  // Arterials, district cross streets, and a transit ring. The central
  // district owns the inner 125m, so the citywide spokes stop at its
  // transition ring instead of cutting through its civic core.
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    addRoad([Math.cos(a) * 126, Math.sin(a) * 126], [Math.cos(a) * CITY_RADIUS, Math.sin(a) * CITY_RADIUS], i % 4 === 0 ? 11 : 6);
  }
  const ringRadius = 145;
  for (let i = 0; i < 128; i++) {
    const a = i / 128 * TAU, b = (i + 1) / 128 * TAU;
    addRoad([Math.cos(a) * ringRadius, Math.sin(a) * ringRadius], [Math.cos(b) * ringRadius, Math.sin(b) * ringRadius], 9);
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

  DISTRICT_PROFILES.forEach((profile, districtIndex) => {
    const a = districtIndex / DISTRICT_PROFILES.length * TAU + 0.12;
    const cx = profile.id === "city-center" ? 0 : Math.cos(a) * DISTRICT_RADIUS;
    const cz = profile.id === "city-center" ? 0 : Math.sin(a) * DISTRICT_RADIUS;
    const y = terrainY(cx, cz);
    districtCenters.push([cx, cz]);
    const district = { id: profile.id, label: profile.label, profile: profile.kind, x: cx, z: cz, baseY: y, accent: profile.accent };
    districts.push(district);
    if (profile.id === "city-center") {
      buildCityCenter();
      district.cityCenter = cityCenter;
      return;
    }
    // Dense 18x18 lots: each lot has a main solid plus profile-specific
    // roofs, machinery, antennas, or terraces, yielding ~5k-10k instances.
    const grid = 18, pitch = 7.2;
    for (let row = 0; row < grid; row++) for (let col = 0; col < grid; col++) {
      const lx = (col - (grid - 1) / 2) * pitch + randRange(-0.7, 0.7);
      const lz = (row - (grid - 1) / 2) * pitch + randRange(-0.7, 0.7);
      if (profile.kind === "badlands" && (row + col) % 4 === 0) {
        addBox(cx + lx, y, cz + lz, 5, randRange(2, 6), 5, 0, false);
        line(accentVerts, [cx + lx - 2, y + 0.2, cz + lz], [cx + lx + 2, y + 0.2, cz + lz]);
      } else addLot(cx + lx, cz + lz, y, profile, row, col);
    }
    // Every district has a recognizable civic feature rather than being a
    // generic radial cluster.
    if (profile.kind === "residential" || profile.kind === "badlands") addPark(cx, cz, y, profile);
    if (profile.kind === "dogtown") {
      pushLoop(accentVerts, [[cx - 55, cz - 50], [cx + 55, cz - 50], [cx + 55, cz + 50], [cx - 55, cz + 50]], y + 5);
      for (let p = -45; p <= 45; p += 15) addBox(cx + p, y, cz - 53, 2, randRange(8, 18), 2, 0, false);
    }
    if (profile.kind === "industrial") {
      for (let p = -34; p <= 34; p += 17) {
        addBox(cx + p, y, cz + 38, 2, 24, 2, 0, false);
        line(accentVerts, [cx + p, y + 20, cz + 38], [cx + p + 14, y + 20, cz + 38]);
      }
    }
    if (profile.kind === "pacifica") {
      pushLoop(groundVerts, [[cx - 58, cz - 54], [cx + 58, cz - 54], [cx + 58, cz + 54], [cx - 58, cz + 54]], y + 0.3);
      for (let p = -45; p <= 45; p += 15) addRoad([cx + p, cz - 48], [cx + p, cz + 48], 4, false);
    }
    // Local blocks/roads are deliberately drawn after placement so they read
    // as lots and lanes instead of a single large empty district.
    for (let p = -54; p <= 54; p += 18) {
      addRoad([cx - 58, cz + p], [cx + 58, cz + p], 3, false);
      addRoad([cx + p, cz - 58], [cx + p, cz + 58], 3, false);
    }
  });

  // Elevated decks and switchback connectors tie the shelves together.
  const connector = [];
  for (let i = 0; i < 11; i++) {
    const x = -315 + i * 63, z = -65 + (i % 2) * 56, y = terrainY(x, z) + 5 + i * 0.4;
    connector.push([x, y, z]);
    if (i) line(groundVerts, connector[i - 1], [x, y, z]);
    line(accentVerts, [x - 10, y + 0.4, z], [x + 10, y + 0.4, z]);
    addBox(x, y, z, 1.1, 1.1, 20, 0, false);
  }
  districtCenters.forEach(([x, z], i) => {
    const next = districtCenters[(i + 1) % districtCenters.length];
    line(accentVerts, [x, terrainY(x, z) + 32, z], [next[0], terrainY(next[0], next[1]) + 32, next[1]]);
  });

  for (let i = 0; i < 72; i++) {
    const a = i / 72 * TAU, b = (i + 1) / 72 * TAU, r = CITY_RADIUS + 3;
    line(blackwallVerts, [Math.cos(a) * r, 2, Math.sin(a) * r], [Math.cos(b) * r, 2, Math.sin(b) * r]);
    if (i % 2 === 0) line(blackwallVerts, [Math.cos(a) * r, 2, Math.sin(a) * r], [Math.cos(a) * r, 62, Math.sin(a) * r]);
  }
  return {
    buildingBoxes, edgeVerts, windowVerts, accentVerts, groundVerts, centerlineVerts, trafficVerts, blackwallVerts,
    terrain, districts, shelves, connector, roads, CITY_RADIUS, seed, profiles: DISTRICT_PROFILES,
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
