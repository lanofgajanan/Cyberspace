import { currentFrame, frameX, frameZ } from "../frame.js";
import { pushSegment, pushLoop, localPoint, facePoint } from "../geometry.js";

// ==========================================================================
// Soviet brutalist city generator.
//
// Same contract as city-generator.js: returns ONE plain object of arrays
// (buildingBoxes, edgeVerts, windowVerts, accentVerts, groundVerts,
// centerlineVerts) plus roadList/orgSites/typeCounts/stats/CITY_RADIUS.
// Nothing here touches Three.js.
//
// Unlike the legacy city this one is AUTHORED, not grown: a strict axis
// (House of Soviets -> civic square -> prospekt -> river bridge ->
// monument roundabout), a ring of showpiece towers, microraion superblocks,
// an industrial belt on the east/west edge, garages and stalled
// construction near the rim, and a fenced perimeter ring road with
// watchtowers. There is deliberately NO randomness: every position and
// height is a pure function of the layout tables below, so the city is
// identical on every load and perfectly mirrored across the x = 0 axis.
//
// Palette convention (set in scene-builder, not here):
//   edgeVerts / windowVerts  -> cold pale grey
//   accentVerts              -> red, used ONLY for civic buildings, the
//                               monuments, tower tops and chimney bands
// ==========================================================================

