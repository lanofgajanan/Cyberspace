function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x, z, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = x - x0, tz = z - z0;
  const sx = smoothstep(0, 1, tx), sz = smoothstep(0, 1, tz);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

function ridgedNoise(x, z, seed) {
  let value = 0, amplitude = 0.58, frequency = 0.008, normalizer = 0;
  for (let octave = 0; octave < 4; octave++) {
    const n = valueNoise(x * frequency, z * frequency, seed + octave * 101);
    value += (1 - Math.abs(n * 2 - 1)) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }
  return value / normalizer;
}

function blur(values, cols, rows) {
  const result = new Float32Array(values.length);
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      let total = 0, weight = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = clamp(x + dx, 0, cols - 1), zz = clamp(z + dz, 0, rows - 1);
          const w = dx === 0 && dz === 0 ? 4 : (dx === 0 || dz === 0 ? 2 : 1);
          total += values[zz * cols + xx] * w;
          weight += w;
        }
      }
      result[z * cols + x] = total / weight;
    }
  }
  return result;
}

function colourFor(value, min, max) {
  const t = clamp((value - min) / Math.max(1e-6, max - min), 0, 1);
  return [0.1 + t * 0.9, 0.2 + (1 - Math.abs(t - 0.55) * 1.8) * 0.55, 0.9 - t * 0.62];
}

function appendSegment(positions, colors, a, b, color) {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
}

