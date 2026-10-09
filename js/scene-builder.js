import * as THREE from "three";
import { BG_COLOR, EDGE_COLOR, WINDOW_COLOR, ACCENT_COLOR, GROUND_COLOR, blendedColor } from "./colors.js";
import { subdivideToPoints, generateFillPoints, buildStreakVertexData } from "./streaks.js";
import { facePoint } from "./geometry.js";

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

function pseudoNoise(seed, step) {
  const n = Math.sin(seed * 12.9898 + step * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function buildGlitchMesh(glitchCubes, initialDensity = 0.65) {
  if (!glitchCubes || glitchCubes.length === 0) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: EDGE_COLOR, fog: true }),
      1
    );
    mesh.count = 0;
    mesh.visible = false;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }
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
  const targetCount = Math.max(0, Math.min(glitchCubes.length, Math.round(glitchCubes.length * initialDensity)));
  mesh.count = targetCount;
  mesh.visible = targetCount > 0;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

function buildTerrainMesh(terrain) {
  if (!terrain) return { meshes: [], material: null };
  const material = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true, side: THREE.DoubleSide });
  const meshes = terrain.chunks.map((chunk) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(chunk.positions, 3));
    geometry.setIndex(chunk.indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  });
  return { meshes, material };
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
  if (cityData.terrainEdgeVerts) {
    for (let i = 0; i < cityData.terrainEdgeVerts.length; i += 3) {
      positions.push(cityData.terrainEdgeVerts[i], cityData.terrainEdgeVerts[i + 1], cityData.terrainEdgeVerts[i + 2]);
      colors.push(cityData.terrainEdgeColors[i], cityData.terrainEdgeColors[i + 1], cityData.terrainEdgeColors[i + 2]);
    }
  }
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
  scene.fog = new THREE.Fog(BG_COLOR, 260, 3600);

  const buildingMesh = buildBuildingMesh(cityData.buildingBoxes);
  scene.add(buildingMesh);

  const glitchMesh = buildGlitchMesh(glitchCubes);
  scene.add(glitchMesh);

  const terrainMesh = buildTerrainMesh(cityData.terrain);
  terrainMesh.meshes.forEach((mesh) => scene.add(mesh));

  const { positions: mergedPositions, colors: mergedColors } = buildMergedLineData(cityData);
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, fog: true });
  const lineView = makeLineSegments(mergedPositions, mergedColors, lineMat);
  scene.add(lineView);
  const heatmapView = makeLineSegments(
    cityData.terrainHeatmapVerts || [],
    cityData.terrainHeatmapColors || [],
    new THREE.LineBasicMaterial({ vertexColors: true, fog: true })
  );
  const slopeView = makeLineSegments(
    cityData.terrainSlopeVerts || [],
    cityData.terrainSlopeColors || [],
    new THREE.LineBasicMaterial({ vertexColors: true, fog: true })
  );
  heatmapView.visible = false;
  slopeView.visible = false;
  scene.add(heatmapView, slopeView);
  const trafficLine = cityData.trafficVerts ? makeTrafficLine(cityData.trafficVerts) : null;
  if (trafficLine) scene.add(trafficLine);
  const blackwallLine = cityData.blackwallVerts
    ? makeLineSegments(cityData.blackwallVerts, cityData.blackwallVerts.map((_, i) => i % 3 === 0 ? 1 : 0.08), new THREE.LineBasicMaterial({ color: 0xff2020, fog: true }))
    : null;
  if (blackwallLine) scene.add(blackwallLine);
  const blackwallMesh = cityData.blackwallRadius
    ? new THREE.Mesh(
      new THREE.CylinderGeometry(cityData.blackwallRadius, cityData.blackwallRadius, cityData.blackwallHeight || 62, 72, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: true, opacity: 1 })
    )
    : null;
  const blackwallGroundMesh = cityData.blackwallRadius
    ? new THREE.Mesh(
      new THREE.CylinderGeometry(cityData.blackwallRadius, cityData.blackwallRadius, 0.2, 72),
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false })
    )
    : null;
  if (blackwallMesh) {
    blackwallMesh.position.y = (cityData.blackwallHeight || 62) / 2 + 2;
    blackwallMesh.frustumCulled = false;
    scene.add(blackwallMesh);
  }
  if (blackwallGroundMesh) {
    blackwallGroundMesh.position.y = -0.2;
    blackwallGroundMesh.frustumCulled = false;
    scene.add(blackwallGroundMesh);
  }

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

  let glitchUserVisible = true;
  const glitchAnimConfig = {
    speedScale: 1.0,
    extrudeScale: 1.0,
    sizeScale: 1.0,
    densityScale: 0.65,
    jitterScale: 1.0,
  };
  let glitchTime = 0;
  let glitchNeedsStaticUpdate = false;

  function updateGlitchCubes(dt) {
    if (!glitchMesh || !glitchMesh.visible || !glitchCubes || glitchCubes.length === 0 || glitchMesh.count === 0) return;
    if (glitchAnimConfig.speedScale <= 0 && !glitchNeedsStaticUpdate) return;
    glitchNeedsStaticUpdate = false;

    glitchTime += dt * glitchAnimConfig.speedScale;
    const t = glitchTime;
    const extrudeScale = glitchAnimConfig.extrudeScale;
    const sizeScale = glitchAnimConfig.sizeScale;
    const jitterScale = glitchAnimConfig.jitterScale;
    const activeCount = Math.min(glitchMesh.count, glitchCubes.length);

    for (let i = 0; i < activeCount; i++) {
      const g = glitchCubes[i];
      if (!g.b) continue;

      const tau = t * g.burstFreq + g.seed;
      const cycle = tau % 1.0;
      const epoch = Math.floor(tau);

      const eRand0 = pseudoNoise(g.seed, epoch);
      const eRand1 = pseudoNoise(g.seed, epoch + 41.3);
      const eRand2 = pseudoNoise(g.seed, epoch + 83.7);

      let curU = g.baseU;
      let curY = g.baseY;
      let extrude = 0;
      let curSize = g.baseSize * sizeScale;
      let curRy = g.baseRy;

      if (cycle < 0.52) {
        // --- PHASE 1: DORMANT / FLUSH (52% of cycle) ---
        // Sits flush on building facade with occasional micro-vibrations
        const microHum = pseudoNoise(g.seed, Math.floor(t * 15)) > 0.82
          ? (pseudoNoise(g.seed, Math.floor(t * 30)) - 0.5) * 0.05 * jitterScale
          : 0;
        extrude = microHum;
        curU += microHum;
      } else if (cycle < 0.64) {
        // --- PHASE 2: PRE-BURST CORRUPT STUTTER (12% of cycle) ---
        // Rapid high-frequency digital noise & scale blink before bursting out
        const fastStep = Math.floor(t * g.stutterSpeed);
        const jitterU = (pseudoNoise(g.seed, fastStep) - 0.5) * 0.22 * jitterScale;
        const jitterY = (pseudoNoise(g.seed, fastStep + 17) - 0.5) * 0.22 * jitterScale;
        curU += jitterU;
        curY += jitterY;

        extrude = ((cycle - 0.52) / 0.12) * 0.4 * extrudeScale;
        const blink = pseudoNoise(g.seed, fastStep + 9) > 0.25 ? 1.0 : 0.35;
        curSize *= blink;
      } else if (cycle < 0.88) {
        // --- PHASE 3: FULL CYBERSPACE GLITCH POP & QUANTIZED TELEPORT (24% of cycle) ---
        // Pop out of wall in sharp geometric relief
        const popWave = Math.sin((cycle - 0.64) / 0.24 * Math.PI);
        const fastStep = Math.floor(t * g.stutterSpeed);
        const popJitter = (pseudoNoise(g.seed, fastStep) - 0.5) * 0.15 * jitterScale;
        extrude = (0.25 + popWave * g.extrudeMax + popJitter) * extrudeScale;

        // Discrete voxel/grid jumping along building facade
        const gridU = Math.floor((eRand0 - 0.5) * 6) * 0.35;
        const gridY = Math.floor((eRand1 - 0.5) * 5) * 0.45;
        const stepJitterX = (pseudoNoise(g.seed, fastStep + 5) - 0.5) * 0.25 * jitterScale;
        const stepJitterY = (pseudoNoise(g.seed, fastStep + 11) - 0.5) * 0.25 * jitterScale;
        curU = g.baseU + gridU + stepJitterX;
        curY = g.baseY + gridY + stepJitterY;

        // Discrete 90-degree snap rotations
        const rotStep = Math.floor(eRand2 * 4) * (Math.PI / 2);
        curRy = g.baseRy + rotStep;

        // Expanded glitch packet size with occasional frame drops
        const packetPulse = 1.15 + popWave * 0.45;
        const dropFrame = pseudoNoise(g.seed, fastStep + 23) < 0.12 ? 0.2 : 1.0;
        curSize *= packetPulse * dropFrame;
      } else {
        // --- PHASE 4: GLITCH COLLAPSE / REABSORPTION (12% of cycle) ---
        // Snaps back into the wall facade with settling jitter
        const fade = 1.0 - (cycle - 0.88) / 0.12;
        const fastStep = Math.floor(t * 22);
        const settleJitter = (pseudoNoise(g.seed, fastStep) - 0.5) * 0.1 * fade * jitterScale;
        extrude = fade * 0.3 * extrudeScale + settleJitter;
        curU += settleJitter;
      }

      curU = Math.max(-g.faceLen / 2 + 0.2, Math.min(g.faceLen / 2 - 0.2, curU));
      curY = Math.max(-g.b.h / 2 + 0.5, Math.min(g.b.h / 2 - 0.5, curY));
      const curN = g.faceNormalOffset + extrude;

      const pos = facePoint(g.b, g.face, curU, curY, curN);

      tempObj.position.set(pos[0], pos[1], pos[2]);
      tempObj.rotation.set(0, curRy, 0);
      tempObj.scale.set(curSize, curSize, curSize);
      tempObj.updateMatrix();
      glitchMesh.setMatrixAt(i, tempObj.matrix);
    }
    glitchMesh.instanceMatrix.needsUpdate = true;
  }

  const DENSE_DOT_ZOOM_THRESHOLD = 150; // camera radius below this = "zoomed in enough" to show fill

  return {
    scene, buildingMesh, glitchMesh, lineView, trafficLine, blackwallLine, blackwallMesh, blackwallGroundMesh,
    terrainMesh, heatmapView, slopeView,
    sparseDotView, get denseDotView() { return denseDotView; }, ensureDenseDotView,
    get denseBuildMs() { return denseBuildMs; }, streakMat, DENSE_DOT_ZOOM_THRESHOLD,
    update: (dt) => {
      if (trafficLine) trafficLine.userData.tick(dt);
      updateGlitchCubes(dt);
    },
    setGlitchSpeedScale: (v) => { glitchAnimConfig.speedScale = v; glitchNeedsStaticUpdate = true; },
    setGlitchExtrudeScale: (v) => { glitchAnimConfig.extrudeScale = v; glitchNeedsStaticUpdate = true; },
    setGlitchSizeScale: (v) => { glitchAnimConfig.sizeScale = v; glitchNeedsStaticUpdate = true; },
    setGlitchDensityScale: (v) => {
      glitchAnimConfig.densityScale = v;
      if (v > 0) glitchUserVisible = true;
      if (glitchMesh && glitchCubes) {
        const targetCount = Math.max(0, Math.min(glitchCubes.length, Math.round(glitchCubes.length * v)));
        glitchMesh.count = targetCount;
        glitchMesh.visible = glitchUserVisible && targetCount > 0;
        glitchMesh.instanceMatrix.needsUpdate = true;
      }
      glitchNeedsStaticUpdate = true;
    },
    setGlitchJitterScale: (v) => { glitchAnimConfig.jitterScale = v; glitchNeedsStaticUpdate = true; },
    setGlitchVisible: (visible) => {
      glitchUserVisible = visible;
      if (glitchMesh && glitchCubes) {
        glitchMesh.visible = glitchUserVisible && glitchMesh.count > 0;
      }
    },
    isGlitchVisible: () => glitchUserVisible && !!glitchMesh && glitchMesh.visible && glitchMesh.count > 0,
    dispose: () => {
      scene.remove(buildingMesh, glitchMesh, lineView, heatmapView, slopeView, sparseDotView);
      terrainMesh.meshes.forEach((mesh) => scene.remove(mesh));
      if (denseDotView) scene.remove(denseDotView);
      if (trafficLine) scene.remove(trafficLine);
      if (blackwallLine) scene.remove(blackwallLine);
      if (blackwallMesh) scene.remove(blackwallMesh);
      if (blackwallGroundMesh) scene.remove(blackwallGroundMesh);
      [buildingMesh, glitchMesh, lineView, heatmapView, slopeView, trafficLine, blackwallLine, blackwallMesh, blackwallGroundMesh].filter(Boolean).forEach((obj) => {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose()); else obj.material.dispose();
      });
      terrainMesh.meshes.forEach((mesh) => mesh.geometry.dispose());
      if (terrainMesh.material) terrainMesh.material.dispose();
      [sparseDotView, denseDotView].filter(Boolean).forEach((obj) => obj.geometry.dispose());
      streakMat.dispose();
    },
  };
}
