// No external OrbitControls addon dependency on purpose — that file
// isn't reliably hosted at a stable CDN path across Three.js versions,
// so this is a small hand-rolled replacement: drag to orbit, wheel/pinch
// to zoom, WASD/arrows to pan.
//
// Drag/wheel/pinch don't move the camera directly — they set a TARGET,
// and the actual camera value eases toward that target a little each
// frame (call .tick() from your render loop). That's what makes
// movement feel smooth instead of snapping instantly to wherever the
// pointer last was. WASD pan similarly eases through a velocity instead
// of moving at an instant fixed speed.
export function createCameraControls(camera, domElement, options) {
  const opts = options || {};
  const camTarget = { x: 0, y: opts.targetY || 10, z: 0 };
  let camRadius = opts.radius || 330;
  let camAzimuth = opts.azimuth || 0.6;
  let camPolar = opts.polar || 1.05;
  let targetRadius = camRadius, targetAzimuth = camAzimuth, targetPolar = camPolar;

  const CAMERA_EASE = 0.16; // higher = snappier/less smooth, lower = floatier
  const PAN_LIMIT = opts.panLimit || 330;

  let isDragging = false, lastPointerX = 0, lastPointerY = 0, pinchDist = 0;
  let lastInputTime = 0;
  const keysDown = {};
  const panVelocity = { x: 0, z: 0 };
  let panSpeedScale = 1.0;
  let driftEnabled = false;
  let driftSpeed = 0.0015;

  function updateCameraPosition() {
    camera.position.set(
      camTarget.x + camRadius * Math.sin(camPolar) * Math.sin(camAzimuth),
      camTarget.y + camRadius * Math.cos(camPolar),
      camTarget.z + camRadius * Math.sin(camPolar) * Math.cos(camAzimuth)
    );
    camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
  }
  updateCameraPosition();

  function onDragStart(x, y) { isDragging = true; lastPointerX = x; lastPointerY = y; lastInputTime = performance.now(); }
  function onDragMove(x, y) {
    if (!isDragging) return;
    targetAzimuth -= (x - lastPointerX) * 0.006;
    targetPolar -= (y - lastPointerY) * 0.006;
    targetPolar = Math.max(0.12, Math.min(Math.PI / 2 - 0.02, targetPolar));
    lastPointerX = x; lastPointerY = y;
    lastInputTime = performance.now();
  }
  function touchDist(e) { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  domElement.addEventListener("mousedown", (e) => onDragStart(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => onDragMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", () => { isDragging = false; });

  domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    targetRadius *= 1 + e.deltaY * 0.0012;
    targetRadius = Math.max(8, Math.min(900, targetRadius));
    lastInputTime = performance.now();
  }, { passive: false });

  domElement.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) { isDragging = false; pinchDist = touchDist(e); }
    else onDragStart(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  domElement.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      const d = touchDist(e);
      targetRadius *= pinchDist / d;
      targetRadius = Math.max(8, Math.min(900, targetRadius));
      pinchDist = d;
      lastInputTime = performance.now();
    } else onDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener("touchend", () => { isDragging = false; });

  window.addEventListener("keydown", (e) => { keysDown[e.key.toLowerCase()] = true; });
  window.addEventListener("keyup", (e) => { keysDown[e.key.toLowerCase()] = false; });

  function applyPan() {
    const f = (keysDown.w || keysDown.arrowup ? 1 : 0) - (keysDown.s || keysDown.arrowdown ? 1 : 0);
    const r = (keysDown.d || keysDown.arrowright ? 1 : 0) - (keysDown.a || keysDown.arrowleft ? 1 : 0);
    const sp = camRadius * 0.01 * panSpeedScale;
    // camera sits at +sin(az), +cos(az) from camTarget, so "forward" points the opposite way
    const desiredX = (-Math.sin(camAzimuth) * f + Math.cos(camAzimuth) * r) * sp;
    const desiredZ = (-Math.cos(camAzimuth) * f - Math.sin(camAzimuth) * r) * sp;
    panVelocity.x += (desiredX - panVelocity.x) * 0.2;
    panVelocity.z += (desiredZ - panVelocity.z) * 0.2;
    if (Math.abs(panVelocity.x) > 0.0008 || Math.abs(panVelocity.z) > 0.0008) {
      camTarget.x += panVelocity.x;
      camTarget.z += panVelocity.z;
      camTarget.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, camTarget.x));
      camTarget.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, camTarget.z));
      if (f || r) lastInputTime = performance.now();
    }
  }

  // Call once per frame from the render loop.
  function tick() {
    applyPan();
    if (driftEnabled) targetAzimuth += driftSpeed;
    camAzimuth += (targetAzimuth - camAzimuth) * CAMERA_EASE;
    camPolar += (targetPolar - camPolar) * CAMERA_EASE;
    camRadius += (targetRadius - camRadius) * CAMERA_EASE;
    updateCameraPosition();
  }

  return {
    tick,
    getRadius: () => camRadius,
    setDriftEnabled: (v) => { driftEnabled = v; },
    isDriftEnabled: () => driftEnabled,
    setDriftSpeed: (v) => { driftSpeed = v; },
    setPanSpeedScale: (v) => { panSpeedScale = v; },
  };
}
