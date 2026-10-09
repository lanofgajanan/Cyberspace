import * as THREE from "three";
import { resetSeed } from "./rng.js";
import { generateCity } from "./city-generator.js";
import { generateMegacity } from "./megacity-generator.js";
import { generateGlitchCubes } from "./glitch-cubes.js";
import { buildScene } from "./scene-builder.js";
import { createCameraControls } from "./camera-controls.js";
import { createCameraReplay } from "./camera-replay.js";
import { wireUI } from "./ui.js";
import { createLifecycle } from "./lifecycle.js";

const viewportContainer = document.getElementById("viewport-container");
const canvasWrap = document.getElementById("canvas-wrap");
const scene = new THREE.Scene();
const initialW = viewportContainer ? viewportContainer.clientWidth || window.innerWidth : window.innerWidth;
const initialH = viewportContainer ? viewportContainer.clientHeight || window.innerHeight : window.innerHeight;
const camera = new THREE.PerspectiveCamera(55, initialW / initialH, 0.5, 4200);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch (error) {
  throw Object.assign(new Error("WebGL is unavailable in this browser or device."), { code: "E_RENDER_INIT_FAILED", cause: error });
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(initialW, initialH);
canvasWrap.appendChild(renderer.domElement);
const cameraControls = createCameraControls(camera, renderer.domElement, { targetY: 18, radius: 520, azimuth: 0.6, polar: 1.05, panLimit: 430 });
const replay = createCameraReplay(cameraControls, scene);
const lifecycle = createLifecycle(({ mode, onProgress }) => {
  resetSeed(mode === "megacity" ? 4242 : 1337);
  let cityData;
  const generationStartedAt = performance.now();
  try {
    cityData = mode === "megacity" ? generateMegacity(4242) : generateCity();
  } catch (error) {
    throw Object.assign(new Error("The city generator failed while creating geometry."), { code: "E_GENERATION_FAILED", cause: error });
  }
  if (onProgress) onProgress(45, "Preparing render geometry");
  let sceneObjects;
  try {
    const glitchCubes = mode === "megacity" ? [] : generateGlitchCubes(cityData.buildingBoxes);
    sceneObjects = buildScene(scene, cityData, glitchCubes);
  } catch (error) {
    throw Object.assign(new Error("The renderer failed while building city geometry."), { code: "E_SCENE_BUILD_FAILED", cause: error });
  }
  const generationMs = performance.now() - generationStartedAt;
  const statsEl = document.getElementById("stats");
  if (statsEl) statsEl.textContent = cityData.stats;
  if (mode === "megacity" && cityData.diagnostics && cityData.diagnostics.terrain) {
    const terrainCheck = cityData.diagnostics.terrain;
    const selfCheck = `PHASE 1 TERRAIN · levels ${terrainCheck.terraceLevels} · components ${terrainCheck.components} · max slope ${terrainCheck.maxSlope.toFixed(3)} · chunks ${terrainCheck.chunkCount} · camera-ground: unavailable (free camera)`;
    console.info(selfCheck, terrainCheck);
    if (statsEl) statsEl.textContent = `${cityData.stats} · ${selfCheck}`;
    const diagEl = document.getElementById("diagnostics");
    if (diagEl) diagEl.textContent = "status: ready · Phase 1 terrain self-check emitted · camera-ground unavailable (free camera)";
  }
  const runtimeStatsEl = document.getElementById("runtime-stats");
  if (runtimeStatsEl) {
    runtimeStatsEl.textContent =
      `FPS: -- · draw calls: -- · segments: ${cityData.roadList ? cityData.roadList.length : 0} · generation: ${Math.round(generationMs)}ms`;
  }
  cameraControls.setReplayPose(null);
  return {
    update: (dt) => sceneObjects.update(dt),
    dispose: () => sceneObjects.dispose(),
    sceneObjects,
    cityData,
    generationMs,
  };
});

const loading = document.getElementById("loading");
const loadingProgress = document.getElementById("loading-progress");
const loadingStatus = document.getElementById("loading-status");
const loadingError = document.getElementById("loading-error");
const loadingRetry = document.getElementById("loading-retry");
const modeSelect = document.getElementById("mode-select");
const progressBar = document.querySelector(".progress-track");
let selectedMode = modeSelect ? modeSelect.value : "legacy";
let loadRequest = 0;

function setLoadingProgress(value, status) {
  const progress = Math.max(0, Math.min(100, value));
  if (loadingProgress) loadingProgress.style.width = `${progress}%`;
  if (progressBar) progressBar.setAttribute("aria-valuenow", String(progress));
  if (loadingStatus) loadingStatus.textContent = status;
}

function nextFrame() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 120);
  });
}

