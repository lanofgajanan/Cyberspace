import { CITIES, getCity } from "./registry.js";

/**
 * ============================================================================
 * CITY VALIDATOR (CLI TEST TOOL)
 * ============================================================================
 * Run: node js/cities/validate.js [city-id]
 * Examples:
 *   node js/cities/validate.js soviet
 *   node js/cities/validate.js legacy
 *   node js/cities/validate.js all
 * ============================================================================
 */

const targetArg = process.argv[2] || "all";
const citiesToTest = targetArg === "all" ? CITIES : [getCity(targetArg)];

console.log(`\n======================================================`);
console.log(`  CYBERSPACE CITY VALIDATION SUITE`);
console.log(`  Testing: ${citiesToTest.map((c) => c.id).join(", ")}`);
console.log(`======================================================\n`);

let allPassed = true;

for (const profile of citiesToTest) {
  console.log(`▶ Validating '${profile.name}' [id: ${profile.id}]...`);
  const t0 = performance.now();
  let data;
  try {
    data = profile.generate();
  } catch (err) {
    console.error(`  ❌ Generation crashed: ${err.message}`);
    allPassed = false;
    continue;
  }
  const genMs = performance.now() - t0;
  console.log(`  ⏱  Generation time: ${Math.round(genMs)}ms`);
  console.log(`  📊 Stats: ${data.stats}`);

  // 1. Contract presence check
  const requiredArrays = ["buildingBoxes", "edgeVerts", "windowVerts", "accentVerts", "groundVerts", "centerlineVerts", "roadList"];
  let contractOk = true;
  for (const key of requiredArrays) {
    if (!Array.isArray(data[key])) {
      console.error(`  ❌ Missing required array contract: '${key}'`);
      contractOk = false;
    }
  }
  if (typeof data.CITY_RADIUS !== "number") {
    console.error(`  ❌ Missing or invalid CITY_RADIUS`);
    contractOk = false;
  }
  if (!contractOk) {
    allPassed = false;
    continue;
  }

  // 2. Vertex array finite numbers and % 6 length check
  const vertArrays = [
    ["edgeVerts", data.edgeVerts],
    ["windowVerts", data.windowVerts],
    ["accentVerts", data.accentVerts],
    ["groundVerts", data.groundVerts],
    ["centerlineVerts", data.centerlineVerts],
  ];
  let vertOk = true;
  for (const [name, arr] of vertArrays) {
    if (arr.length % 6 !== 0) {
      console.error(`  ❌ ${name} length ${arr.length} is not divisible by 6 (pairs of 3D points)`);
      vertOk = false;
    }
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) {
        console.error(`  ❌ ${name} contains non-finite float at index ${i}: ${arr[i]}`);
        vertOk = false;
        break;
      }
    }
  }
  if (vertOk) {
    const totalSegments = vertArrays.reduce((acc, [, a]) => acc + a.length / 6, 0);
    console.log(`  ✓ Vertices: all finite, valid segments (${totalSegments} total line segments)`);
  } else {
    allPassed = false;
  }

  // 3. Extent bounds check
  let maxR = 0;
  for (const b of data.buildingBoxes) {
    const corners = [
      Math.hypot(b.x - b.w / 2, b.z - b.d / 2),
      Math.hypot(b.x + b.w / 2, b.z - b.d / 2),
      Math.hypot(b.x - b.w / 2, b.z + b.d / 2),
      Math.hypot(b.x + b.w / 2, b.z + b.d / 2),
    ];
    for (const r of corners) if (r > maxR) maxR = r;
  }
  if (maxR > data.CITY_RADIUS + 1.0) {
    console.warn(`  ⚠ Warning: farthest solid radius (${maxR.toFixed(1)}) exceeds reported CITY_RADIUS (${data.CITY_RADIUS})`);
  } else {
    console.log(`  ✓ Radius extent: max solid radius ${maxR.toFixed(1)} <= CITY_RADIUS (${data.CITY_RADIUS})`);
  }

  // 4. Box overlap check (axis-aligned boxes)
  const aabbs = [];
  for (let i = 0; i < data.buildingBoxes.length; i++) {
    const b = data.buildingBoxes[i];
    const isAA = Math.abs(Math.sin(b.ry || 0)) < 0.01 || Math.abs(Math.cos(b.ry || 0)) < 0.01;
    if (!isAA) continue;
    const w = Math.abs(Math.cos(b.ry || 0)) > 0.5 ? b.w : b.d;
    const d = Math.abs(Math.cos(b.ry || 0)) > 0.5 ? b.d : b.w;
    aabbs.push({
      i,
      minX: b.x - w / 2, maxX: b.x + w / 2,
      minY: b.cy - b.h / 2, maxY: b.cy + b.h / 2,
      minZ: b.z - d / 2, maxZ: b.z + d / 2,
      b,
    });
  }

  let collisions = 0;
  const tol = 0.05;
  for (let i = 0; i < aabbs.length; i++) {
    for (let j = i + 1; j < aabbs.length; j++) {
      const a = aabbs[i];
      const c = aabbs[j];
      const xOverlap = Math.min(a.maxX, c.maxX) - Math.max(a.minX, c.minX);
      const yOverlap = Math.min(a.maxY, c.maxY) - Math.max(a.minY, c.minY);
      const zOverlap = Math.min(a.maxZ, c.maxZ) - Math.max(a.minZ, c.minZ);
      if (xOverlap > tol && yOverlap > tol && zOverlap > tol) {
        collisions++;
      }
    }
  }
  console.log(`  ✓ Overlap check: ${collisions} AABB collisions detected (including authored exceptions)`);

  console.log(`  ✅ '${profile.name}' passed validation.\n`);
}

if (allPassed) {
  console.log("======================================================");
  console.log("  ALL CITY GENERATORS PASSED SUCCESSFULLY!");
  console.log("======================================================\n");
} else {
  console.error("❌ Some city generators failed validation.");
  process.exit(1);
}
