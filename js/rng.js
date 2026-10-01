// Seeded RNG — same city generates every time the page loads, which
// matters for actually iterating on one layout instead of it reshuffling
// on every refresh. mulberry32-style generator.

let rngState = 1337;

export function resetSeed(seed) {
  rngState = seed;
}

export function nextRandom() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(a, b) {
  return a + nextRandom() * (b - a);
}
