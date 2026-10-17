---
name: cyberspace-city-builder
description: Complete developer and AI agent guide for designing, implementing, validating, and wiring procedural city generators for the Cyberspace project (lanofgajanan/Cyberspace). Contains the plug-and-play Cities Registry architecture, exact file locations, data contracts, non-overlap playbook, and automated CLI validation.
---

# Cyberspace City Builder & Architecture Guide

Cyberspace is a high-performance browser-based 3D visualizer of procedural cities in a cyberpunk black-void aesthetic (black solid boxes, glowing vector line work, and minimal draw calls).

---

## ⚡ AI Fast-Track: How to Add a New City in 3 Minutes

When tasked with creating or adding a new city, follow this exact 3-step recipe. You do **NOT** need to edit `index.html`, `style.css`, `main.js`, or `ui.js`:

```
Step 1: Copy `js/cities/template.js` -> `js/cities/<your-city>.js`
Step 2: Implement your generation function returning the Data Contract (Section 3).
Step 3: Register your city in `js/cities/registry.js` by adding 2 lines:
          import { myCity } from "./my-city.js";
          and add `myCity` to the `CITIES` array.
Step 4: Run CLI validation:
          node js/cities/validate.js <your-city-id>
```

The engine automatically:
- Generates the segmented control button in the UI inspector.
- Adds an option to the mode select dropdown.
- Sets up the World Card badge, kicker, description, seed, and chunk indicators.
- Applies custom per-world color palettes (edges, windows, accents, ground, centerlines).
- Manages GPU object lifecycle and memory cleanup on world switching.

---

## 1. Codebase Architecture & File Map

| Directory / File | Role | Can AI touch when adding a city? |
|---|---|---|
| **`js/cities/`** | **All City Generators & Registry** | **YES — primary workspace** |
| `js/cities/registry.js` | Central plug-and-play city manifest (`CITIES`, `getCity`) | **YES — add 2 lines here** |
| `js/cities/template.js` | Starter template with standard box & window helpers | Reference / copy |
| `js/cities/legacy.js` | Legacy City profile & organic road growth generator | Reference implementation |
| `js/cities/megacity.js` | Megacity vertical slice & terraced center generator | Reference implementation |
| `js/cities/soviet.js` | Soviet Brutalist City profile & authored axial generator | Reference implementation |
| `js/cities/validate.js` | Automated Node CLI test suite for all city data | **YES — run to test your code** |
| **`js/` Shared Helpers** | **Reusable Math & Geometry Toolkit** | Read-only |
| `js/geometry.js` | `pushSegment`, `pushLoop`, `rectCorners`, `localPoint`, `facePoint` | Use in generator |
| `js/frame.js` | Local coordinate transformations (`setFrame`, `frameX`, `frameZ`) | Use for rotated sites |
| `js/rng.js` | Seeded pseudo-random number generator (`randRange`, `nextRandom`) | Use in organic generators |
| `js/spatial-hash.js` | Fast 2D spatial hash for road & building collision | Use for organic growth |
| `js/colors.js` | Color constants, palettes (`SOVIET_PALETTE`), `blendedColor`, `hexToRgb` | Palette references |
| `js/scene-builder.js` | Three.js scene builder (merges all lines into single draw call) | Do NOT touch from generators |
| `js/main.js` | Application entry point, render loop, telemetry | Fully dynamic (reads registry) |
| `js/ui.js` | Tool rail, inspector tabs, camera presets, replay | Fully dynamic (reads registry) |
| `js/lifecycle.js` | GPU resource management contract (`init`, `update`, `dispose`) | Engine core |

---

## 2. CityProfile Contract (`js/cities/registry.js`)

Every city module in `js/cities/` exports a `CityProfile` object:

```javascript
export const myCity = {
  id: "neon-district",                     // Unique lowercase slug
  name: "Neon District",                   // Full title in menus & diagnostics
  shortName: "NEON",                       // 4-8 char uppercase label for segmented button
  badge: "04",                             // 2-digit index string on World Card
  kicker: "CYBER DOWNTOWN",                // Uppercase subtitle on World Card
  description: "Dense holographic towers", // 1-line description on World Card
  seed: "7777",                            // Display seed string (or "AUTHORED")
  seedNumber: 7777,                        // Optional numeric seed for rng.js (or null)
  chunks: "24 / 24",                       // Chunk or block counter string
  status: "NEON CITY ONLINE",              // Topbar status banner string
  loadingMessage: "Generating neon grid",  // Staged loading progress text
  hasGlitchCubes: false,                   // true = facade glitch cubes active
  palette: {                               // Optional custom color palette
    edge: 0x00f0ff,                        // Primary structure edges
    window: 0x005577,                      // Facade window matrices
    accent: 0xff0055,                      // Signature highlight color (helipads, stars, spires)
    ground: 0x002233,                      // Kerbs, roads, riverbanks, promenades
    centerline: 0x001824,                  // Road dashed centerlines
  },
  generate: (options) => generateNeonCity(options), // Returns CityData contract
};

export default myCity;
```

---

## 3. CityData Contract (Generator Return Value)

**Rule 1: Generators produce pure data; the renderer consumes data.**
A generator never imports Three.js and never creates meshes. It returns one plain object:

