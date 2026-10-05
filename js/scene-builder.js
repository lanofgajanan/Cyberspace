import * as THREE from "three";
import { BG_COLOR, EDGE_COLOR, WINDOW_COLOR, ACCENT_COLOR, GROUND_COLOR, blendedColor } from "./colors.js";
import { subdivideToPoints, generateFillPoints, buildStreakVertexData } from "./streaks.js";

const tempObj = new THREE.Object3D();

// All building solids become ONE THREE.InstancedMesh — one draw call for
// every building in the city, regardless of count. This (plus the merged
// line batch below) is what keeps draw-call count roughly constant no
// matter how large the city grid gets, which matters a lot on lower-end
// hardware — see the project README for the fuller performance writeup.
function buildBuildingMesh(buildingBoxes) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    buildingBoxes.length
  );
  buildingBoxes.forEach((b, i) => {
    tempObj.position.set(b.x, b.cy, b.z);
    tempObj.rotation.set(0, b.ry, 0);
    tempObj.scale.set(b.w, b.h, b.d);
    tempObj.updateMatrix();
    mesh.setMatrixAt(i, tempObj.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // instances live all over the map; the unit-box bounds would cull wrongly
  return mesh;
}

function buildGlitchMesh(glitchCubes) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: EDGE_COLOR, fog: true }),
    glitchCubes.length
  );
  glitchCubes.forEach((g, i) => {
    tempObj.position.set(g.x, g.y, g.z);
    tempObj.rotation.set(0, g.ry, 0);
    tempObj.scale.set(g.size, g.size, g.size);
    tempObj.updateMatrix();
    mesh.setMatrixAt(i, tempObj.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// Merges the 5 separate line layers (edges/windows/accents/ground/
// centerline) into ONE draw call. Each layer previously had its own
// opacity, blended by the GPU every frame — since everything here only
// ever sits in front of the same flat fog/background color, that blend
// can be computed ONCE per vertex at build time instead (standard alpha
// compositing: result = alpha*fg + (1-alpha)*bg, per channel) and baked
// straight into an opaque vertex color.
function buildMergedLineData(cityData) {
  const positions = [];
  const colors = [];
  function appendLayer(verts, hex, alpha) {
    const rgb = blendedColor(hex, alpha);
    for (let i = 0; i < verts.length; i += 3) {
      positions.push(verts[i], verts[i + 1], verts[i + 2]);
      colors.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  appendLayer(cityData.edgeVerts, EDGE_COLOR, 0.9);
  appendLayer(cityData.windowVerts, WINDOW_COLOR, 0.7);
  appendLayer(cityData.accentVerts, ACCENT_COLOR, 1);
  appendLayer(cityData.groundVerts, GROUND_COLOR, 0.8);
  appendLayer(cityData.centerlineVerts, GROUND_COLOR, 0.45);
  (cityData.districtAccentLayers || []).forEach((layer) => appendLayer(layer.verts, layer.color, 0.92));
  return { positions, colors };
}

function makeLineSegments(positions, colors, material) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.LineSegments(geom, material);
}

function makeTrafficLine(verts) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: "uniform float time; varying float pulse; void main(){ pulse=fract((position.x+position.z)*0.012+time*0.7); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "varying float pulse; void main(){ float glow=0.35+0.65*smoothstep(0.0,1.0,pulse); gl_FragColor=vec4(1.0,0.25+glow*0.25,0.08,1.0); }",
  });
  const line = new THREE.LineSegments(geom, material);
  line.userData.tick = (dt) => { material.uniforms.time.value += dt; };
  return line;
}

// Builds every renderable object for the scene and returns references
// the UI/animation loop need to toggle visibility, adjust fog, etc.
// Total draw calls: 2 instanced meshes (buildings + glitch cubes) + line
// view + sparse streaks + dense streaks (only 2 of those 3 ever visible
// at once) = up to 4, regardless of city size.
export function buildScene(scene, cityData, glitchCubes) {
  scene.background = new THREE.Color(BG_COLOR);
  scene.fog = new THREE.Fog(BG_COLOR, 260, 1500);

  const buildingMesh = buildBuildingMesh(cityData.buildingBoxes);
  scene.add(buildingMesh);

  const glitchMesh = buildGlitchMesh(glitchCubes);
  scene.add(glitchMesh);

  const { positions: mergedPositions, colors: mergedColors } = buildMergedLineData(cityData);
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, fog: true });
  const lineView = makeLineSegments(mergedPositions, mergedColors, lineMat);
  scene.add(lineView);
  const trafficLine = cityData.trafficVerts ? makeTrafficLine(cityData.trafficVerts) : null;
  if (trafficLine) scene.add(trafficLine);
  const blackwallLine = cityData.blackwallVerts
    ? makeLineSegments(cityData.blackwallVerts, cityData.blackwallVerts.map((_, i) => i % 3 === 0 ? 1 : 0.08), new THREE.LineBasicMaterial({ color: 0xff2020, fog: true }))
    : null;
  if (blackwallLine) scene.add(blackwallLine);

  // Two-tier dot/streak system: a coarse "sparse" layer is always shown
  // in dot mode (reads as a light outline from any distance — this is
  // what was missing before: something genuinely sparse). A fine "dense"
  // layer, which also includes real surface-fill points (not just
  // denser sampling along the same edges), only shows once the camera
  // is close enough — so density visibly increases as you zoom in.
  const streakMat = new THREE.LineBasicMaterial({ vertexColors: true, fog: true });

  const sparsePositions = [];
  const sparseColors = [];
  subdivideToPoints(mergedPositions, mergedColors, 1.4, sparsePositions, sparseColors);
  const sparseStreakData = buildStreakVertexData(sparsePositions, sparseColors, 0.3, 0.9);
  const sparseDotView = makeLineSegments(sparseStreakData.verts, sparseStreakData.vcolors, streakMat);
  sparseDotView.visible = false;
  scene.add(sparseDotView);

  let denseDotView = null;
  let denseBuildMs = 0;
  function ensureDenseDotView() {
    if (denseDotView) return denseDotView;
    const startedAt = performance.now();
    const densePositions = [];
    const denseColors = [];
    subdivideToPoints(mergedPositions, mergedColors, 0.35, densePositions, denseColors);
    generateFillPoints(cityData.buildingBoxes, cityData.CITY_RADIUS, densePositions, denseColors);
    const denseStreakData = buildStreakVertexData(densePositions, denseColors, 0.2, 1.7);
    denseDotView = makeLineSegments(denseStreakData.verts, denseStreakData.vcolors, streakMat);
    denseDotView.visible = false;
    scene.add(denseDotView);
    denseBuildMs = performance.now() - startedAt;
    return denseDotView;
  }

  const DENSE_DOT_ZOOM_THRESHOLD = 150; // camera radius below this = "zoomed in enough" to show fill

  return {
    scene, buildingMesh, glitchMesh, lineView, trafficLine, blackwallLine,
    sparseDotView, get denseDotView() { return denseDotView; }, ensureDenseDotView,
    get denseBuildMs() { return denseBuildMs; }, streakMat, DENSE_DOT_ZOOM_THRESHOLD,
    update: (dt) => { if (trafficLine) trafficLine.userData.tick(dt); },
    dispose: () => {
      scene.remove(buildingMesh, glitchMesh, lineView, sparseDotView);
      if (denseDotView) scene.remove(denseDotView);
      if (trafficLine) scene.remove(trafficLine);
      if (blackwallLine) scene.remove(blackwallLine);
      [buildingMesh, glitchMesh, lineView, trafficLine, blackwallLine].filter(Boolean).forEach((obj) => {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose()); else obj.material.dispose();
      });
      [sparseDotView, denseDotView].filter(Boolean).forEach((obj) => obj.geometry.dispose());
      streakMat.dispose();
    },
  };
}
