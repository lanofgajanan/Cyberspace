# Net / Cyberspace — City

A procedurally generated 3D city inspired by the **Net / Cyberspace sequences from *Cyberpunk 2077***.

The scene uses a monochrome **solid-geometry + glowing-edge** visual style. Roads grow organically outward from a rotated downtown grid, buildings orient themselves toward the streets they front, and building density transitions from tall stepped towers around the center to smaller structures toward the edges.

The project is built around procedural generation, deterministic world states, custom camera controls, GPU-conscious rendering, and an explicit scene lifecycle.

---

## Preview

<img src="image1" alt="Net / Cyberspace City">

<img src="image2" alt="Net / Cyberspace City">

---

## Running Locally

This project uses real ES modules (`import` / `export`), which browsers will not load from `file://` because of module and CORS security restrictions.

A local HTTP server is therefore required.

### Using `npx`

```bash
npx serve .
```

### Using Python

```bash
python3 -m http.server
```

Then open the `localhost` URL printed by the server.

### Important

Opening `index.html` directly by double-clicking it will **not work**.

The browser will block the ES modules and the result will usually be a blank page accompanied by CORS or module-loading errors in the console.

There is otherwise no build pipeline:

* No bundler
* No `npm install`
* No compilation step
* No framework
* No build configuration

The only external dependency is **Three.js**, loaded through the import map in `index.html` from a CDN.

The project can therefore be deployed directly to GitHub Pages or another static host.

---

# World Modes

The project currently has two world profiles.

### Legacy City

The original procedural city generator.

It generates the city from the procedural road, block and building systems, including the rotated downtown grid and density falloff toward the outskirts.

### Megacity — Vertical Slice

A deterministic, terrain-first vertical slice intended as the foundation for the larger megacity.

It currently contains:

* Six terraced terrain shelves
* An authored City Center
* Animated center traffic lines
* The red-edged Blackwall boundary
* Seeded terrain generation
* Chunk / worker readiness diagnostics
* Generation state reporting

The older outer districts are intentionally absent while they're being rebuilt, and Phase 2 roads are not currently active.

---

# World Lifecycle

Both world profiles implement the same lifecycle:

```js
init(ctx)
update(dt)
dispose()
```

This gives the application a common interface regardless of which world is active.

More importantly, switching profiles explicitly disposes of the previous world rather than simply replacing the scene reference.

That means GPU resources associated with the previous world can be released during a mode switch instead of accumulating across generations.

The lifecycle shell is handled by:

```text
js/lifecycle.js
```

while the application-level coordination happens through:

```text
js/main.js
```

---

# Procedural Generation

The original city is generated through several interdependent systems.

At a high level:

```text
Seed
 │
 ▼
Coordinate Frame
 │
 ▼
Road Growth
 │
 ├──► Spatial Hash
 │
 ▼
Blocks
 │
 ▼
Building Placement
 │
 ├──► Road Orientation
 ├──► Spatial Hash
 └──► Reserved Sites
       │
       ├── Parks
       └── Hospitals
 │
 ▼
Plain Generated Data
 │
 ▼
Three.js Scene Construction
```

The generator does **not** directly create Three.js objects.

`city-generator.js` produces plain generated data, which is then consumed by `scene-builder.js`.

This keeps the procedural logic independent from the rendering implementation.

---

# Road Generation

Roads grow outward from a rotated downtown grid rather than being generated as a simple axis-aligned grid.

The road system maintains spatial information about existing geometry so new segments can query their surroundings efficiently.

This is handled through:

```text
js/spatial-hash.js
```

The spatial hash is used during both:

* Road growth
* Building placement

This avoids repeatedly checking every existing road/building against every new candidate.

The coordinate system is also abstracted through:

```text
js/frame.js
```

which provides a local coordinate frame so the same generation logic can operate at arbitrary positions and rotations.

---

# Building Generation

Buildings are generated from the resulting road and block layout.

A building doesn't simply get placed at an arbitrary angle.

Its orientation is determined from the street it fronts, allowing the generated architecture to follow the road network.

The generator also reserves specific sites before road growth.

For example:

```text
Reserve landmark
       ↓
Road generation
       ↓
Roads route around reserved area
       ↓
Block generation
       ↓
Building placement
```

This allows features such as parks and hospitals to influence the surrounding road network rather than being placed after the fact.

---

## Architecture

The project deliberately separates **world generation** from **rendering**.

The project structure and module relationships are visualized in the generated GitDiagram below.

<img src="diagram.png" alt="GitDiagram showing the project architecture and file relationships">


The important boundary is:

> **Generation produces data. Rendering consumes data.**

`city-generator.js` contains no Three.js dependency.

`scene-builder.js` is responsible for turning the generated data into actual GPU-backed Three.js objects.

In principle, this means the procedural generation system could be connected to another renderer without rewriting the generation algorithms themselves.

---

# File Structure