function getErrorDetails(error, fallbackCode) {
  const code = error && error.code ? error.code : fallbackCode;
  const message = error && error.message ? error.message : "The city could not be generated.";
  return { code, message };
}

async function selectMode(mode) {
  const request = ++loadRequest;
  selectedMode = mode;
  if (modeSelect) modeSelect.disabled = true;
  if (loading) {
    loading.hidden = false;
    loading.classList.remove("is-hidden");
  }
  if (loadingError) loadingError.hidden = true;
  if (loadingRetry) loadingRetry.hidden = true;
  setLoadingProgress(5, "Preparing renderer");
  await nextFrame();
  if (request !== loadRequest) return;
  try {
    setLoadingProgress(20, mode === "megacity" ? "Seeding megacity districts" : "Seeding legacy road network");
    await nextFrame();
    if (request !== loadRequest) return;
    setLoadingProgress(35, "Generating city geometry");
    const active = lifecycle.init({ mode, onProgress: setLoadingProgress });
    if (!active || !active.cityData) {
      throw Object.assign(new Error("Generator returned no city data."), { code: "E_GENERATION_EMPTY" });
    }
    if (request !== loadRequest) return;
    setLoadingProgress(78, "Building render geometry");
    cameraControls.clearReplayPose();
    if (ui && ui.syncSceneSettings && active.sceneObjects) {
      ui.syncSceneSettings(active.sceneObjects);
    }
    if (ui && ui.syncWorldProfileUI) {
      ui.syncWorldProfileUI(mode);
    }
    const modeStatusEl = document.getElementById("mode-status");
    if (modeStatusEl) modeStatusEl.textContent = mode === "megacity" ? "megacity / full scale" : "legacy city";

    const diagEl = document.getElementById("diagnostics");
    if (diagEl) {
      diagEl.textContent =
        mode === "megacity" && active.cityData.diagnostics && active.cityData.diagnostics.terrain
          ? "status: ready · Phase 1 terrain self-check emitted · camera-ground unavailable (free camera)"
          : `status: ready · seed ${active.cityData.seed || "runtime"} · ${Math.round(active.generationMs)}ms · dense dots deferred`;
    }

    // Update World Card counts
    const chunksEl = document.getElementById("world-card-chunks");
    if (chunksEl) {
      if (mode === "megacity") {
        chunksEl.textContent = "06 / 06";
      } else {
        const blkCount = active.cityData.blocks ? active.cityData.blocks.length : 18;
        chunksEl.textContent = `${blkCount} blk`;
      }
    }

    setLoadingProgress(100, "City ready");
    if (window.cyberspaceLoading) window.cyberspaceLoading.ready();
  } catch (error) {
    if (request !== loadRequest) return;
    const details = getErrorDetails(error, "E_MODE_LOAD_FAILED");
    if (loadingError) {
      loadingError.textContent = `${details.code}: ${details.message}`;
      loadingError.hidden = false;
    }
    if (loadingRetry) loadingRetry.hidden = false;
    setLoadingProgress(0, "Generation stopped");
    const diagEl = document.getElementById("diagnostics");
    if (diagEl) diagEl.textContent = `status: error · ${details.code}`;
    if (window.cyberspaceLoading) window.cyberspaceLoading.fail(`${details.code}: ${details.message}`);
  } finally {
    if (request === loadRequest && modeSelect) modeSelect.disabled = false;
  }
}

