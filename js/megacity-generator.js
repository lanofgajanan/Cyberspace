import { resetSeed, randRange } from "./rng.js";
import { pushSegment, pushLoop } from "./geometry.js";

// Positions are authored rather than laid out from a generic grid. The
// west-to-east progression gives the city a readable social/topographic axis.
const DISTRICT_PROFILES = {
  citadel: { label: "Citadel / civic", height: [42, 92], width: [14, 24], accent: 0x4fd1ff, density: 1.15 },
  archive: { label: "Archive / data", height: [54, 118], width: [12, 20], accent: 0xc27dff, density: 1.05 },
  aerium: { label: "Aerium / transit", height: [30, 76], width: [13, 22], accent: 0x68f5d0, density: 1.1 },
  foundry: { label: "Foundry / industrial", height: [18, 58], width: [14, 28], accent: 0xff704d, density: 1.2 },
  market: { label: "Market / mixed use", height: [10, 38], width: [11, 22], accent: 0xffb84f, density: 1.3 },
  commons: { label: "Commons / residential", height: [8, 30], width: [10, 20], accent: 0x8ee58b, density: 1.4 },
  lowline: { label: "Lowline / floodplain", height: [6, 22], width: [9, 18], accent: 0x52b5ff, density: 1.5 },
  sprawl: { label: "Sprawl / edge works", height: [5, 18], width: [8, 16], accent: 0xf28cff, density: 1.55 },
  quarry: { label: "Quarry / extraction", height: [12, 42], width: [12, 24], accent: 0xffdf63, density: 1.25 },
  blackwall: { label: "Blackwall / frontier", height: [8, 28], width: [9, 19], accent: 0xff4057, density: 1.35 },
};

const DISTRICTS = [
  { id: "lowline", x: -300, z: 112, profile: "lowline", cols: 8, rows: 6, rot: -0.08 },
  { id: "sprawl", x: -240, z: -96, profile: "sprawl", cols: 8, rows: 7, rot: 0.12 },
  { id: "commons", x: -138, z: 118, profile: "commons", cols: 8, rows: 7, rot: -0.18 },
  { id: "market", x: -72, z: -84, profile: "market", cols: 8, rows: 8, rot: 0.22 },
  { id: "foundry", x: 30, z: 128, profile: "foundry", cols: 8, rows: 7, rot: -0.08 },
  { id: "quarry", x: 108, z: -112, profile: "quarry", cols: 7, rows: 7, rot: 0.16 },
  { id: "archive", x: 168, z: 80, profile: "archive", cols: 7, rows: 7, rot: -0.16 },
  { id: "aerium", x: 224, z: -18, profile: "aerium", cols: 8, rows: 7, rot: 0.1 },
  { id: "citadel", x: 276, z: 148, profile: "citadel", cols: 7, rows: 7, rot: -0.1 },
  { id: "blackwall", x: 300, z: -142, profile: "blackwall", cols: 8, rows: 6, rot: 0.2 },
];

const CITY_RADIUS = 430;

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

// The rich/east side climbs into a mountain shelf; the poorer west side
// remains broad and low so the terrain reads as an intentional gradient.
function heightAt(x, z) {
  const rich = smoothstep((x + 80) / 510);
  const ridge = Math.max(0, Math.sin((z + 28) * 0.026)) * smoothstep((x - 80) / 330);
  const shelf = Math.floor((rich * 7 + ridge * 2) * 2) / 2;
  return Math.round((shelf * 4 + Math.sin(x * 0.018) * 1.1 + Math.cos(z * 0.024) * 0.9) * 2) / 2;
}