```text
index.html
└── Markup, stylesheet link, import map and application entry

css/
└── style.css
    └── HUD, buttons and settings panel

js/
├── rng.js
│   └── Seeded random number generator
│
├── colors.js
│   └── Color constants + alpha-compositing blend helper
│
├── frame.js
│   └── Local coordinate frame for position / rotation independent generation
│
├── geometry.js
│   └── Pure geometry helpers:
│       box corners, face-local points and line-segment collectors
│
├── spatial-hash.js
│   └── Fast proximity queries used by road growth and building placement
│
├── city-generator.js
│   └── Core procedural generator:
│       roads, blocks and buildings
│       Returns plain data — no Three.js
│
├── glitch-cubes.js
│   └── Small cubes protruding from building walls
│       Currently an experimental / WIP effect
│
├── streaks.js
│   └── Converts line/fill data into vertical streak
│       dot-shader visuals
│
├── scene-builder.js
│   └── Converts generated data into Three.js GPU objects
│       using instanced meshes and merged line batches
│
├── camera-controls.js
│   └── Hand-written orbit / pan / fly camera controls
│       No external OrbitControls dependency
│
├── camera-replay.js
│   └── Camera waypoint capture, validation and playback
│
├── ui.js
│   └── HUD buttons and settings controls
│
├── lifecycle.js
│   └── Explicit init / update / dispose world lifecycle
│
├── megacity-generator.js
│   └── Seeded terrace + vertical-slice generator
│
└── main.js
    └── Application entry point and system coordination
```

---

# Why `city-generator.js` Is One Large File

`city-generator.js` is intentionally not split into many smaller modules.

The reason is that road growth, block placement and building generation are genuinely interdependent.

For example:

* Buildings need road information to avoid overlaps.
* Buildings need road information to orient themselves toward the correct street.
* Parks and hospitals must be reserved before roads grow so roads can route around them.
* Road growth and building placement both rely on the same spatial hashes.
* The generator uses a shared coordinate frame across these systems.

Splitting these pieces further would require threading the same state through numerous function boundaries without providing a meaningful improvement in readability.

The current split therefore follows **actual system boundaries**, rather than simply trying to make every file smaller.

---

# Camera Replay

The replay system records camera waypoints and reconstructs the camera path during playback.

Position interpolation uses **per-segment Hermite timing**, while camera orientation uses **quaternion slerp**.

Conceptually:

```text
Waypoint A
    │
    │ Hermite interpolation
    ▼
Waypoint B
    │
    │ Hermite interpolation
    ▼
Waypoint C
```

Orientation is interpolated independently using quaternion spherical linear interpolation.

Replay data can also be exported and imported as JSON.

Imported replay data is validated before being accepted.

During playback:

```text
Normal Camera Controls
        │
        ▼
   Replay Starts
        │
        ▼
 Replay Owns Camera
        │
        ▼
 Replay Stops
        │
        ▼
Normal Camera Controls
```

Stopping a replay therefore returns control to the normal orbit/fly camera rather than leaving the camera in a replay-controlled state.

---

# Runtime Diagnostics

The HUD exposes several runtime values:

* FPS
* Renderer draw calls
* Road segment count
* Generation time
* Chunk readiness
* Worker readiness
* Seeded terrain state

Generation is also staged during mode changes.

If generation or scene setup fails, the selected world profile remains recoverable through the retry flow.

User-facing failures use stable error codes, including:

```text
E_GENERATION_FAILED
E_SCENE_BUILD_FAILED
E_REPLAY_IMPORT_INVALID
```

Stable error identifiers make failures easier to diagnose than relying only on free-form error messages.

---

# Rendering & Performance

A major goal of the renderer is to keep draw-call overhead low as the procedural city grows.

All building solids are rendered using a single:

```js
THREE.InstancedMesh
```

This allows the building geometry to be rendered as instances rather than requiring an individual draw call per building.

Edge, window, road and streak geometry is similarly combined into a small number of `LineSegments` batches.

Conceptually:

```text
Many Buildings
      │
      ▼
InstancedMesh
      │
      ▼
~1 building draw call


Many Lines
      │
      ▼
Merged LineSegments
      │
      ▼
Small fixed number of draw calls
```

The result is that total draw calls remain roughly constant as city size increases.

This is particularly useful on lower-end hardware, where **draw-call overhead can become a more significant bottleneck than raw triangle count**.

---

# Determinism

The procedural systems use seeded generation.

That means a given seed can reproduce the same generated world state rather than producing a completely different city on every run.

This is especially important for the Megacity vertical slice, where terrain and generation state are exposed through diagnostics.

Deterministic generation also makes procedural changes easier to debug because the same input can be regenerated repeatedly.

---

# Known Rough Edges

This is still an active work in progress.

### Glitch Cubes

The glitch cubes are an early implementation and are intentionally toned down.

They're currently treated as a WIP visual effect rather than a finished part of the environment design.

### No Bloom / Glow Post-Processing Yet

The reference aesthetic relies heavily on bloom and atmospheric glow.

The current implementation does not yet use post-processing.

The most obvious future addition would be:

```text
EffectComposer
      +
UnrealBloomPass
```

This would likely produce the largest visual improvement relative to the current renderer.

However, it would also introduce additional GPU cost, particularly on older hardware, so it is intentionally treated as a separate rendering trade-off rather than simply enabling it by default.

### Browser Validation

The project was syntax/import checked during the file split, but the resulting version was not executed inside an actual browser from the environment where that refactor was performed because a headless browser was unavailable.

If the project fails to load, the browser console should therefore be checked first.

Import/module path errors are a more likely cause than a fundamental procedural-generation failure, since the generation logic itself was carried over from a previously tested and working version.

---

# Current Status

**Active WIP**

The current implementation has the core procedural city, world profiles, explicit scene lifecycle, deterministic megacity terrain, camera replay system, runtime diagnostics and GPU-conscious rendering architecture in place.

The **Megacity Vertical Slice** is the current foundation for expanding the world with additional districts, roads, structures and visual effects.

---

## License

MIT
