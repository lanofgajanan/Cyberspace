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

const canvasWrap = document.getElementById("canvas-wrap");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 4200);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
  throw Object.assign(new Error("WebGL is unavailable in this browser or device."), { code: "E_RENDER_INIT_FAILED", cause: error });
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
canvasWrap.appendChild(renderer.domElement);
const cameraControls = createCameraControls(camera, renderer.domElement, { targetY: 18, radius: 520, azimuth: 0.6, polar: 1.05, panLimit: 430 });
const replay = createCameraReplay(cameraControls);
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
  document.getElementById("stats").textContent = cityData.stats;
  if (mode === "megacity" && cityData.diagnostics && cityData.diagnostics.terrain) {
    const terrainCheck = cityData.diagnostics.terrain;
    const selfCheck = `PHASE 1 TERRAIN · levels ${terrainCheck.terraceLevels} · components ${terrainCheck.components} · max slope ${terrainCheck.maxSlope.toFixed(3)} · chunks ${terrainCheck.chunkCount} · camera-ground: unavailable (free camera)`;
    console.info(selfCheck, terrainCheck);
    document.getElementById("stats").textContent = `${cityData.stats} · ${selfCheck}`;
    document.getElementById("diagnostics").textContent = "status: ready · Phase 1 terrain self-check emitted · camera-ground unavailable (free camera)";
  }
  document.getElementById("runtime-stats").textContent =
    `FPS: -- · draw calls: -- · segments: ${cityData.roadList ? cityData.roadList.length : 0} · generation: ${Math.round(generationMs)}ms`;
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
let selectedMode = modeSelect.value;
let loadRequest = 0;

function setLoadingProgress(value, status) {
  const progress = Math.max(0, Math.min(100, value));
  loadingProgress.style.width = `${progress}%`;
  progressBar.setAttribute("aria-valuenow", String(progress));
  loadingStatus.textContent = status;
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
    // A throttled/background tab may not deliver a frame promptly.
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
  modeSelect.disabled = true;
  loading.hidden = false;
  loading.classList.remove("is-hidden");
  loadingError.hidden = true;
  loadingRetry.hidden = true;
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
    document.getElementById("mode-status").textContent = mode === "megacity" ? "megacity / full scale" : "legacy city";
    const heatmapToggle = document.getElementById("terrain-heatmap-toggle");
    const slopeToggle = document.getElementById("terrain-slope-toggle");
    if (heatmapToggle) heatmapToggle.hidden = mode !== "megacity";
    if (slopeToggle) slopeToggle.hidden = mode !== "megacity";
    document.getElementById("diagnostics").textContent =
      mode === "megacity" && active.cityData.diagnostics && active.cityData.diagnostics.terrain
        ? "status: ready · Phase 1 terrain self-check emitted · camera-ground unavailable (free camera)"
        : `status: ready · seed ${active.cityData.seed || "runtime"} · ${Math.round(active.generationMs)}ms · dense dots deferred`;
    setLoadingProgress(100, "City ready");
    // Complete synchronously after the ready state; waiting for another frame
    // can strand the overlay at "City ready" in throttled pages.
    window.cyberspaceLoading.ready();
  } catch (error) {
    if (request !== loadRequest) return;
    const details = getErrorDetails(error, "E_MODE_LOAD_FAILED");
    loadingError.textContent = `${details.code}: ${details.message}`;
    loadingError.hidden = false;
    loadingRetry.hidden = false;
    setLoadingProgress(0, "Generation stopped");
    document.getElementById("diagnostics").textContent = `status: error · ${details.code}`;
    window.cyberspaceLoading.fail(`${details.code}: ${details.message}`);
  } finally {
    if (request === loadRequest) modeSelect.disabled = false;
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

modeSelect.addEventListener("change", (e) => selectMode(e.target.value));
loadingRetry.addEventListener("click", () => selectMode(selectedMode));
const ui = wireUI(() => lifecycle.active && lifecycle.active.sceneObjects, cameraControls, replay, camera);

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
    if (needsDense) objects.ensureDenseDotView().visible = true;
    if (objects.denseDotView) objects.denseDotView.visible = needsDense;
    if (objects.denseBuildMs) {
      document.getElementById("diagnostics").textContent =
        `status: ready · ${Math.round(objects.denseBuildMs)}ms dense dots`;
    }
  }
  renderer.render(scene, camera);
  statsFrameCount += 1;
  if (now - statsLastAt >= 500) {
    const active = lifecycle.active;
    const fps = statsFrameCount * 1000 / (now - statsLastAt);
    const segments = active && active.cityData && active.cityData.roadList ? active.cityData.roadList.length : 0;
    const generation = active ? `${Math.round(active.generationMs)}ms` : "--";
    document.getElementById("runtime-stats").textContent =
      `FPS: ${Math.round(fps)} · draw calls: ${renderer.info.render.calls} · segments: ${segments} · generation: ${generation}`;
    statsFrameCount = 0;
    statsLastAt = now;
  }
}
requestAnimationFrame(animate);

window.cyberspace = { lifecycle, replay, cameraControls };
selectMode(modeSelect.value);
