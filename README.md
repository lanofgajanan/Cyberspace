# Net / Cyberspace — City

A procedurally generated city rendered in a monochrome "solid geometry +
glowing edges" style, inspired by the cyberspace/Net sequences in
Cyberpunk 2077. Roads grow organically outward from a rotated downtown
grid, buildings orient to whichever street they front, and density fades
from tall stepped towers downtown to houses near the edges.

## Running it locally

This project uses real ES modules (`import`/`export`), which browsers
refuse to load over `file://` for security reasons — you need to serve
it over `http://`. Any static file server works, for example:

```
npx serve .
```

or

```
python3 -m http.server
```

then open the printed `localhost` URL. If you just open `index.html`
directly by double-clicking it, the modules will fail to load and
you'll get a blank page with console errors about CORS/module loading.

Once deployed to GitHub Pages (or any static host), it works with no
build step at all — there's no bundler, no `npm install`, nothing to
compile. The only external dependency is Three.js itself, loaded via
the import map in `index.html` from a CDN.

## World modes and replay

The **World profile** selector keeps the original procedural city available
as **Legacy city**. The former megacity vertical-slice prototype is retired
from the runtime until its replacement is implemented; selecting the
**Megacity profile** remains safe and loads the planned city instead. Both
modes use the same
`init(ctx)`, `update(dt)`, and `dispose()` lifecycle so switching modes
explicitly releases the previous GPU resources.

Replay controls capture camera waypoints, interpolate positions with
per-segment Hermite timing and orientations with quaternion slerp, and
support validated JSON import/export. During playback replay owns the camera;
stopping restores normal orbit/fly controls. The HUD also reports live FPS,
renderer draw calls, road segment count, and generation time.
Mode changes show staged generation progress and keep the selected profile
recoverable through a retry action if generation or render setup fails.
User-facing failures include stable codes such as `E_GENERATION_FAILED`,
`E_SCENE_BUILD_FAILED`, and `E_REPLAY_IMPORT_INVALID` for easier diagnosis.

## File structure

```
index.html              Markup, styles link, import map, loads js/main.js
css/style.css            All styling (HUD, buttons, settings panel)
js/
  rng.js                 Seeded random number generator
  colors.js               Color constants + alpha-compositing blend helper
  frame.js                 Local coordinate frame (lets the same generation
                            code work at any position/rotation)
  geometry.js               Pure helpers: box corners, face-local points,
                             line-segment collectors
  spatial-hash.js            Fast "anything near this point?" queries,
                              used during road growth and building placement
  city-generator.js           The core generator: roads, blocks, buildings.
                               Returns plain data — no Three.js in this file.
  glitch-cubes.js               Small cubes protruding from building walls
                                 (intentionally toned down for now — flagged
                                 as a WIP effect, not a finished design)
  streaks.js                     Converts line/fill data into the vertical
                                  "streak" dot-shader visuals
  scene-builder.js                 Turns generated data into actual Three.js
                                    GPU objects (instanced meshes, merged
                                    line batches)
  camera-controls.js                Hand-rolled orbit/pan camera (no
                                     external OrbitControls dependency)
  ui.js                              Wires HUD buttons + settings sliders
  main.js                            Entry point — ties everything together
  lifecycle.js                       Explicit init/update/dispose mode shell
  camera-replay.js                   Waypoint capture, validation and playback
```

## Why it's split this way

`city-generator.js` is deliberately the one large file rather than split
further: road growth, block placement, and building generation are
genuinely interdependent (buildings need to know where roads are to
avoid overlapping/orient toward them, park/hospital sites get reserved
*before* roads grow so roads route around them, and all of it shares the
same spatial hashes and coordinate frame). Splitting that interdependency
across more files would mean threading the same half-dozen pieces of
state through every function boundary for little real readability gain.

Everything else *is* split along a genuine boundary: `city-generator.js`
produces plain data (arrays of numbers), and `scene-builder.js` is the
only file that touches Three.js to turn that data into renderable
objects — so the generation logic has no rendering-engine dependency at
all, and could in principle target a different renderer without being
rewritten.

## Performance notes

All building solids render as a single `THREE.InstancedMesh` (one draw
call for the entire city, however many buildings exist), and all edge/
window/road/streak geometry is merged into a small, fixed number of
`LineSegments` batches. Total draw calls stay roughly constant regardless
of city size — this is what keeps it viable on lower-end hardware, where
draw-call count (not raw triangle count) is usually the real bottleneck.

## Known rough edges

- Glitch cubes are an early pass, explicitly flagged for rework.
- There's no bloom/glow post-processing yet — the reference art this is
  based on has heavy bloom; adding it (via `EffectComposer` +
  `UnrealBloomPass`) is the single highest-impact remaining visual gap,
  but also meaningfully more expensive to run, especially on older GPUs.
- This file split was done and syntax/import-checked carefully, but
  wasn't executed in an actual browser from the environment it was
  written in (no headless browser available there) — if something
  doesn't load correctly, check the browser console first; it's more
  likely an import typo than a logic error, since the generation logic
  itself is carried over from a version that was tested and working.
