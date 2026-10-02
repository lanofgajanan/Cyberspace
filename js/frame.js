// A "frame" is the current local origin + rotation that generation code
// is working in. setFrame(x, z, rotation) moves it; frameX/frameZ convert
// a local-space coordinate into world space through that frame. This is
// what lets the same subdivide()/park/hospital-building code be reused
// for the rotated downtown grid AND for organic sites at arbitrary
// rotations, without duplicating any geometry logic per-orientation.

export const currentFrame = { x: 0, z: 0, r: 0, c: 1, s: 0 };

export function setFrame(x, z, r) {
  currentFrame.x = x;
  currentFrame.z = z;
  currentFrame.r = r;
  currentFrame.c = Math.cos(r);
  currentFrame.s = Math.sin(r);
}

export function frameX(x, z) {
  return currentFrame.x + x * currentFrame.c + z * currentFrame.s;
}

export function frameZ(x, z) {
  return currentFrame.z - x * currentFrame.s + z * currentFrame.c;
}
