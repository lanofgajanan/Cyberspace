import * as THREE from "three";
import { resetSeed } from "./rng.js";
import { generateCity } from "./city-generator.js";
import { generateGlitchCubes } from "./glitch-cubes.js";
import { buildScene } from "./scene-builder.js";
import { createCameraControls } from "./camera-controls.js";
import { wireUI } from "./ui.js";

resetSeed(1337); // fixed seed: same city every load, so you can actually iterate on one layout

const canvasWrap = document.getElementById("canvas-wrap");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1800);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
canvasWrap.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- generate + build ----------
const cityData = generateCity();
const glitchCubes = generateGlitchCubes(cityData.buildingBoxes);
const sceneObjects = buildScene(scene, cityData, glitchCubes);

document.getElementById("stats").textContent = cityData.stats;

const cameraControls = createCameraControls(camera, renderer.domElement, {
  targetY: 10,
  radius: 330,
  azimuth: 0.6,
  polar: 1.05,
  panLimit: cityData.CITY_RADIUS,
});

const ui = wireUI(sceneObjects, cameraControls);

function animate() {
  requestAnimationFrame(animate);
  cameraControls.tick();
  // dot density scales with zoom: dense/fill layer only shows once close enough
  if (ui.getShowingDots()) {
    sceneObjects.denseDotView.visible = cameraControls.getRadius() < sceneObjects.DENSE_DOT_ZOOM_THRESHOLD;
  }
  renderer.render(scene, camera);
}
animate();