export function createTerrain(seed = 4242, options = {}) {
  const spacing = options.spacing || 2;
  const minX = options.minX === undefined ? -420 : options.minX;
  const maxX = options.maxX === undefined ? 420 : options.maxX;
  const minZ = options.minZ === undefined ? -420 : options.minZ;
  const maxZ = options.maxZ === undefined ? 420 : options.maxZ;
  const H = 8;
  const riserFraction = 0.15;
  const cols = Math.round((maxX - minX) / spacing) + 1;
  const rows = Math.round((maxZ - minZ) / spacing) + 1;
  const raw = new Float32Array(cols * rows);

  for (let z = 0; z < rows; z++) {
    const worldZ = minZ + z * spacing;
    for (let x = 0; x < cols; x++) {
      const worldX = minX + x * spacing;
      const east = smoothstep(-260, 210, worldX);
      const massif = Math.exp(-(((worldX - 145) / 245) ** 2 + ((worldZ + 5) / 285) ** 2));
      const spurA = Math.exp(-(((worldX - 65) / 260) ** 2 + ((worldZ - 150) / 92) ** 2));
      const spurB = Math.exp(-(((worldX - 5) / 240) ** 2 + ((worldZ + 190) / 110) ** 2));
      const ridge = ridgedNoise(worldX + 41, worldZ - 17, seed ^ 0x6d2b79f5);
      const gully = valueNoise(worldX * 0.012 - 9, worldZ * 0.012 + 13, seed ^ 0x9e3779b9);
      const directional = 0.62 + 0.38 * east;
      const height = (massif * 0.82 + spurA * 0.17 + spurB * 0.14) * directional * 112
        + ridge * (8 + 14 * east) - Math.max(0, gully - 0.68) * 20;
      raw[z * cols + x] = clamp(height * smoothstep(-340, -80, worldX), 0, 120);
    }
  }

  const softened = blur(blur(raw, cols, rows), cols, rows);
  const heights = new Float32Array(softened.length);
  const levels = new Int16Array(softened.length);
  for (let i = 0; i < softened.length; i++) {
    const u = softened[i] / H;
    const base = Math.floor(u);
    const fraction = u - base;
    const terraced = H * (base + smoothstep(riserFraction, 1 - riserFraction, fraction));
    heights[i] = clamp(terraced, 0, 120);
    levels[i] = Math.floor(heights[i] / H + 0.001);
  }

  const visited = new Uint8Array(levels.length);
  const components = [];
  const neighbours = [-1, 1, -cols, cols];
  for (let start = 0; start < levels.length; start++) {
    if (visited[start]) continue;
    const level = levels[start], queue = [start], cells = [];
    visited[start] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const index = queue[qi];
      cells.push(index);
      const x = index % cols, z = Math.floor(index / cols);
      neighbours.forEach((offset) => {
        const next = index + offset;
        if (next < 0 || next >= levels.length || visited[next]) return;
        if ((offset === -1 || offset === 1) && Math.floor(next / cols) !== z) return;
        if (levels[next] !== level) return;
        visited[next] = 1;
        queue.push(next);
      });
    }
    components.push({ level, cells });
  }
  components.forEach((component) => {
    if (component.cells.length >= 10) return;
    const counts = new Map();
    component.cells.forEach((index) => {
      const x = index % cols, z = Math.floor(index / cols);
      neighbours.forEach((offset) => {
        const next = index + offset;
        if (next < 0 || next >= levels.length || (offset === -1 || offset === 1) && Math.floor(next / cols) !== z) return;
        if (levels[next] !== component.level) counts.set(levels[next], (counts.get(levels[next]) || 0) + 1);
      });
    });
    let replacement = component.level, best = 0;
    counts.forEach((count, candidate) => { if (count > best) { best = count; replacement = candidate; } });
    component.cells.forEach((index) => {
      levels[index] = replacement;
      heights[index] = replacement * H;
    });
  });

  const indexAt = (x, z) => clamp(z, 0, rows - 1) * cols + clamp(x, 0, cols - 1);
  function groundHeightAt(x, z) {
    const gx = (x - minX) / spacing, gz = (z - minZ) / spacing;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const tx = gx - x0, tz = gz - z0;
    const a = heights[indexAt(x0, z0)], b = heights[indexAt(x0 + 1, z0)];
    const c = heights[indexAt(x0, z0 + 1)], d = heights[indexAt(x0 + 1, z0 + 1)];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  function slopeAt(x, z) {
    const dx = (groundHeightAt(x + spacing, z) - groundHeightAt(x - spacing, z)) / (spacing * 2);
    const dz = (groundHeightAt(x, z + spacing) - groundHeightAt(x, z - spacing)) / (spacing * 2);
    return Math.hypot(dx, dz);
  }

  const tileCells = Math.round(128 / spacing);
  const chunks = [];
  for (let z0 = 0; z0 < rows - 1; z0 += tileCells) {
    for (let x0 = 0; x0 < cols - 1; x0 += tileCells) {
      const x1 = Math.min(cols - 1, x0 + tileCells), z1 = Math.min(rows - 1, z0 + tileCells);
      const positions = [], indices = [];
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        positions.push(minX + x * spacing, heights[z * cols + x], minZ + z * spacing);
      }
      const width = x1 - x0 + 1;
      for (let z = 0; z < z1 - z0; z++) for (let x = 0; x < x1 - x0; x++) {
        const a = z * width + x, b = a + 1, c = a + width, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      chunks.push({ positions, indices, x: minX + x0 * spacing, z: minZ + z0 * spacing });
    }
  }

  const edgeVerts = [], edgeColors = [];
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    const index = z * cols + x;
    const here = levels[index];
    if (x + 1 < cols && levels[index + 1] !== here) {
      const yTop = Math.max(heights[index], heights[index + 1]) + 0.18;
      const yBottom = Math.min(heights[index], heights[index + 1]) + 0.08;
      const a = [minX + (x + 1) * spacing, yTop, minZ + z * spacing];
      const b = [a[0], yTop, a[2] + spacing];
      const c = [a[0], yBottom, a[2]];
      const d = [a[0], yBottom, a[2] + spacing];
      appendSegment(edgeVerts, edgeColors, a, b, [0.35, 0.95, 1]);
      appendSegment(edgeVerts, edgeColors, c, d, [0.1, 0.55, 0.75]);
    }
    if (z + 1 < rows && levels[index + cols] !== here) {
      const yTop = Math.max(heights[index], heights[index + cols]) + 0.18;
      const yBottom = Math.min(heights[index], heights[index + cols]) + 0.08;
      const a = [minX + x * spacing, yTop, minZ + (z + 1) * spacing];
      const b = [a[0] + spacing, yTop, a[2]];
      const c = [a[0], yBottom, a[2]];
      const d = [a[0] + spacing, yBottom, a[2]];
      appendSegment(edgeVerts, edgeColors, a, b, [0.35, 0.95, 1]);
      appendSegment(edgeVerts, edgeColors, c, d, [0.1, 0.55, 0.75]);
    }
  }

  const heatmapVerts = [], heatmapColors = [], slopeVerts = [], slopeColors = [];
  const debugStep = 4;
  for (let z = 0; z < rows - debugStep; z += debugStep) for (let x = 0; x < cols - debugStep; x += debugStep) {
    const xA = minX + x * spacing, zA = minZ + z * spacing;
    const xB = xA + debugStep * spacing, zB = zA + debugStep * spacing;
    const heatColor = colourFor(heights[z * cols + x], 0, 120);
    const slopeColor = colourFor(slopeAt(xA, zA), 0, 0.35);
    appendSegment(heatmapVerts, heatmapColors, [xA, heights[z * cols + x] + 0.35, zA], [xB, groundHeightAt(xB, zA) + 0.35, zA], heatColor);
    appendSegment(slopeVerts, slopeColors, [xA, heights[z * cols + x] + 0.48, zA], [xA, groundHeightAt(xA, zB) + 0.48, zB], slopeColor);
  }

  let maxSlope = 0;
  for (let z = 0; z < rows; z += 2) for (let x = 0; x < cols; x += 2) {
    maxSlope = Math.max(maxSlope, slopeAt(minX + x * spacing, minZ + z * spacing));
  }
  let minHeight = Infinity, maxHeight = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    minHeight = Math.min(minHeight, heights[i]);
    maxHeight = Math.max(maxHeight, heights[i]);
  }
  const terraceLevels = new Set(Array.from(levels)).size;
  return {
    seed, spacing, H, riserFraction, minX, maxX, minZ, maxZ, cols, rows,
    heights, levels, chunks, edgeVerts, edgeColors, heatmapVerts, heatmapColors, slopeVerts, slopeColors,
    groundHeightAt, slopeAt,
    diagnostics: {
      terraceLevels,
      components: components.length,
      maxSlope,
      chunkCount: chunks.length,
      cacheGrid: `${spacing}m`,
      terrainRange: `${minHeight.toFixed(1)}-${maxHeight.toFixed(1)}m`,
    },
  };
}