function updateViewportSize() {
  const w = viewportContainer ? viewportContainer.clientWidth : window.innerWidth;
  const h = viewportContainer ? viewportContainer.clientHeight : window.innerHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

if (window.ResizeObserver && viewportContainer) {
  const ro = new ResizeObserver(() => updateViewportSize());
  ro.observe(viewportContainer);
}
window.addEventListener("resize", updateViewportSize);

if (modeSelect) modeSelect.addEventListener("change", (e) => selectMode(e.target.value));
if (loadingRetry) loadingRetry.addEventListener("click", () => selectMode(selectedMode));

const ui = wireUI(() => lifecycle.active && lifecycle.active.sceneObjects, cameraControls, replay, camera, renderer);

let last = performance.now();
let statsLastAt = last;
let statsFrameCount = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  cameraControls.tick(dt);
  replay.update(dt);
  lifecycle.update(dt);

  if (ui.getShowingDots() && lifecycle.active) {
    const objects = lifecycle.active.sceneObjects;
    const needsDense = cameraControls.isFlying() || cameraControls.getRadius() < objects.DENSE_DOT_ZOOM_THRESHOLD;
    if (needsDense && objects.ensureDenseDotView) objects.ensureDenseDotView().visible = true;
    if (objects.denseDotView) objects.denseDotView.visible = needsDense;
    if (objects.denseBuildMs) {
      const diagEl = document.getElementById("diagnostics");
      if (diagEl) diagEl.textContent = `status: ready · ${Math.round(objects.denseBuildMs)}ms dense dots`;
    }
  }

  renderer.render(scene, camera);
  statsFrameCount += 1;

  if (now - statsLastAt >= 500) {
    const active = lifecycle.active;
    const fps = (statsFrameCount * 1000) / (now - statsLastAt);
    const segments = active && active.cityData && active.cityData.roadList ? active.cityData.roadList.length : 0;
    const generation = active ? `${Math.round(active.generationMs)}` : "--";

    // Telemetry footer
    const fpsEl = document.getElementById("telemetry-fps");
    if (fpsEl) fpsEl.textContent = Math.round(fps);
    const callsEl = document.getElementById("telemetry-drawcalls");
    if (callsEl) callsEl.textContent = renderer.info.render.calls;
    const genEl = document.getElementById("telemetry-gentime");
    if (genEl) genEl.innerHTML = `${generation} <small>ms</small>`;
    const segsEl = document.getElementById("telemetry-segments");
    if (segsEl) segsEl.textContent = segments;

    // System load metrics in diagnostics panel
    const geomVal = document.getElementById("metric-geometry-val");
    const geomBar = document.getElementById("metric-geometry-bar");
    const gpuVal = document.getElementById("metric-gpu-val");
    const gpuBar = document.getElementById("metric-gpu-bar");

    const geomPct = Math.min(100, Math.max(25, Math.round((segments / 300) * 80)));
    const gpuPct = Math.min(100, Math.max(15, Math.round((renderer.info.render.calls / 18) * 55)));

    if (geomVal) geomVal.textContent = `${geomPct}%`;
    if (geomBar) geomBar.style.width = `${geomPct}%`;
    if (gpuVal) gpuVal.textContent = `${gpuPct}%`;
    if (gpuBar) gpuBar.style.width = `${gpuPct}%`;

    // Camera chip readout
    const camMode = document.getElementById("cam-chip-mode");
    if (camMode) camMode.textContent = cameraControls.isFlying() ? "FLY_01" : "ORBIT_01";
    const camAngle = document.getElementById("cam-chip-angle");
    if (camAngle) camAngle.textContent = `${Math.round(camera.fov)}° FOV`;

    // Backward-compatible runtime stats
    const runtimeStatsEl = document.getElementById("runtime-stats");
    if (runtimeStatsEl) {
      runtimeStatsEl.textContent =
        `FPS: ${Math.round(fps)} · draw calls: ${renderer.info.render.calls} · segments: ${segments} · generation: ${generation}ms`;
    }

    statsFrameCount = 0;
    statsLastAt = now;
  }
}
requestAnimationFrame(animate);

window.cyberspace = { lifecycle, replay, cameraControls, ui };
selectMode(modeSelect ? modeSelect.value : "legacy");
