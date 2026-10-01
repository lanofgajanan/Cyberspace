import { nextRandom, randRange } from "./rng.js";
import { currentFrame, setFrame, frameX, frameZ } from "./frame.js";
import { createSpatialHash } from "./spatial-hash.js";
import {
  pushSegment,
  pushLoop,
  rectCorners,
  localPoint,
  facePoint,
  addFrameSegment,
  addFrameLoop,
} from "./geometry.js";

// ==========================================================================
// This is the single largest module because road growth, block placement,
// and building generation are all genuinely interdependent: buildings need
// to know where roads are (to avoid overlapping them and to orient toward
// them), park/hospital "sites" need to be reserved BEFORE roads grow so
// roads route around them, and almost everything shares the same spatial
// hashes and the same local coordinate frame. Splitting these further
// would mean passing the same half-dozen pieces of shared state through
// every function boundary for little real readability gain.
//
// generateCity() returns one plain object containing every collected
// array (buildingBoxes, edgeVerts, windowVerts, accentVerts, groundVerts,
// centerlineVerts), plus roadList/orgSites/typeCounts/stats — nothing is
// touched by Three.js in here at all. Turning this data into actual GPU
// objects is scene-builder.js's job, not this module's.
// ==========================================================================

export function generateCity() {
  const buildingBoxes = [];
  const edgeVerts = [];
  const windowVerts = [];
  const accentVerts = [];
  const groundVerts = [];
  const centerlineVerts = [];

  const buildingHash = createSpatialHash(); // building footprints

  function addBox(x, y0, z, w, h, d, ry, win) {
    const X = frameX(x, z);
    const Z = frameZ(x, z);
    const b = { x: X, cy: y0 + h / 2, z: Z, w, h, d, ry: (ry || 0) + currentFrame.r };
    b.c = Math.cos(b.ry);
    b.s = Math.sin(b.ry);
    buildingBoxes.push(b);
    if (win !== false) buildingHash.put(X, Z, 0, 0, Math.hypot(w, d) / 2);

    const cs = [];
    for (let i = 0; i < 8; i++) {
      cs.push(localPoint(b, (i & 1 ? 1 : -1) * w / 2, (i & 2 ? 1 : -1) * h / 2, (i & 4 ? 1 : -1) * d / 2));
    }
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < 3; k++) {
        const bit = 1 << k;
        if (!(i & bit)) {
          pushSegment(edgeVerts, cs[i][0], cs[i][1], cs[i][2], cs[i | bit][0], cs[i | bit][1], cs[i | bit][2]);
        }
      }
    }
    if (win !== false && h > 3) addWindows(b);
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
      let p, q;
      for (let i = 0; i <= cols; i++) {
        const u = -L / 2 + m + (L - 2 * m) * i / cols;
        p = facePoint(b, f, u, yb, n);
        q = facePoint(b, f, u, yt, n);
        pushSegment(windowVerts, p[0], p[1], p[2], q[0], q[1], q[2]);
      }
      for (let i = 0; i <= rows; i++) {
        const y = yb + (yt - yb) * i / rows;
        p = facePoint(b, f, -L / 2 + m, y, n);
        q = facePoint(b, f, L / 2 - m, y, n);
        pushSegment(windowVerts, p[0], p[1], p[2], q[0], q[1], q[2]);
      }
    }
  }

  function addBillboard(x, y, z, ry) {
    const pw = randRange(3, 4.4);
    const ph = pw * 0.44;
    addBox(x + Math.cos(ry) * pw * 0.35, y, z - Math.sin(ry) * pw * 0.35, 0.14, 1.3, 0.14, 0, false);
    addBox(x - Math.cos(ry) * pw * 0.35, y, z + Math.sin(ry) * pw * 0.35, 0.14, 1.3, 0.14, 0, false);
    addBox(x, y + 1.3, z, pw, ph, 0.16, ry, false);
  }

  // ---------- block layout constants ----------
  const BLOCK_SIZE = 34; // block footprint
  const STREET_WIDTH = 10; // road width between blocks
  const BLOCK_PITCH = BLOCK_SIZE + STREET_WIDTH;

  // ---------- building types ----------
  const BUILDING_TYPES = {
    residential: { build: (cx, cz, dens) => subdivide(cx, cz, dens, false) },
    downtown: { build: (cx, cz, dens) => subdivide(cx, cz, dens, true) },
    hospital: {
      build(cx, cz) {
        addBox(cx, 0, cz + 6, 26, 6, 12, 0); // low base
        addBox(cx - 5, 0, cz - 6, 14, 22, 12, 0); // main wing
        addBox(cx + 8, 0, cz - 6, 8, 14, 10, 0); // side wing
        // entrance canopy: slab on four posts
        addBox(cx, 3.2, cz + 14.5, 8, 0.3, 5, 0, false);
        [[-3.7, 12.2], [3.7, 12.2], [-3.7, 16.8], [3.7, 16.8]].forEach((p) => {
          addBox(cx + p[0], 0, cz + p[1], 0.3, 3.2, 0.3, 0, false);
        });
        // roof cross on the main wing
        const a = 3.2, t = 1.1, ox = cx - 5, oz = cz - 6, y = 22.06;
        addFrameLoop(
          accentVerts,
          [[-t, -a], [t, -a], [t, -t], [a, -t], [a, t], [t, t], [t, a], [-t, a], [-t, t], [-a, t], [-a, -t], [-t, -t]]
            .map((p) => [ox + p[0], oz + p[1]]),
          y
        );
        // helipad on the base roof: square, ring, H
        const hx = cx + 7, hz = cz + 6, hy = 6.06;
        addFrameLoop(accentVerts, rectCorners(hx, hz, 7, 7), hy);
        const ring = [];
        for (let i = 0; i < 20; i++) ring.push([hx + Math.cos((i / 20) * 6.2832) * 2.8, hz + Math.sin((i / 20) * 6.2832) * 2.8]);
        addFrameLoop(accentVerts, ring, hy);
        addFrameSegment(accentVerts, hx - 1, hy, hz - 1.3, hx - 1, hy, hz + 1.3);
        addFrameSegment(accentVerts, hx + 1, hy, hz - 1.3, hx + 1, hy, hz + 1.3);
        addFrameSegment(accentVerts, hx - 1, hy, hz, hx + 1, hy, hz);
        addFrameLoop(groundVerts, rectCorners(cx, cz, BLOCK_SIZE - 4, BLOCK_SIZE - 4), 0.02); // fence
      },
    },
    park: {
      build(cx, cz) {
        addFrameLoop(groundVerts, rectCorners(cx, cz, 24, 20), 0.02); // path ring
        [[0, 17], [0, -17]].forEach((p) => addFrameSegment(groundVerts, cx, 0.02, cz + p[1], cx, 0.02, cz + p[1] * 0.59));
        [[17, 0], [-17, 0]].forEach((p) => addFrameSegment(groundVerts, cx + p[0], 0.02, cz, cx + p[0] * 0.71, 0.02, cz));
        addFrameLoop(groundVerts, rectCorners(cx, cz, 13, 9), 0.02); // pond + ripples
        addFrameLoop(groundVerts, rectCorners(cx, cz, 9, 5.5), 0.02);
        addFrameLoop(groundVerts, rectCorners(cx, cz, 5, 2.4), 0.02);
        for (let i = 0; i < 34; i++) {
          const x = randRange(-15.5, 15.5), z = randRange(-15.5, 15.5);
          if (Math.abs(x) < 8 && Math.abs(z) < 6) continue; // keep pond clear
          if (Math.abs(x) < 1.2 || Math.abs(z) < 1.2) continue; // keep spokes clear
          const th = randRange(1.2, 2.2);
          addBox(cx + x, 0, cz + z, 0.35, th, 0.35, 0, false);
          const cw = randRange(1.5, 2.4);
          addBox(cx + x, th, cz + z, cw, cw * 1.15, cw, randRange(0, 1.57), false);
        }
      },
    },
  };

  function subdivide(cx, cz, dens, tall) {
    let nx = 2 + Math.floor(nextRandom() * 2.5);
    let nz = 2 + Math.floor(nextRandom() * 2.5);
    if (tall) {
      nx = 1 + Math.floor(nextRandom() * 2.2);
      nz = 1 + Math.floor(nextRandom() * 2.2);
    }
    const lw = BLOCK_SIZE / nx, ld = BLOCK_SIZE / nz;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const w = (lw - 1.4) * randRange(0.72, 1);
        const d = (ld - 1.4) * randRange(0.72, 1);
        const x = cx - BLOCK_SIZE / 2 + lw * (i + 0.5);
        const z = cz - BLOCK_SIZE / 2 + ld * (j + 0.5);
        const h = randRange(5, 12) + dens * dens * randRange(8, tall ? 85 : 45);
        if (h > 20 && nextRandom() < 0.6) {
          // stepped tower
          const h1 = h * randRange(0.55, 0.7);
          addBox(x, 0, z, w, h1, d, 0);
          addBox(x, h1, z, w * 0.66, h - h1, d * 0.66, 0);
        } else {
          addBox(x, 0, z, w, h, d, 0);
        }
        if (h > 46) addBox(x, h, z, 0.3, randRange(6, 12), 0.3, 0, false); // antenna
        else if (h > 8 && nextRandom() < 0.22) {
          addBillboard(x, h, z, Math.floor(nextRandom() * 4) * 1.5708 + randRange(-0.35, 0.35));
        }
      }
    }
  }

  // ---------- roads: planned grid downtown, organic sprawl outside ----------
  const DOWNTOWN_ROTATION = 0.22, RING_RADIUS_BASE = 170, CITY_RADIUS = 330, MAX_ROADS = 420;
  function ringRadiusAt(a) {
    return RING_RADIUS_BASE + 8 * Math.sin(3 * a) + 5 * Math.sin(5 * a + 1);
  }
  const roadList = [];
  const roadHash = createSpatialHash();
  const allRoadPoints = [];
  const culDeSacs = [];

  function registerRoad(pts, w, tag) {
    const id = roadList.length;
    const dense = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * (k / n);
        const z = a[1] + (b[1] - a[1]) * (k / n);
        dense.push([x, z]);
        roadHash.put(x, z, id, 0, 0);
        allRoadPoints.push([x, z]);
      }
    }
    roadList.push({ pts, dense, w, tag });
    return id;
  }

  // Reserve organic sites (1 hospital campus, 4 parks) BEFORE roads grow,
  // so road growth routes around them instead of cutting through.
  const orgSites = [];
  ["hospital", "park", "park", "park", "park"].forEach((type) => {
    for (let t = 0; t < 80; t++) {
      const a = randRange(0, 6.283), d = randRange(220, 300);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      let ok = true;
      orgSites.forEach((s) => { if (Math.hypot(s.x - x, s.z - z) < 80) ok = false; });
      if (!ok) continue;
      orgSites.push({ type, x, z, r: 24, rot: randRange(0, 6.283) });
      for (let k = 0; k < 12; k++) {
        roadHash.put(x + Math.cos(k * 0.5236) * 12, z + Math.sin(k * 0.5236) * 12, -1, 0, 0);
      }
      break;
    }
  });
  function isInSite(x, z) {
    return orgSites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 2);
  }

  // 1) planned downtown: slightly rotated orthogonal grid, clipped by a wobbly ring road
  setFrame(0, 0, DOWNTOWN_ROTATION);
  for (let gk = -4; gk <= 3; gk++) {
    const gc = (gk + 0.5) * BLOCK_PITCH;
    for (let go = 0; go < 2; go++) {
      const ends = [0, 0];
      [1, -1].forEach((sg, si) => {
        for (let t = 0; t < 400; t += 2) {
          const lx = go ? gc : t * sg, lz = go ? t * sg : gc;
          const wx = frameX(lx, lz), wz = frameZ(lx, lz);
          if (Math.hypot(wx, wz) > ringRadiusAt(Math.atan2(wz, wx))) { ends[si] = t * sg; break; }
        }
      });
      const u0 = ends[1], u1 = ends[0];
      const q0 = go ? [gc, u0] : [u0, gc];
      const q1 = go ? [gc, u1] : [u1, gc];
      registerRoad([[frameX(q0[0], q0[1]), frameZ(q0[0], q0[1])], [frameX(q1[0], q1[1]), frameZ(q1[0], q1[1])]], 8, "grid");
    }
  }
  setFrame(0, 0, 0);
  const ring = [];
  for (let ri = 0; ri <= 96; ri++) {
    const ra = (ri / 96) * 6.2832;
    ring.push([Math.cos(ra) * ringRadiusAt(ra), Math.sin(ra) * ringRadiusAt(ra)]);
  }
  const ringId = registerRoad(ring, 10, "ring");

  // 2) organic streets: wandering streamlines that branch and die near other roads
  const growthQueue = [];
  for (let si = 0; si < 16; si++) {
    const sa = (si / 16) * 6.283 + randRange(-0.2, 0.2);
    growthQueue.push({ x: Math.cos(sa) * ringRadiusAt(sa), z: Math.sin(sa) * ringRadiusAt(sa), h: sa, life: randRange(110, 190) | 0, parent: ringId });
  }
  function addCulDeSac(x, z, h) {
    const cx = x + Math.cos(h) * 7, cz = z + Math.sin(h) * 7;
    const pts = [];
    for (let k = 0; k < 14; k++) {
      const px = cx + Math.cos((k / 14) * 6.283) * 7, pz = cz + Math.sin((k / 14) * 6.283) * 7;
      pts.push([px, pz]);
      if (k % 2 === 0) roadHash.put(px, pz, -2, 0, 0);
    }
    culDeSacs.push(pts);
  }
  function growStreet(s) {
    const pts = [[s.x, s.z]];
    const id = roadList.length;
    let turn = 0;
    let cd = randRange(8, 20);
    let hit = false;
    roadList.push({ pts, dense: pts, w: 8, tag: "org" });
    for (let i = 0; i < s.life; i++) {
      turn = Math.max(-0.09, Math.min(0.09, turn * 0.92 + (nextRandom() - 0.5) * 0.05));
      s.h += turn;
      const nx = s.x + Math.cos(s.h) * 4, nz = s.z + Math.sin(s.h) * 4;
      if (Math.hypot(nx, nz) > CITY_RADIUS) break;
      const d = roadHash.near(nx, nz, 20, (p) => (p.id === id && i - p.i < 14) || (i < 10 && (p.id === s.parent || (s.parent === ringId && p.id <= ringId))));
      if (d < 15) { hit = true; break; }
      s.x = nx; s.z = nz;
      pts.push([nx, nz]);
      roadHash.put(nx, nz, id, i, 0);
      allRoadPoints.push([nx, nz]);
      if (--cd < 0 && roadList.length < MAX_ROADS) {
        cd = randRange(7, 18);
        growthQueue.push({ x: nx, z: nz, h: s.h + (nextRandom() < 0.5 ? 1 : -1) * randRange(1.1, 1.9), life: randRange(45, 130) | 0, parent: id });
      }
    }
    if (!hit && pts.length > 4 && nextRandom() < 0.6) addCulDeSac(s.x, s.z, s.h);
  }
  for (let qi = 0; qi < growthQueue.length; qi++) growStreet(growthQueue[qi]);

  // 3) short access spur from the nearest road to every organic site
  orgSites.forEach((s) => {
    let best = 1e9, bp = null;
    allRoadPoints.forEach((p) => { const d = Math.hypot(p[0] - s.x, p[1] - s.z); if (d < best) { best = d; bp = p; } });
    const f = 14 / best;
    registerRoad([bp, [s.x + (bp[0] - s.x) * f, s.z + (bp[1] - s.z) * f]], 6, "spur");
  });

  // ---------- buildings ----------
  const typeCounts = { residential: 0, downtown: 0, hospital: 0, park: 0 };
  let houseCount = 0, midRiseCount = 0;

  // planned blocks on the rotated grid
  setFrame(0, 0, DOWNTOWN_ROTATION);
  for (let bi = -3; bi <= 3; bi++) {
    for (let bj = -3; bj <= 3; bj++) {
      const bx = bi * BLOCK_PITCH, bz = bj * BLOCK_PITCH, dist = Math.hypot(bx, bz);
      if (dist > 135) continue;
      const dens = Math.max(0, 1 - dist / 150);
      let type;
      if (bi === 2 && bj === 1) type = "hospital";
      else if ((bi === -1 && bj === -2) || (bi === 0 && bj === 3)) type = "park";
      else type = dens > 0.5 ? "downtown" : "residential";
      typeCounts[type]++;
      BUILDING_TYPES[type].build(bx, bz, dens);
    }
  }
  // organic sites, each at its own random rotation
  orgSites.forEach((s) => {
    setFrame(s.x, s.z, s.rot);
    typeCounts[s.type]++;
    BUILDING_TYPES[s.type].build(0, 0, 0);
  });
  setFrame(0, 0, 0);

  // frontage: mid-rise slabs near the core, houses facing the curving streets further out
  function placeLot(mx, mz, tx, tz, side, mid) {
    const w = mid ? randRange(9, 15) : randRange(5, 7.5);
    const d = mid ? randRange(8, 12) : randRange(4.5, 6.5);
    const off = 7 + d / 2 + randRange(0, mid ? 2 : 1.5);
    const px = mx - tz * side * off, pz = mz + tx * side * off;
    const r = Math.hypot(w, d) / 2;
    if (Math.hypot(px, pz) < 135 || Math.hypot(px, pz) > CITY_RADIUS + 10 || isInSite(px, pz)) return;
    if (roadHash.near(px, pz, 20) < r * 0.8 + 4.5) return;
    if (buildingHash.near(px, pz, 30) < r + 1.2) return;
    setFrame(px, pz, Math.atan2(-tz, tx));
    if (mid) {
      const h = randRange(9, 26);
      addBox(0, 0, 0, w, h, d, 0);
      if (h > 15 && nextRandom() < 0.5) addBox(0, h, 0, w * 0.6, randRange(3, 7), d * 0.6, 0);
      midRiseCount++;
    } else {
      const hh = randRange(2.8, 4);
      addBox(0, 0, 0, w, hh, d, 0);
      addBox(0, hh, 0, w * 0.98, 1.3, d * 0.55, 0, false); // roof
      houseCount++;
    }
    setFrame(0, 0, 0);
  }
  roadList.forEach((rd) => {
    if (rd.tag === "spur") return;
    let acc = 0, gap = 0;
    const pts = rd.dense;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!L) continue;
      acc += L;
      if (acc < gap) continue;
      acc = 0;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, mid = Math.hypot(mx, mz) < 235;
      gap = mid ? randRange(15, 20) : randRange(9, 13);
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      placeLot(mx, mz, tx, tz, 1, mid);
      placeLot(mx, mz, tx, tz, -1, mid);
    }
  });

  // ---------- draw roads: two kerb lines + dashed centerline ----------
  roadList.forEach((rd) => {
    const p = rd.pts, n = p.length, hw = rd.w / 2;
    const Lp = [], Rp = [];
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * hw, nz = (dx / l) * hw;
      Lp.push([p[i][0] + nx, p[i][1] + nz]);
      Rp.push([p[i][0] - nx, p[i][1] - nz]);
    }
    for (let i = 1; i < n; i++) {
      pushSegment(groundVerts, Lp[i - 1][0], 0.02, Lp[i - 1][1], Lp[i][0], 0.02, Lp[i][1]);
      pushSegment(groundVerts, Rp[i - 1][0], 0.02, Rp[i - 1][1], Rp[i][0], 0.02, Rp[i][1]);
    }
    for (let i = 1; i < rd.dense.length; i += 2) {
      const c0 = rd.dense[i - 1], c1 = rd.dense[i];
      pushSegment(centerlineVerts, c0[0], 0.02, c0[1], c1[0], 0.02, c1[1]);
    }
  });
  culDeSacs.forEach((pts) => pushLoop(groundVerts, pts, 0.02));

  const stats = `${roadList.length} roads · ${buildingBoxes.length} solids · ${houseCount} houses · ${midRiseCount} mid-rises · `
    + `${typeCounts.hospital} hospitals · ${typeCounts.park} parks`;

  return {
    buildingBoxes,
    edgeVerts,
    windowVerts,
    accentVerts,
    groundVerts,
    centerlineVerts,
    roadList,
    orgSites,
    typeCounts,
    houseCount,
    midRiseCount,
    stats,
    CITY_RADIUS,
  };
}