export function generateMegacity(seed = 4242) {
  resetSeed(seed);
  const buildingBoxes = [], edgeVerts = [], windowVerts = [], accentVerts = [];
  const groundVerts = [], centerlineVerts = [], trafficVerts = [], blackwallVerts = [];
  const districtAccentLayers = [];
  const shelves = [], connectors = [], stairs = [], districts = [];

  // Irregular contour shelves are cheap merged line geometry, but give the
  // heightfield enough depth cues to read at the city-wide camera distance.
  for (let level = 0; level < 10; level++) {
    const radius = CITY_RADIUS - level * 34;
    const y = level * 3.5;
    shelves.push({ level, radius, y });
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      pts.push([x, z]);
    }
    pushLoop(groundVerts, pts, y);
  }

  function addBox(x, baseY, z, w, h, d, rot, style) {
    const b = { x, cy: baseY + h / 2, z, w, h, d, ry: rot, c: Math.cos(rot), s: Math.sin(rot), style };
    buildingBoxes.push(b);
    const corners = [];
    for (let i = 0; i < 8; i++) {
      const lx = (i & 1 ? 1 : -1) * w / 2, ly = (i & 2 ? 1 : -1) * h / 2, lz = (i & 4 ? 1 : -1) * d / 2;
      corners.push([x + lx * b.c + lz * b.s, b.cy + ly, z - lx * b.s + lz * b.c]);
    }
    for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) if (!(i & (1 << k))) {
      const a = corners[i], q = corners[i | (1 << k)];
      pushSegment(edgeVerts, a[0], a[1], a[2], q[0], q[1], q[2]);
    }
    // A restrained facade cross is enough to distinguish profiles without
    // multiplying meshes or draw calls.
    if (h > 24) {
      const y0 = baseY + Math.min(h * 0.32, 18), y1 = baseY + h * 0.78;
      pushSegment(windowVerts, x - w * 0.34, y0, z - d / 2 - 0.1, x + w * 0.34, y0, z - d / 2 - 0.1);
      pushSegment(windowVerts, x, y0, z - d / 2 - 0.1, x, y1, z - d / 2 - 0.1);
    }
  }

  DISTRICTS.forEach((spec, districtIndex) => {
    const profile = DISTRICT_PROFILES[spec.profile];
    const baseY = heightAt(spec.x, spec.z);
    const accentLayer = [];
    const district = {
      id: spec.id, profile: spec.profile, label: profile.label, x: spec.x, z: spec.z,
      baseY, accent: profile.accent, area: { width: 104, depth: 92 },
    };
    districts.push(district);
    districtAccentLayers.push({ verts: accentLayer, color: profile.accent });

    for (let row = 0; row < spec.rows; row++) {
      for (let col = 0; col < spec.cols; col++) {
        const u = (col - (spec.cols - 1) / 2) * 13;
        const v = (row - (spec.rows - 1) / 2) * 13;
        const x = spec.x + u * Math.cos(spec.rot) - v * Math.sin(spec.rot) + randRange(-2.8, 2.8);
        const z = spec.z + u * Math.sin(spec.rot) + v * Math.cos(spec.rot) + randRange(-2.8, 2.8);
        const h = randRange(profile.height[0], profile.height[1]) * (1 + (col === Math.floor(spec.cols / 2) && row === Math.floor(spec.rows / 2) ? 0.25 : 0));
        addBox(x, baseY + heightAt(x, z) - baseY, z, randRange(profile.width[0], profile.width[1]), h, randRange(profile.width[0], profile.width[1]), spec.rot + randRange(-0.1, 0.1), spec.profile);
      }
    }

    const halfW = 59, halfD = 52;
    pushLoop(groundVerts, [[spec.x - halfW, spec.z - halfD], [spec.x + halfW, spec.z - halfD], [spec.x + halfW, spec.z + halfD], [spec.x - halfW, spec.z + halfD]], baseY + 0.15);
    for (let i = -2; i <= 2; i++) {
      const offset = i * 20;
      const ax = spec.x - halfW, az = spec.z + offset;
      const bx = spec.x + halfW, bz = spec.z + offset;
      pushSegment(groundVerts, ax, baseY + 0.22, az, bx, baseY + 0.22, bz);
      pushSegment(trafficVerts, ax, baseY + 0.28, az, bx, baseY + 0.28, bz);
      pushSegment(centerlineVerts, ax, baseY + 0.3, az, bx, baseY + 0.3, bz);
    }
    for (let i = -2; i <= 2; i++) {
      const offset = i * 20;
      pushSegment(groundVerts, spec.x + offset, baseY + 0.22, spec.z - halfD, spec.x + offset, baseY + 0.22, spec.z + halfD);
    }
    // Profile-colored district marker and central civic axis.
    pushLoop(accentLayer, [[spec.x - 42, spec.z - 35], [spec.x + 42, spec.z - 35], [spec.x + 42, spec.z + 35], [spec.x - 42, spec.z + 35]], baseY + 0.42);
    pushSegment(accentLayer, spec.x - 38, baseY + 0.45, spec.z, spec.x + 38, baseY + 0.45, spec.z);
  });

  // Three-dimensional links between authored neighborhoods: each has a
  // walkable stair run, a switchback road, and a bright route marker.
  for (let i = 0; i < DISTRICTS.length - 1; i++) {
    const a = DISTRICTS[i], b = DISTRICTS[i + 1];
    const ay = heightAt(a.x, a.z) + 0.6, by = heightAt(b.x, b.z) + 0.6;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
    const points = [];
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      const offset = step % 2 ? 10 : -10;
      points.push([a.x + dx * t + nx * offset, ay + (by - ay) * t, a.z + dz * t + nz * offset]);
      if (step) {
        const p = points[step - 1], q = points[step];
        pushSegment(groundVerts, p[0], p[1], p[2], q[0], q[1], q[2]);
        pushSegment(accentVerts, p[0] - nx * 2, p[1] + 0.5, p[2] - nz * 2, q[0] - nx * 2, q[1] + 0.5, q[2] - nz * 2);
      }
    }
    connectors.push({ from: a.id, to: b.id, points });
    const stairCount = Math.max(4, Math.ceil(Math.abs(by - ay) / 1.5));
    for (let stair = 0; stair < stairCount; stair++) {
      const t = (stair + 1) / (stairCount + 1);
      const x = a.x + dx * t, z = a.z + dz * t, y = ay + (by - ay) * t;
      pushSegment(groundVerts, x - nx * 4, y, z - nz * 4, x + nx * 4, y, z + nz * 4);
    }
    stairs.push({ from: a.id, to: b.id, count: stairCount });
  }

  // Preserve the high contrast playable boundary as a red vertical wall.
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2, b = ((i + 1) / 96) * Math.PI * 2;
    pushSegment(blackwallVerts, Math.cos(a) * (CITY_RADIUS - 8), 2, Math.sin(a) * (CITY_RADIUS - 8), Math.cos(b) * (CITY_RADIUS - 8), 2, Math.sin(b) * (CITY_RADIUS - 8));
    if (i % 2 === 0) pushSegment(blackwallVerts, Math.cos(a) * (CITY_RADIUS - 8), 2, Math.sin(a) * (CITY_RADIUS - 8), Math.cos(a) * (CITY_RADIUS - 8), 62, Math.sin(a) * (CITY_RADIUS - 8));
  }

  const roadCount = trafficVerts.length / 6;
  return {
    buildingBoxes, edgeVerts, windowVerts, accentVerts, districtAccentLayers, groundVerts,
    centerlineVerts, trafficVerts, blackwallVerts, districts, shelves, connectors, stairs,
    CITY_RADIUS, seed, profiles: DISTRICT_PROFILES,
    stats: `${districts.length} districts · ${buildingBoxes.length} structures · ${roadCount} road segments · ${shelves.length} terrain shelves · seeded ${seed}`,
    diagnostics: {
      chunks: 1, worker: typeof Worker !== "undefined", heightfield: "rich-east mountain / poor-west taper",
      blackwall: true, connectors: connectors.length, stairs: stairs.reduce((sum, item) => sum + item.count, 0),
    },
  };
}
