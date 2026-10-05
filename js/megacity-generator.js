import { resetSeed, nextRandom, randRange } from "./rng.js";
import { pushSegment, pushLoop } from "./geometry.js";

const PROFILES = {
  spine: { label: "Spine / civic", height: [18, 46], accent: 0x4fd1ff },
  market: { label: "Market / mixed use", height: [8, 24], accent: 0xffb84f },
  archive: { label: "Archive / data", height: [28, 70], accent: 0xc27dff },
};

function heightAt(x, z, size) {
  const edge = Math.max(0, 1 - Math.hypot(x, z) / size);
  return Math.round((edge * 5 + Math.sin(x * 0.04) * 1.4 + Math.cos(z * 0.035) * 1.2) * 2) / 2;
}

export function generateMegacity(seed = 4242) {
  resetSeed(seed);
  const size = 150;
  const buildingBoxes = [], edgeVerts = [], windowVerts = [], accentVerts = [], groundVerts = [], centerlineVerts = [];
  const trafficVerts = [];
  const shelves = [];
  const districts = [];

  // Seeded terraces make the heightfield visible without introducing a second
  // terrain renderer: each shelf is a closed neon contour.
  for (let level = 0; level < 5; level++) {
    const radius = size - level * 24;
    const y = level * 4;
    const pts = [];
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      pts.push([Math.cos(a) * radius, Math.sin(a) * radius, y]);
    }
    shelves.push({ level, radius, y });
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      pushSegment(groundVerts, a[0], a[2], a[1], b[0], b[2], b[1]);
    }
  }

  function addBox(x, baseY, z, w, h, d, rot = 0) {
    const b = { x, cy: baseY + h / 2, z, w, h, d, ry: rot, c: Math.cos(rot), s: Math.sin(rot) };
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
    return b;
  }

  const districtNames = Object.keys(PROFILES);
  districtNames.forEach((profileName, districtIndex) => {
    const profile = PROFILES[profileName];
    const cx = (districtIndex - 1) * 78;
    const cz = districtIndex === 1 ? 8 : -8;
    const baseY = heightAt(cx, cz, size);
    const district = { id: profileName, profile: profileName, label: profile.label, x: cx, z: cz, baseY };
    districts.push(district);
    for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
      const x = cx + col * 19 + randRange(-2, 2), z = cz + row * 19 + randRange(-2, 2);
      const h = randRange(profile.height[0], profile.height[1]) + (col === 0 && row === 0 ? 14 : 0);
      addBox(x, baseY, z, randRange(10, 15), h, randRange(10, 15), randRange(-0.08, 0.08));
    }
    pushLoop(groundVerts, [[cx - 34, cz - 34], [cx + 34, cz - 34], [cx + 34, cz + 34], [cx - 34, cz + 34]], baseY + 0.1);
    // Road loop and a marked civic spine for the district.
    const road = [[cx - 40, cz - 40], [cx + 40, cz - 40], [cx + 40, cz + 40], [cx - 40, cz + 40]];
    for (let i = 0; i < road.length; i++) {
      const a = road[i], b = road[(i + 1) % road.length];
      pushSegment(groundVerts, a[0], baseY + 0.15, a[1], b[0], baseY + 0.15, b[1]);
      pushSegment(trafficVerts, a[0], baseY + 0.22, a[1], b[0], baseY + 0.22, b[1]);
    }
    pushSegment(centerlineVerts, cx - 40, baseY + 0.2, cz, cx + 40, baseY + 0.2, cz);
  });

  // Switchback connector between the three terraces, plus stairs.
  const connector = [];
  for (let i = 0; i < 7; i++) {
    const x = -34 + i * 11;
    const z = -62 + (i % 2) * 22;
    connector.push([x, z]);
    if (i) pushSegment(groundVerts, connector[i - 1][0], i * 2 + 0.3, connector[i - 1][1], x, i * 2 + 0.3, z);
    pushSegment(accentVerts, x - 3, i * 2 + 0.4, z, x + 3, i * 2 + 0.4, z);
  }

  // A high-contrast red Blackwall boundary around the playable slice.
  const blackwallVerts = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, b = (i + 1) / 48 * Math.PI * 2;
    pushSegment(blackwallVerts, Math.cos(a) * 142, 2, Math.sin(a) * 142, Math.cos(b) * 142, 2, Math.sin(b) * 142);
    pushSegment(blackwallVerts, Math.cos(a) * 142, 2, Math.sin(a) * 142, Math.cos(a) * 142, 48, Math.sin(a) * 142);
  }

  return {
    buildingBoxes, edgeVerts, windowVerts, accentVerts, groundVerts, centerlineVerts, trafficVerts, blackwallVerts,
    districts, shelves, connector, CITY_RADIUS: size, seed,
    profiles: PROFILES,
    stats: `${districts.length} districts · ${buildingBoxes.length} structures · ${shelves.length} terraces · seeded ${seed}`,
    diagnostics: { chunks: 1, worker: typeof Worker !== "undefined", heightfield: "seeded", blackwall: true },
  };
}