| Field | Type | Description |
|---|---|---|
| `buildingBoxes` | `Array<Box>` | Every solid. Each box is `{x, cy, z, w, h, d, ry, c, s}`: center x, vertical center `cy` (base + h/2), center z, width (local x), height, depth (local z), rotation about Y, and cached cos/sin. |
| `edgeVerts` | `Array<number>` | Flat float array of line segments (6 floats per segment: `x0,y0,z0, x1,y1,z1`) for box edges. |
| `windowVerts` | `Array<number>` | Flat float array of window grid segments, offset by `+0.03` from faces to avoid z-fighting. |
| `accentVerts` | `Array<number>` | Highlight segments: roof crosses, stars, helipads, tier outlines, spire tops. |
| `groundVerts` | `Array<number>` | Ground-level segments at fixed height `y = 0.02`: road kerbs, fences, plaza outlines, rivers. |
| `centerlineVerts` | `Array<number>` | Dashed road centerlines at height `y = 0.02`. |
| `roadList` | `Array<Road>` | List of `{pts, dense, w, tag}` for frontage placement and telemetry. |
| `CITY_RADIUS` | `number` | True bounding radius of the city (used for camera framing and boundaries). |
| `stats` | `string` | HUD summary (e.g. `"21 roads · 391 solids · 48 slabs"`). |
| `orgSites` | `Array` | Reserved sites (can be empty `[]`). |
| `typeCounts` | `Object` | Category bookkeeping (e.g. `{ residential: 16, industrial: 6 }`). |

### Hard Geometry Constraints
- **Solids rotate about the vertical (Y) axis only.** No pitch, roll, or tilted boxes.
- **Tapered shapes are stacks of narrower boxes.** (e.g. House of Soviets, ziggurats).
- **Curved forms are line loops.** Roundabouts, ponds, and cooling towers exist as line rings, not meshes.
- **All vertex buffers must have `length % 6 === 0` and contain only finite numbers.**

---

## 4. Shared Toolkit

Import these existing helpers from `../geometry.js`, `../frame.js`, `../rng.js`, and `../spatial-hash.js`:

```javascript
// Add a box and its glowing edge segments
function addBox(x, y0, z, w, h, d, ry = 0, win = true) {
  const X = frameX(x, z);
  const Z = frameZ(x, z);
  const b = { x: X, cy: y0 + h / 2, z: Z, w, h, d, ry: ry + currentFrame.r };
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

// Window matrix on 4 vertical faces
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
    for (let i = 0; i <= cols; i++) {
      const u = -L / 2 + m + (L - 2 * m) * i / cols;
      const p = facePoint(b, f, u, yb, n);
      const q = facePoint(b, f, u, yt, n);
      pushSegment(windowVerts, p[0], p[1], p[2], q[0], q[1], q[2]);
    }
    for (let i = 0; i <= rows; i++) {
      const y = yb + (yt - yb) * i / rows;
      const p = facePoint(b, f, -L / 2 + m, y, n);
      const q = facePoint(b, f, L / 2 - m, y, n);
      pushSegment(windowVerts, p[0], p[1], p[2], q[0], q[1], q[2]);
    }
  }
}
```

### Local Coordinate Frames (`../frame.js`)
Build complex sites (e.g. hospital, stadium, park) around local `(0, 0, 0)`, then place them in the world:
```javascript
setFrame(worldX, worldZ, rotationAngle);
// Generate site buildings & paths
setFrame(0, 0, 0); // ALWAYS RESET TO ZERO! Leaked frames rotate everything created afterwards.
```

---

## 5. The Non-Overlap Playbook

Buildings and roads must never accidentally intersect. Choose the right mechanism for your layout style:

### 5.1 Arithmetic Guarantees (Best for Grids & Axial Planning)
- **`pitch = block_size + street_width`**: Center blocks on multiples of pitch; run roads along midpoints. Overlap is impossible by construction.
- **Inner Margins**: Keep buildings inset by at least 2–3 units from the block boundary.
- **Axis Exclusions**: Reserve a center bounding box (e.g. `|x| < 122`) for monuments and civic cores before placing superblocks.

### 5.2 Spatial Hash Reservations (Best for Organic Growth)
- **Obstacles First, Roads Second**: Create a spatial hash (`createSpatialHash()`). Stamp landmark exclusion discs (`put(x, z, id, -1, radius)`) before road streams grow.
- **Road Clearance**: Check candidate points with `hash.near(x, z, searchRadius)`. Kill branches if distance < clearance.
- **Roads First, Lots Second**: Generate the full road network before evaluating lots. Place lots tangent to road edges with `offset = street_half_width + lot_depth/2 + jitter`.

---

## 6. Automated CLI Validation

Never guess or push unvalidated geometry. Run the validation suite directly in terminal:

```bash
# Validate a specific city:
node js/cities/validate.js soviet
node js/cities/validate.js legacy
node js/cities/validate.js megacity

# Validate all registered cities at once:
node js/cities/validate.js all
```

The validator checks:
1. **Execution**: verifies the generator completes without crashing.
2. **Buffer Integrity**: confirms all arrays are `% 6 === 0` and floats are finite.
3. **Bounding Extent**: checks `maxSolidRadius <= CITY_RADIUS`.
4. **Collision Detection**: performs 3D AABB overlap tests across all axis-aligned solids.