// Set to "tiered" (ornamental wedding-cake towers with a spire) or
// "ziggurat" (pure stepped concrete, no spire).
export function generateSovietCity(options = {}) {
  const towerStyle = typeof options === "string" ? options : (options && options.towerStyle) || "tiered";
  const buildingBoxes = [];
  const edgeVerts = [];
  const windowVerts = [];
  const accentVerts = [];
  const groundVerts = [];
  const centerlineVerts = [];
  const roadList = [];

  const counts = { slabs: 0, garages: 0, towers: 0, civic: 0, factories: 0, microraions: 0 };

  // ---------- layout constants ----------
  const BLOCK = 64; // superblock footprint
  const ROAD = 14; // arterial width
  const PITCH = BLOCK + ROAD;
  const RING_R = 380; // perimeter ring road centre radius
  const FENCE_R = 396; // border fence radius
  const CITY_RADIUS = 410;
  const GY = 0.02; // ground line height
  const COLS = [58, 136, 214, 292]; // |x| of superblock centres
  const ROWS = [-218, -140, -62, 16, 94, 172]; // z of superblock centres
  const CORE = { x: 122, zMin: -100, zMax: 80 }; // civic core exclusion
  const TOWER_SLOTS = [
    [146, -62],
    [146, 94],
    [58, -140],
    [58, 172],
  ]; // |x|, z of the eight showpiece towers (mirrored)

  // ---------- primitives (copied from the legacy generator) ----------
  function addBox(x, y0, z, w, h, d, ry, win) {
    const X = frameX(x, z);
    const Z = frameZ(x, z);
    const b = { x: X, cy: y0 + h / 2, z: Z, w, h, d, ry: (ry || 0) + currentFrame.r };
    b.c = Math.cos(b.ry);
    b.s = Math.sin(b.ry);
    buildingBoxes.push(b);
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

  // ---------- small geometry helpers (world space, no frame) ----------
  function rectPts(cx, cz, w, d) {
    return [
      [cx - w / 2, cz - d / 2],
      [cx + w / 2, cz - d / 2],
      [cx + w / 2, cz + d / 2],
      [cx - w / 2, cz + d / 2],
    ];
  }

  function circlePts(cx, cz, r, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    return pts;
  }

  function starPts(cx, cz, ro, ri) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? ro : ri;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    return pts;
  }

  const groundRect = (cx, cz, w, d) => pushLoop(groundVerts, rectPts(cx, cz, w, d), GY);
  const accentRectAt = (cx, cz, w, d, y) => pushLoop(accentVerts, rectPts(cx, cz, w, d), y);
  const groundLine = (x0, z0, x1, z1) => pushSegment(groundVerts, x0, GY, z0, x1, GY, z1);

  function dashLine(x0, z0, x1, z1, dash, gap) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (!L) return;
    const ux = (x1 - x0) / L;
    const uz = (z1 - z0) / L;
    for (let t = 0; t < L; t += dash + gap) {
      const e = Math.min(t + dash, L);
      pushSegment(centerlineVerts, x0 + ux * t, GY, z0 + uz * t, x0 + ux * e, GY, z0 + uz * e);
    }
  }

  // straight axis-aligned road: two kerb lines + dashed centerline
  function road(x0, z0, x1, z1, w, tag) {
    const hw = w / 2;
    const horizontal = z0 === z1;
    if (horizontal) {
      groundLine(x0, z0 - hw, x1, z0 - hw);
      groundLine(x0, z0 + hw, x1, z0 + hw);
    } else {
      groundLine(x0 - hw, z0, x0 - hw, z1);
      groundLine(x0 + hw, z0, x0 + hw, z1);
    }
    dashLine(x0, z0, x1, z1, 4, 4);
    roadList.push({ pts: [[x0, z0], [x1, z1]], dense: [[x0, z0], [x1, z1]], w, tag });
  }

  const mirror = (fn) => {
    fn(1);
    fn(-1);
  };

  // =========================================================================
  // 1. CIVIC CORE (everything symmetric about x = 0)
  // =========================================================================

  // central square outline, paving lines, centre obelisk with red star
  groundRect(0, 0, 110, 90);
  groundRect(0, 0, 100, 80);
  groundLine(-55, 0, 55, 0);
  groundLine(0, -45, 0, 45);
  addBox(0, 0, 0, 10, 3, 10, 0, false);
  addBox(0, 3, 0, 3, 26, 3, 0, false);
  pushLoop(accentVerts, starPts(0, 0, 3.4, 1.4), 29.1);

  // House of Soviets: stepped monolith closing the north end of the square
  (function houseOfSoviets() {
    const cz = -80;
    const tiers = [
      { w: 140, d: 38, h: 20, y0: 0 },
      { w: 104, d: 30, h: 18, y0: 20 },
      { w: 64, d: 24, h: 18, y0: 38 },
      { w: 30, d: 20, h: 26, y0: 56 },
      { w: 18, d: 14, h: 18, y0: 82 },
    ];
    tiers.forEach((t) => {
      addBox(0, t.y0, cz, t.w, t.h, t.d, 0);
      accentRectAt(0, cz, t.w - 1, t.d - 1, t.y0 + t.h + 0.06);
    });
    addBox(0, 100, cz, 2.4, 28, 2.4, 0, false);
    pushLoop(accentVerts, starPts(0, cz, 3.6, 1.5), 128.1);
    counts.civic++;
    // symmetric wings
    mirror((sx) => {
      addBox(sx * 95, 0, cz, 50, 30, 30, 0);
      accentRectAt(sx * 95, cz, 49, 29, 30.06);
      addBox(sx * 95, 30, cz, 34, 10, 22, 0);
      accentRectAt(sx * 95, cz, 33, 21, 40.06);
      counts.civic++;
    });
  })();

  // ministries flanking the south of the square, palaces of culture east/west
  mirror((sx) => {
    addBox(sx * 62, 0, 62, 56, 34, 28, 0);
    accentRectAt(sx * 62, 62, 55, 27, 34.06);
    addBox(sx * 62, 34, 62, 36, 10, 18, 0);
    accentRectAt(sx * 62, 62, 35, 17, 44.06);
    counts.civic++;

    addBox(sx * 95, 0, 0, 26, 24, 60, 0);
    accentRectAt(sx * 95, 0, 25, 59, 24.06);
    for (let k = 0; k < 8; k++) {
      addBox(sx * 79, 0, -28 + k * 8, 1.6, 18, 1.6, 0, false);
    }
    addBox(sx * 79, 18, 0, 5, 1.4, 62, 0, false); // portico slab
    counts.civic++;
  });

  // =========================================================================
  // 2. TOWER RING (eight mirrored showpiece towers)
  // =========================================================================
  function tower(cx, cz) {
    groundRect(cx, cz, 44, 44);
    if (towerStyle === "ziggurat") {
      const sizes = [40, 32, 24, 16, 8];
      sizes.forEach((s, i) => {
        addBox(cx, i * 12, cz, s, 12, s, 0);
        accentRectAt(cx, cz, s - 1, s - 1, (i + 1) * 12 + 0.06);
      });
    } else {
      const tiers = [
        { s: 34, h: 14, y0: 0 },
        { s: 26, h: 22, y0: 14 },
        { s: 18, h: 22, y0: 36 },
        { s: 11, h: 20, y0: 58 },
      ];
      tiers.forEach((t) => {
        addBox(cx, t.y0, cz, t.s, t.h, t.s, 0);
        accentRectAt(cx, cz, t.s - 1, t.s - 1, t.y0 + t.h + 0.06);
      });
      addBox(cx, 78, cz, 2, 26, 2, 0, false);
      pushLoop(accentVerts, starPts(cx, cz, 3, 1.2), 104.1);
    }
    counts.towers++;
  }
  TOWER_SLOTS.forEach((s) => mirror((sx) => tower(sx * s[0], s[1])));

  // =========================================================================
  // 3. AXIS: prospekt, river + bridge, monument roundabout, north boulevard
  // =========================================================================

  // prospekt: 40 wide, six lanes shown as dashed lines at x = -10, 0, 10
  groundLine(-20, 45, -20, 258);
  groundLine(20, 45, 20, 258);
  dashLine(-10, 45, -10, 258, 4, 4);
  dashLine(0, 45, 0, 258, 4, 4);
  dashLine(10, 45, 10, 258, 4, 4);
  roadList.push({ pts: [[0, 45], [0, 258]], dense: [[0, 45], [0, 258]], w: 40, tag: "prospekt" });

  // river (flows east-west across the axis) with quay lines
  (function river() {
    const zs = [209, 215, 241, 246];
    zs.forEach((z) => {
      const lim = Math.sqrt((RING_R - 7) * (RING_R - 7) - z * z);
      groundLine(-lim, z, lim, z);
    });
    const lim = Math.sqrt((RING_R - 7) * (RING_R - 7) - 228 * 228);
    dashLine(-lim, 228, lim, 228, 2, 6); // flow line
    // bridge parapets
    mirror((sx) => addBox(sx * 20.7, 0, 228, 1.2, 2.2, 36, 0, false));
  })();

  // monument roundabout and the monument itself
  (function monument() {
    const cx = 0, cz = 300;
    pushLoop(groundVerts, circlePts(cx, cz, 34, 32), GY);
    pushLoop(groundVerts, circlePts(cx, cz, 42, 36), GY);
    addBox(cx, 0, cz, 26, 8, 26, 0, false);
    addBox(cx, 8, cz, 18, 14, 18, 0, false);
    addBox(cx, 22, cz, 12, 20, 12, 0, false);
    addBox(cx, 42, cz, 6, 34, 6, 0, false);
    addBox(cx, 76, cz, 1.4, 40, 1.4, 0, false); // raised sword
    accentRectAt(cx, cz, 25, 25, 8.06);
    accentRectAt(cx, cz, 17, 17, 22.06);
    accentRectAt(cx, cz, 11, 11, 42.06);
    pushLoop(accentVerts, starPts(cx, cz, 4, 1.6), 116.1);
    counts.civic++;
    // colonnade behind the monument, with lintel
    for (let k = 0; k < 9; k++) addBox(-48 + k * 12, 0, 352, 3, 16, 3, 0, false);
    addBox(0, 16, 352, 108, 2.5, 4, 0, false);
    // park outline and diagonal promenades from the roundabout to the corners
    groundRect(0, 305, 180, 106);
    [[-84, 258], [84, 258], [-84, 352], [84, 352]].forEach((c) => {
      const dx = c[0] - cx, dz = c[1] - cz, L = Math.hypot(dx, dz);
      groundLine(cx + (dx / L) * 44, cz + (dz / L) * 44, c[0], c[1]);
    });
  })();

  // north boulevard of heroes: pond, paths, obelisk terminus
  (function boulevard() {
    groundLine(-14, -108, -14, -244);
    groundLine(14, -108, 14, -244);
    groundLine(-8, -108, -8, -244);
    groundLine(8, -108, 8, -244);
    dashLine(0, -108, 0, -244, 3, 5);
    groundLine(-14, -108, 14, -108);
    groundLine(-14, -244, 14, -244);
    roadList.push({ pts: [[0, -108], [0, -244]], dense: [[0, -108], [0, -244]], w: 28, tag: "boulevard" });
    addBox(0, 0, -252, 14, 3, 14, 0, false);
    addBox(0, 3, -252, 6, 56, 6, 0, false);
    accentRectAt(0, -252, 5, 5, 59.06);
    pushLoop(accentVerts, starPts(0, -252, 3.2, 1.3), 59.1);
    counts.civic++;
  })();

  // =========================================================================
  // 4. ARTERIAL GRID
  // =========================================================================
  // vertical arterials at |x| = 97, 175, 253
  mirror((sx) => {
    road(sx * 97, -258, sx * 97, -104, ROAD, "arterial");
    road(sx * 97, 84, sx * 97, 205, ROAD, "arterial");
    road(sx * 175, -258, sx * 175, 205, ROAD, "arterial");
    road(sx * 253, -258, sx * 253, 205, ROAD, "arterial");
  });
  // horizontal arterials: [z, |x| start, |x| end]
  [
    [-179, 26, 253],
    [-101, 124, 330],
    [-23, 124, 330],
    [55, 124, 330],
    [133, 26, 330],
  ].forEach((r) => mirror((sx) => road(sx * r[1], r[0], sx * r[2], r[0], ROAD, "arterial")));

  // =========================================================================
  // 5. SUPERBLOCKS
  // =========================================================================
  const overlapsCore = (ax, zc) =>
    ax - BLOCK / 2 < CORE.x && zc + BLOCK / 2 > CORE.zMin && zc - BLOCK / 2 < CORE.zMax;
  const isTowerSlot = (ax, zc) => TOWER_SLOTS.some((s) => s[0] === ax && s[1] === zc);

  function classify(ax, zc) {
    if (isTowerSlot(ax, zc)) return "tower";
    if (ax === 136 && zc === 16) return "park";
    if (overlapsCore(ax, zc)) return "none";
    if (Math.hypot(ax + BLOCK / 2, Math.abs(zc) + BLOCK / 2) > 355) return "none";
    if (ax === 292) return "industrial";
    if (ax === 214 && zc === 172) return "construction";
    if (ax === 214 && zc === -218) return "garages";
    return "residential";
  }

  // microraion: three parallel slabs, school, shop, two kindergartens
  function microraion(cx, cz, variant) {
    const dist = Math.hypot(cx, cz);
    const h = dist < 215 ? 34 : dist < 245 ? 26 : 14;
    const mp = (u, v) => (variant === 0 ? [cx + u, cz + v] : [cx + v, cz + u]);
    const place = (u, v, len, dep, hh) => {
      const p = mp(u, v);
      if (variant === 0) addBox(p[0], 0, p[1], len, hh, dep, 0);
      else addBox(p[0], 0, p[1], dep, hh, len, 0);
    };
    [-22, -6, 10].forEach((v) => {
      place(0, v, 44, 11, h);
      counts.slabs++;
    });
    place(-12, 22.5, 22, 10, 9); // school
    place(14, 23, 14, 8, 5); // shop
    place(-26, -6, 6, 8, 4.5); // kindergartens
    place(26, -6, 6, 8, 4.5);
    // courtyard sidewalk loop and paths between slab rows
    groundRect(cx, cz, 58, 58);
    [-14, 2].forEach((v) => {
      const a = mp(-27, v), b = mp(27, v);
      groundLine(a[0], a[1], b[0], b[1]);
    });
    counts.microraions++;
  }

  // industrial block: two halls, chimneys, cooling tower, fence, rail yard
  function industrial(cx, cz, rail) {
    groundRect(cx, cz, 60, 60);
    addBox(cx, 0, cz - 17, 54, 13, 20, 0, false);
    addBox(cx + 8, 0, cz + 9, 34, 9, 14, 0, false);
    // sawtooth roof accent on the long hall
    const zy = 13.06;
    for (let i = 0; i < 9; i++) {
      const x0 = cx - 27 + i * 6;
      pushSegment(accentVerts, x0, zy, cz - 27, x0 + 3, zy + 1.6, cz - 27);
      pushSegment(accentVerts, x0 + 3, zy + 1.6, cz - 27, x0 + 6, zy, cz - 27);
    }
    [[cx + 28, cz + 4, 50], [cx + 28, cz + 14, 58]].forEach((c) => {
      addBox(c[0], 0, c[1], 2.4, c[2], 2.4, 0, false);
      accentRectAt(c[0], c[1], 3.2, 3.2, c[2] - 4);
      accentRectAt(c[0], c[1], 3.2, 3.2, c[2] - 8);
    });
    // wireframe cooling tower
    const levels = [[0.5, 8.5], [10, 6.5], [20, 5.8], [30, 6.8]];
    const ccx = cx - 20, ccz = cz + 14, N = 16;
    levels.forEach((lv, li) => {
      const ring = circlePts(ccx, ccz, lv[1], N);
      pushLoop(edgeVerts, ring, lv[0]);
      if (li > 0) {
        const prev = circlePts(ccx, ccz, levels[li - 1][1], N);
        for (let i = 0; i < N; i += 2) {
          pushSegment(edgeVerts, prev[i][0], levels[li - 1][0], prev[i][1], ring[i][0], lv[0], ring[i][1]);
        }
      }
    });
    if (rail) {
      for (let k = -2; k <= 2; k++) groundLine(cx + k * 6, cz - 30, cx + k * 6, cz + 30);
      for (let z = cz - 30; z <= cz + 30; z += 3) groundLine(cx - 12, z, cx + 12, z);
    }
    counts.factories++;
  }

  // garage cooperative: three rows of identical tiny boxes
  function garages(cx, cz) {
    groundRect(cx, cz, 60, 60);
    [-18, 0, 18].forEach((z) => {
      for (let i = 0; i < 12; i++) {
        addBox(cx - 24.2 + i * 4.4, 0, cz + z, 3.6, 2.6, 6.5, 0, false);
        counts.garages++;
      }
    });
  }

  // stalled construction: concrete skeleton plus a tower crane
  function construction(cx, cz) {
    groundRect(cx, cz, 60, 60);
    [-12, 0, 12].forEach((x) => [-8, 8].forEach((z) => addBox(cx + x, 0, cz + z, 0.9, 30, 0.9, 0, false)));
    addBox(cx, 10, cz, 26, 0.6, 18, 0, false);
    addBox(cx, 20, cz, 26, 0.6, 18, 0, false);
    addBox(cx, 30, cz - 4.5, 26, 0.6, 9, 0, false);
    const mx = cx + 22, mz = cz - 14;
    addBox(mx, 0, mz, 1.2, 46, 1.2, 0, false);
    addBox(mx - 8, 44.5, mz, 30, 0.8, 0.8, 0, false); // jib
    addBox(mx + 9, 43.5, mz, 3, 2, 2, 0, false); // counterweight
    accentRectAt(mx, mz, 1.4, 1.4, 46.06);
  }

  function park(cx, cz) {
    groundRect(cx, cz, 44, 56);
    pushLoop(groundVerts, circlePts(cx, cz, 9, 16), GY);
    pushLoop(groundVerts, circlePts(cx, cz, 5, 12), GY);
    groundLine(cx, cz - 28, cx, cz - 9);
    groundLine(cx, cz + 9, cx, cz + 28);
    groundLine(cx - 22, cz, cx - 9, cz);
    groundLine(cx + 9, cz, cx + 22, cz);
  }

  const typeCounts = { residential: 0, industrial: 0, tower: 0, park: 0, garages: 0, construction: 0 };
  let microIndex = 0;

  COLS.forEach((ax) => {
    ROWS.forEach((zc) => {
      const kind = classify(ax, zc);
      if (kind === "none" || kind === "tower") return;
      mirror((sx) => {
        const cx = sx * ax;
        if (kind === "residential") {
          microraion(cx, zc, (microIndex++) % 2);
          typeCounts.residential++;
        } else if (kind === "industrial") {
          industrial(cx, zc, zc === 16);
          typeCounts.industrial++;
        } else if (kind === "garages") {
          garages(cx, zc);
          typeCounts.garages++;
        } else if (kind === "construction") {
          construction(cx, zc);
          typeCounts.construction++;
        } else if (kind === "park") {
          park(sx * 146, zc);
          typeCounts.park++;
        }
      });
    });
  });
  typeCounts.tower = counts.towers;

  // =========================================================================
  // 6. PERIMETER: ring road, border fence, watchtowers
  // =========================================================================
  (function perimeter() {
    const SEG = 96;
    const outer = circlePts(0, 0, RING_R + 7, SEG);
    const inner = circlePts(0, 0, RING_R - 7, SEG);
    pushLoop(groundVerts, outer, GY);
    pushLoop(groundVerts, inner, GY);
    const mid = circlePts(0, 0, RING_R, SEG);
    for (let i = 0; i < SEG; i += 2) {
      const a = mid[i], b = mid[(i + 1) % SEG];
      pushSegment(centerlineVerts, a[0], GY, a[1], b[0], GY, b[1]);
    }
    roadList.push({ pts: mid.concat([mid[0]]), dense: mid.concat([mid[0]]), w: 14, tag: "ring" });
    pushLoop(groundVerts, circlePts(0, 0, FENCE_R, SEG), GY);
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const x = Math.cos(a) * FENCE_R, z = Math.sin(a) * FENCE_R;
      addBox(x, 0, z, 3.4, 16, 3.4, -a, false);
      addBox(x, 16, z, 6, 3, 6, -a, false);
    }
  })();

  const stats = `${roadList.length} roads · ${buildingBoxes.length} solids · ${counts.slabs} slabs · `
    + `${counts.towers} towers · ${counts.civic} civic · ${counts.factories} factories · ${counts.garages} garages`;

  return {
    buildingBoxes,
    edgeVerts,
    windowVerts,
    accentVerts,
    groundVerts,
    centerlineVerts,
    roadList,
    orgSites: [],
    typeCounts,
    houseCount: counts.garages,
    midRiseCount: counts.slabs,
    stats,
    CITY_RADIUS,
  };
}

import { SOVIET_PALETTE } from "../colors.js";

export const sovietCity = {
  id: "soviet",
  name: "Soviet Brutalist",
  shortName: "SOVIET",
  badge: "03",
  kicker: "AXIAL BRUTALISM",
  description: "Monumental Axis, Superblocks & Towers",
  seed: "AUTHORED",
  seedNumber: null,
  chunks: "16 / 16",
  status: "SOVIET CITY ONLINE",
  loadingMessage: "Constructing axial superblocks",
  hasGlitchCubes: false,
  palette: SOVIET_PALETTE,
  generate: (options) => generateSovietCity(options),
};

export default sovietCity;
