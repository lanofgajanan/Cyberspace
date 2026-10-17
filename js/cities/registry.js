import { legacyCity } from "./legacy.js";
import { megacityCity } from "./megacity.js";
import { sovietCity } from "./soviet.js";

/**
 * ============================================================================
 * CYBERSPACE CITIES REGISTRY
 * ============================================================================
 *
 * This registry powers the entire city switching system.
 * Any city registered here automatically gets:
 * - A button in the inspector's segmented world-profile control
 * - An entry in the #mode-select dropdown
 * - Its own world card kicker, subtitle, description, and status
 * - Dedicated palette overrides applied in the renderer
 * - Tailored loading messages and telemetry readouts
 *
 * TO ADD A NEW CITY:
 * 1. Create your generator & profile in `js/cities/<your-city>.js`
 *    (Tip: you can start from `js/cities/template.js`)
 * 2. Import it here and add it to the `CITIES` list below.
 * ============================================================================
 */

export const CITIES = [
  legacyCity,
  megacityCity,
  sovietCity,
];

/**
 * Retrieve a city profile by its unique ID.
 * Falls back to the default city if not found.
 * @param {string} id
 * @returns {typeof legacyCity}
 */
export function getCity(id) {
  if (!id) return CITIES[0];
  const found = CITIES.find((c) => c.id === id);
  return found || CITIES[0];
}

/**
 * Get the initial default city profile.
 * @returns {typeof legacyCity}
 */
export function getDefaultCity() {
  return CITIES[0];
}

/**
 * Dynamically register a city profile at runtime.
 * @param {Object} profile
 */
export function registerCity(profile) {
  if (!profile || !profile.id) {
    console.warn("Cannot register city without a valid id:", profile);
    return;
  }
  const existingIdx = CITIES.findIndex((c) => c.id === profile.id);
  if (existingIdx >= 0) {
    CITIES[existingIdx] = profile;
  } else {
    CITIES.push(profile);
  }
}
