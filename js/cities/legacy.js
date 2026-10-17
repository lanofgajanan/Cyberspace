import { generateCity } from "../city-generator.js";

/**
 * Legacy procedural city profile.
 * Emergent road growth around a rotated downtown grid.
 */
export const legacyCity = {
  id: "legacy",
  name: "Legacy City",
  shortName: "LEGACY",
  badge: "01",
  kicker: "PROCEDURAL CITY",
  description: "Rotated Downtown Grid & Buildings",
  seed: "1337",
  seedNumber: 1337,
  chunks: "18 / 18",
  status: "WORLD ONLINE",
  loadingMessage: "Seeding legacy road network",
  hasGlitchCubes: true,
  palette: null,
  generate: () => generateCity(),
};

export default legacyCity;
