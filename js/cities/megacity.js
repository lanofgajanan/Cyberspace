import { generateMegacity } from "../megacity-generator.js";

/**
 * Megacity vertical slice profile.
 * High-density terraced center bounded by the Blackwall.
 */
export const megacityCity = {
  id: "megacity",
  name: "Megacity Profile",
  shortName: "MEGACITY",
  badge: "02",
  kicker: "VERTICAL SLICE",
  description: "Terraced City Center & Blackwall",
  seed: "4242",
  seedNumber: 4242,
  chunks: "06 / 06",
  status: "MEGACITY ONLINE",
  loadingMessage: "Seeding megacity districts",
  hasGlitchCubes: false,
  palette: null,
  generate: () => generateMegacity(4242),
};

export default megacityCity;
