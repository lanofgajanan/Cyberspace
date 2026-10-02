import { frameX, frameZ } from "./frame.js";

// Appends one line segment (2 points, 6 floats) to a flat position array.
// Every line layer in this project (edges, windows, roads, accents) ends
// up as one of these flat arrays, later merged into a single draw call —
// see scene-builder.js.
export function pushSegment(arr, ax, ay, az, bx, by, bz) {
  arr.push(ax, ay, az, bx, by, bz);
}

// pts: [[x,z], ...] — a closed polyline on the ground plane (y fixed).
export function pushLoop(arr, pts, y) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    pushSegment(arr, p[0], y, p[1], q[0], y, q[1]);
  }
}

export function rectCorners(cx, cz, w, d) {
  return [
    [cx - w / 2, cz - d / 2],
    [cx + w / 2, cz - d / 2],
    [cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2],
  ];
}

// A building box `b` stores its own position/rotation (captured from the
// frame at the moment it was created — see addBox in city-generator.js),
// so converting a LOCAL offset within that box into a WORLD point only
// needs the box itself, not the (possibly different, by now) current frame.
export function localPoint(b, localX, localY, localZ) {
  return [
    b.x + localX * b.c + localZ * b.s,
    b.cy + localY,
    b.z - localX * b.s + localZ * b.c,
  ];
}

// Maps (u = along-face offset, y = vertical offset, n = distance out
// from the box center along the face's normal) to a world point on one
// of a box's 4 side faces (f = 0..3).
export function facePoint(b, f, u, y, n) {
  if (f === 0) return localPoint(b, u, y, n);
  if (f === 1) return localPoint(b, -u, y, -n);
  if (f === 2) return localPoint(b, n, y, -u);
  return localPoint(b, -n, y, u);
}

// Segment/loop helpers that go through the CURRENT frame (see frame.js) —
// used for things drawn directly in frame-local coordinates rather than
// relative to a specific box, e.g. a hospital's roof cross or a park's
// path network.
export function addFrameSegment(arr, ax, ay, az, bx, by, bz) {
  pushSegment(arr, frameX(ax, az), ay, frameZ(ax, az), frameX(bx, bz), by, frameZ(bx, bz));
}

export function addFrameLoop(arr, pts, y) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    addFrameSegment(arr, a[0], y, a[1], b[0], y, b[1]);
  }
}
