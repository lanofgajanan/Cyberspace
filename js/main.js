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
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1800);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
canvasWrap.appendChild(renderer.domElement);
const cameraControls = createCameraControls(camera, renderer.domElement, { targetY: 10, radius: 330, azimuth: 0.6, polar: 1.05, panLimit: 330 });
const replay = createCameraReplay(cameraControls);
const lifecycle = createLifecycle(({ mode }) => {
  resetSeed(mode === "megacity" ? 4242 : 1337);
  const cityData = mode === "megacity" ? generateMegacity(4242) : generateCity();
  const glitchCubes = mode === "megacity" ? [] : generateGlitchCubes(cityData.buildingBoxes);
  const sceneObjects = buildScene(scene, cityData, glitchCubes);
  document.getElementById("stats").textContent = cityData.stats;
  cameraControls.setReplayPose(null);
  return {
    update: (dt) => sceneObjects.update(dt),
    dispose: () => sceneObjects.dispose(),
    sceneObjects,
    cityData,
  };
});

function selectMode(mode) {
  lifecycle.init({ mode });
  cameraControls.clearReplayPose();
  document.getElementById("mode-status").textContent = mode === "megacity" ? "megacity / vertical slice" : "legacy city";
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById("mode-select").addEventListener("change", (e) => selectMode(e.target.value));
document.getElementById("loading").hidden = true;
selectMode(document.getElementById("mode-select").value);
const ui = wireUI(() => lifecycle.active && lifecycle.active.sceneObjects, cameraControls, replay);

let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  cameraControls.tick();
  replay.update(dt);
  lifecycle.update(dt);
  if (ui.getShowingDots() && lifecycle.active) {
    const objects = lifecycle.active.sceneObjects;
    objects.denseDotView.visible = cameraControls.isFlying() || cameraControls.getRadius() < objects.DENSE_DOT_ZOOM_THRESHOLD;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.cyberspace = { lifecycle, replay, cameraControls };
