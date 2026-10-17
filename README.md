# Net / Cyberspace — City.OS

A procedurally generated 3D city visualizer rendered in a monochrome "solid geometry + glowing edges" vector style, inspired by the cyberspace and Net sequences in *Cyberpunk 2077*.

The project features multiple distinct architectural city profiles, dynamic UI generation, and single-draw-call line & instanced mesh rendering.

---

## Running it locally

This project uses native ES modules (`import`/`export`), which browsers refuse to load over the `file://` protocol for security reasons — you need to serve it over `http://`. Any static file server works, for example:

```bash
npx serve .
```

or

```bash
python3 -m http.server
```

then open the printed `localhost` URL.

Once deployed to GitHub Pages (or any static host), it works with no build step at all — there is no bundler, no `npm install`, and nothing to compile. The only external runtime dependency is Three.js, loaded via the browser import map in `index.html` from a CDN.

---

## World Profiles

Cyberspace features three distinct city generators with unique planning philosophies, algorithms, and visual palettes:

1. **Legacy City (`legacy`)**
   - **Character:** Organic, grown, emergent.
   - **Layout:** Roads grow organically outward from a rotated downtown grid using wandering streamlines, buildings orient to whichever street they front, and density tapers from tall stepped towers downtown to mid-rises and houses near the edges.
   - **Non-overlap:** Spatial hash reservations for parks and hospitals, growth-time road collision, and radial rejection sampling for frontage lots.

2. **Megacity Profile (`megacity`)**
   - **Character:** Terraced vertical slice.
   - **Layout:** Six terraced elevation shelves, the authored City Center, animated traffic flow lines, and the red-edged Blackwall containment perimeter.

3. **Soviet Brutalist City (`soviet`)**
   - **Character:** Monumental, axial, rigid, perfectly symmetric.
   - **Layout:** Authored coordinate tables with zero randomness. A monumental central axis features the stepped House of Soviets monolith, Red Star obelisks, central civic square, 6-lane prospekt, river bridge, and monument roundabout with a colossal statue and colonnade. Flanked by 8 showpiece towers, residential microraion superblocks, an industrial belt with wireframe cooling towers, and a fenced perimeter ring road with watchtowers.
   - **Palette:** Cold pale grey edges and window matrices with signature crimson red accents on civic monuments, spires, and chimney bands.

Switching profiles explicitly releases previous GPU resources via the unified `lifecycle.js` contract (`init`, `update`, `dispose`).

---

## Cities Architecture & Adding New Cities

The codebase features a modular, plug-and-play **Cities Architecture** located in `js/cities/`.

Adding a new procedural city requires **no changes to HTML, CSS, or UI code**:

```
Step 1: Copy `js/cities/template.js` -> `js/cities/<your-city>.js`
Step 2: Implement your generation function returning the CityData contract.
Step 3: Register it in `js/cities/registry.js` (add 1 import + add to `CITIES`).
Step 4: Validate in terminal:
          node js/cities/validate.js <your-city-id>
```

The engine automatically:
- Generates the segmented control button in the UI tool rail.
- Adds an option to the mode select dropdown.
- Sets up the World Card badge, kicker, description, seed, and block counts.
- Applies custom per-world color palettes (edges, windows, accents, ground, centerlines).
- Manages GPU object lifecycle and memory cleanup on world switching.

### CLI Validation Suite

You can test any city's math, vertex buffers, and collision bounds in Node without opening a browser:

```bash
# Test a specific city:
node js/cities/validate.js soviet
node js/cities/validate.js legacy
node js/cities/validate.js megacity

# Test all registered cities:
node js/cities/validate.js all
```

---

## File Structure

```
index.html                  Markup, layout, styles link, import map, loads js/main.js
css/style.css                All styling (responsive HUD, tool rail, inspector, world card)
js/
  cities/                    Pluggable Cities Subsystem
    registry.js              Central registry of all cities (drives menus & lifecycles)
    template.js              Starter boilerplate template for new cities
    validate.js              Node CLI test suite (vertex integrity, bounds, collisions)
    legacy.js                Legacy organic city generator & profile
    megacity.js              Megacity vertical slice generator & profile
    soviet.js                Soviet brutalist axial generator & profile
  geometry.js                Line segment pushers, box corners, face-local points
  frame.js                   Local coordinate frame translation & rotation
  rng.js                     Seeded pseudo-random number generator
  spatial-hash.js            2D spatial hash for proximity and clearance queries
  colors.js                  Color constants, palette definitions, alpha-compositing blend
  scene-builder.js           GPU scene constructor (instanced meshes, merged line batches)
  glitch-cubes.js            Extruding facade voxel packets
  streaks.js                 Converts line/fill data into cyberpunk matrix dot streaks
  camera-controls.js         Hand-rolled orbit, pan, and first-person fly camera controls
  camera-replay.js           Waypoint capture, quaternion slerp, and route playback
  ui.js                      Dynamic inspector tabs, segmented controls, telemetry, and HUD
  main.js                    Entry point, loop, telemetry, and staged loading coordinator
  lifecycle.js               Explicit init/update/dispose mode shell
  SKILL.md                   Comprehensive architecture and engineering guide for devs & AI
```

---

## Why it's split this way

- **Generators produce data; the renderer consumes data:** City generators in `js/cities/` never touch Three.js and never create meshes. They return pure arrays of numbers (`buildingBoxes`, `edgeVerts`, `windowVerts`, `accentVerts`, `groundVerts`, `centerlineVerts`).
- **Single-file generators for complex growth:** Within each procedural generator (e.g. `legacy.js`), road growth, block placement, and building placement share hashes and local coordinate frames. Keeping them in one cohesive module avoids threading mutable state across arbitrary boundaries.
- **Dynamic orchestration:** `main.js` and `ui.js` contain zero hardcoded city branches. Everything is driven declaratively by the active `CityProfile` in `js/cities/registry.js`.

---

## Performance Notes

- **One Instanced Mesh for all solids:** All building boxes render as a single `THREE.InstancedMesh` (one draw call for the entire city, regardless of building count).
- **Baked Vertex Alpha Compositing:** Edge, window, accent, ground, and centerline layers are merged into a single `THREE.LineSegments` draw call. Layer alpha blending is precomputed once at build time into vertex colors (`blendedColor(hex, alpha)`), avoiding per-frame GPU blending passes.
- Total draw calls typically stay between 2 and 4, ensuring smooth 60 FPS performance on lower-end devices.

---

## Camera Navigation & Keybindings

- **Orbit Mode:** Left-click drag to rotate · Right-click or Middle-click drag to pan · Scroll wheel to zoom · W/A/S/D to pan.
- **Fly Mode:** Click canvas to lock mouse · Mouse look to steer · W/S/A/D to move · Space for up · Ctrl for down · Shift to sprint · Esc to exit.
- **Interface:** Press `Tab` to toggle HUD · Press `H` to open the navigation help modal.
