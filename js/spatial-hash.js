// A coarse grid-bucketed spatial hash. Road growth and building placement
// both need "is there anything near this point?" checks constantly —
// without this, each check would be an O(n) scan against every point
// placed so far, which gets slow fast as the city grows. Bucketing points
// into ~12-unit cells means a query only has to look at a handful of
// nearby cells instead of everything.
export function createSpatialHash() {
  const cells = {};
  const CS = 12;

  return {
    put(x, z, id, i, r) {
      const k = Math.floor(x / CS) + "," + Math.floor(z / CS);
      (cells[k] || (cells[k] = [])).push({ x, z, id, i, r });
    },
    // Distance to the nearest stored point (minus that point's own
    // radius), searching only the cells within maxd of (x, z).
    near(x, z, maxd, skip) {
      let best = 1e9;
      const n = Math.ceil(maxd / CS);
      const cx = Math.floor(x / CS);
      const cz = Math.floor(z / CS);
      for (let a = -n; a <= n; a++) {
        for (let b = -n; b <= n; b++) {
          const list = cells[(cx + a) + "," + (cz + b)];
          if (!list) continue;
          for (let q = 0; q < list.length; q++) {
            const p = list[q];
            if (skip && skip(p)) continue;
            const d = Math.hypot(p.x - x, p.z - z) - p.r;
            if (d < best) best = d;
          }
        }
      }
      return best;
    },
  };
}
