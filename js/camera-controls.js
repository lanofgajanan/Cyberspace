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
  const keysDown = Object.create(null);
  const panVelocity = { x: 0, z: 0 };
  let panSpeedScale = 1.0;
  let driftEnabled = false;
  let driftSpeed = 0.0015;

  // ---------- fly mode: pointer-lock mouselook + WASD flythrough ----------
  // A second mode alongside orbit, not a replacement — orbit stays
  // better for surveying the whole city; fly mode is for actually
  // moving through the streets. Free-fly (Space/Shift = world up/down),
  // not ground-locked walking — there's no collision/height system here.
  let flying = false;
  const flyPos = { x: 0, y: 30, z: 120 };
  let yaw = 0, pitch = 0;
  const FLY_SENSITIVITY = 0.0022;
  const FLY_SPEED_BASE = 1.1;
  let flySpeedScale = 1.0;
  let replayPose = null;

  function updateCameraPosition() {
    camera.position.set(
      camTarget.x + camRadius * Math.sin(camPolar) * Math.sin(camAzimuth),
      camTarget.y + camRadius * Math.cos(camPolar),
      camTarget.z + camRadius * Math.sin(camPolar) * Math.cos(camAzimuth)
    );
    camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
  }
  updateCameraPosition();

  function onDragStart(x, y) { if (flying) return; isDragging = true; lastPointerX = x; lastPointerY = y; lastInputTime = performance.now(); }
  function onDragMove(x, y) {
    if (flying || !isDragging) return;
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
    if (flying) return;
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

  function clearKeys() {
    Object.keys(keysDown).forEach((code) => { keysDown[code] = false; });
    panVelocity.x = 0;
    panVelocity.z = 0;
  }
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") e.preventDefault(); // stop page scroll — Space is "fly up"
    keysDown[e.code] = true;
  });
  window.addEventListener("keyup", (e) => { keysDown[e.code] = false; });
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearKeys(); });
  document.addEventListener("pointerlockchange", clearKeys);
  document.addEventListener("pointerlockerror", clearKeys);

  // Click the canvas to lock the pointer, but only while in fly mode —
  // a normal click (e.g. starting an orbit drag) shouldn't try to lock it.
  domElement.addEventListener("click", () => {
    if (flying && document.pointerLockElement !== domElement) domElement.requestPointerLock();
  });
  document.addEventListener("mousemove", (e) => {
    if (!flying || document.pointerLockElement !== domElement) return;
    yaw -= e.movementX * FLY_SENSITIVITY;
    pitch -= e.movementY * FLY_SENSITIVITY;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
  });

  function flyForward() {
    return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  }
  function flyRight() {
    return { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  }
  function tickFly() {
    const fwd = flyForward(), right = flyRight();
    const f = (keysDown.KeyW || keysDown.ArrowUp ? 1 : 0) - (keysDown.KeyS || keysDown.ArrowDown ? 1 : 0);
    const r = (keysDown.KeyD || keysDown.ArrowRight ? 1 : 0) - (keysDown.KeyA || keysDown.ArrowLeft ? 1 : 0);
    const u = (keysDown.Space ? 1 : 0) - (keysDown.Control ? 1 : 0);
    const sp = FLY_SPEED_BASE * flySpeedScale;
    flyPos.x += (fwd.x * f + right.x * r) * sp;
    flyPos.y += (fwd.y * f + u) * sp;
    flyPos.z += (fwd.z * f + right.z * r) * sp;
    camera.position.set(flyPos.x, flyPos.y, flyPos.z);
    camera.lookAt(flyPos.x + fwd.x, flyPos.y + fwd.y, flyPos.z + fwd.z);
  }

  function setFlyMode(enabled) {
    if (enabled === flying) return;
    if (enabled) {
      // Start from wherever the orbit camera currently is, facing the
      // point it was already looking at — no jump on entry.
      flyPos.x = camera.position.x; flyPos.y = camera.position.y; flyPos.z = camera.position.z;
      const dx = camTarget.x - flyPos.x, dy = camTarget.y - flyPos.y, dz = camTarget.z - flyPos.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const fwd = { x: dx / len, y: dy / len, z: dz / len };
      pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      yaw = Math.atan2(fwd.x, fwd.z);
      flying = true;
    } else {
      if (document.pointerLockElement === domElement) document.exitPointerLock();
      // Resume orbit centered on a point out in front of where flying stopped.
      const fwd = flyForward();
      const aheadDist = 80;
      camTarget.x = flyPos.x + fwd.x * aheadDist;
      camTarget.y = flyPos.y + fwd.y * aheadDist;
      camTarget.z = flyPos.z + fwd.z * aheadDist;
      targetAzimuth = camAzimuth = yaw;
      targetPolar = camPolar = Math.PI / 2 - pitch;
      targetRadius = camRadius = aheadDist;
      flying = false;
    }
  }

  function applyPan() {
    const f = (keysDown.KeyW || keysDown.ArrowUp ? 1 : 0) - (keysDown.KeyS || keysDown.ArrowDown ? 1 : 0);
    const r = (keysDown.KeyD || keysDown.ArrowRight ? 1 : 0) - (keysDown.KeyA || keysDown.ArrowLeft ? 1 : 0);
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
    if (replayPose) {
      camera.position.copy(replayPose.position);
      camera.quaternion.copy(replayPose.quaternion);
      return;
    }
    if (flying) {
      tickFly();
      return;
    }
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
    isFlying: () => flying,
    setFlyMode,
    setDriftEnabled: (v) => { driftEnabled = v; },
    isDriftEnabled: () => driftEnabled,
    setDriftSpeed: (v) => { driftSpeed = v; },
    setPanSpeedScale: (v) => { panSpeedScale = v; flySpeedScale = v; },
    getCamera: () => camera,
    setReplayPose: (pose) => { replayPose = pose; },
    clearReplayPose: () => { replayPose = null; },
  };
}
