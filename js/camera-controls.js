import * as THREE from "three";

// No external OrbitControls addon dependency on purpose — that file
// isn't reliably hosted at a stable CDN path across Three.js versions,
// so this is a hand-rolled replacement: drag to orbit, right-drag /
// WASD to pan, wheel/pinch to zoom, plus first-person flycam.
//
// Drag/wheel/pinch set a TARGET, and the actual camera value eases toward
// that target using framerate-independent exponential damping (pass dt
// to .tick(dt) from your render loop).
export function createCameraControls(camera, domElement, options) {
  const opts = options || {};
  const camTarget = { x: 0, y: opts.targetY || 10, z: 0 };
  const targetCamTarget = { x: camTarget.x, y: camTarget.y, z: camTarget.z };
  let camRadius = opts.radius || 330;
  let camAzimuth = opts.azimuth || 0.6;
  let camPolar = opts.polar || 1.05;
  let targetRadius = camRadius, targetAzimuth = camAzimuth, targetPolar = camPolar;

  const PAN_LIMIT = opts.panLimit || 330;
  let easeDecayRate = 10.5;

  let isDragging = false;
  let dragButton = 0; // 0 = left (orbit), 1 = middle (pan), 2 = right (pan)
  let lastPointerX = 0, lastPointerY = 0, pinchDist = 0;
  let lastMidpoint = null;
  let lastInputTime = 0;
  const keysDown = Object.create(null);
  const panVelocity = { x: 0, z: 0 };
  let panSpeedScale = 1.0;
  let driftEnabled = false;
  let driftSpeed = 0.0015;

  // ---------- fly mode: pointer-lock mouselook + WASD flythrough ----------
  let flying = false;
  const flyPos = { x: 0, y: 30, z: 120 };
  const flyVel = { x: 0, y: 0, z: 0 };
  let yaw = 0, pitch = 0;
  const FLY_SENSITIVITY = 0.0022;
  const FLY_SPEED_BASE = 1.1;
  let flySpeedScale = 1.0;
  let replayPose = null;

  const PRESETS = {
    overview: { target: { x: 0, y: 15, z: 0 }, radius: 520, azimuth: 0.6, polar: 0.85 },
    street: { target: { x: 0, y: 6, z: 0 }, radius: 40, azimuth: 0.78, polar: 1.48 },
    isometric: { target: { x: 0, y: 18, z: 0 }, radius: 480, azimuth: Math.PI / 4, polar: Math.atan(Math.SQRT2) },
  };

  function updateCameraPosition() {
    camera.position.set(
      camTarget.x + camRadius * Math.sin(camPolar) * Math.sin(camAzimuth),
      camTarget.y + camRadius * Math.cos(camPolar),
      camTarget.z + camRadius * Math.sin(camPolar) * Math.cos(camAzimuth)
    );
    camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
  }
  updateCameraPosition();

  function onDragStart(clientX, clientY, button = 0) {
    if (flying) return;
    isDragging = true;
    dragButton = button;
    lastPointerX = clientX;
    lastPointerY = clientY;
    lastInputTime = performance.now();
  }

  function onDragMove(clientX, clientY) {
    if (flying || !isDragging) return;
    const dx = clientX - lastPointerX;
    const dy = clientY - lastPointerY;
    lastPointerX = clientX;
    lastPointerY = clientY;
    lastInputTime = performance.now();

    if (dragButton === 0) {
      // Left click: orbit azimuth & polar
      targetAzimuth -= dx * 0.006;
      targetPolar -= dy * 0.006;
      targetPolar = Math.max(0.08, Math.min(Math.PI / 2 - 0.02, targetPolar));
    } else if (dragButton === 1 || dragButton === 2) {
      // Middle or right click: pan camera target in ground plane
      const panFactor = camRadius * 0.0014;
      const shiftX = (-Math.cos(camAzimuth) * dx + Math.sin(camAzimuth) * dy) * panFactor;
      const shiftZ = ( Math.sin(camAzimuth) * dx + Math.cos(camAzimuth) * dy) * panFactor;
      targetCamTarget.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, targetCamTarget.x + shiftX));
      targetCamTarget.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, targetCamTarget.z + shiftZ));
      camTarget.x = targetCamTarget.x;
      camTarget.z = targetCamTarget.z;
    }
  }

  function touchDist(e) {
    const a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function touchMidpoint(e) {
    const a = e.touches[0], b = e.touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  domElement.addEventListener("mousedown", (e) => onDragStart(e.clientX, e.clientY, e.button));
  window.addEventListener("mousemove", (e) => onDragMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", () => { isDragging = false; });
  domElement.addEventListener("contextmenu", (e) => { e.preventDefault(); });

  domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (flying) return;
    targetRadius *= 1 + e.deltaY * 0.0012;
    targetRadius = Math.max(8, Math.min(3600, targetRadius));
    lastInputTime = performance.now();
  }, { passive: false });

  domElement.addEventListener("touchstart", (e) => {
    if (flying) return;
    if (e.touches.length === 2) {
      isDragging = false;
      pinchDist = touchDist(e);
      lastMidpoint = touchMidpoint(e);
    } else if (e.touches.length === 1) {
      onDragStart(e.touches[0].clientX, e.touches[0].clientY, 0);
    }
  }, { passive: true });

  domElement.addEventListener("touchmove", (e) => {
    if (flying) return;
    if (e.touches.length === 2) {
      const d = touchDist(e);
      targetRadius *= pinchDist / Math.max(1, d);
      targetRadius = Math.max(8, Math.min(3600, targetRadius));
      pinchDist = d;

      const mid = touchMidpoint(e);
      if (lastMidpoint) {
        const dx = mid.x - lastMidpoint.x;
        const dy = mid.y - lastMidpoint.y;
        const panFactor = camRadius * 0.0014;
        const shiftX = (-Math.cos(camAzimuth) * dx + Math.sin(camAzimuth) * dy) * panFactor;
        const shiftZ = ( Math.sin(camAzimuth) * dx + Math.cos(camAzimuth) * dy) * panFactor;
        targetCamTarget.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, targetCamTarget.x + shiftX));
        targetCamTarget.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, targetCamTarget.z + shiftZ));
        camTarget.x = targetCamTarget.x;
        camTarget.z = targetCamTarget.z;
      }
      lastMidpoint = mid;
      lastInputTime = performance.now();
    } else if (e.touches.length === 1 && isDragging) {
      onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
  window.addEventListener("touchend", () => { isDragging = false; lastMidpoint = null; });

  function clearKeys() {
    Object.keys(keysDown).forEach((code) => { keysDown[code] = false; });
    panVelocity.x = 0;
    panVelocity.z = 0;
    flyVel.x = 0;
    flyVel.y = 0;
    flyVel.z = 0;
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
  function tickFly(dt) {
    const fwd = flyForward(), right = flyRight();
    const f = (keysDown.KeyW || keysDown.ArrowUp ? 1 : 0) - (keysDown.KeyS || keysDown.ArrowDown ? 1 : 0);
    const r = (keysDown.KeyD || keysDown.ArrowRight ? 1 : 0) - (keysDown.KeyA || keysDown.ArrowLeft ? 1 : 0);
    // Space = fly up; Ctrl = fly down
    const u = (keysDown.Space ? 1 : 0) - (keysDown.ControlLeft || keysDown.ControlRight ? 1 : 0);
    // Shift = sprint acceleration
    const isSprinting = Boolean(keysDown.ShiftLeft || keysDown.ShiftRight);
    const sprintMult = isSprinting ? 2.8 : 1.0;
    const sp = FLY_SPEED_BASE * flySpeedScale * sprintMult * (dt * 60);

    const desiredVelX = (fwd.x * f + right.x * r) * sp;
    const desiredVelY = (fwd.y * f + u) * sp;
    const desiredVelZ = (fwd.z * f + right.z * r) * sp;

    // Framerate-independent flight acceleration and damping
    const flyDamp = 1 - Math.exp(-14 * dt);
    flyVel.x += (desiredVelX - flyVel.x) * flyDamp;
    flyVel.y += (desiredVelY - flyVel.y) * flyDamp;
    flyVel.z += (desiredVelZ - flyVel.z) * flyDamp;

    flyPos.x += flyVel.x;
    flyPos.y += flyVel.y;
    flyPos.z += flyVel.z;

    camera.position.set(flyPos.x, flyPos.y, flyPos.z);
    camera.lookAt(flyPos.x + fwd.x, flyPos.y + fwd.y, flyPos.z + fwd.z);
  }

  function setFlyMode(enabled) {
    if (enabled === flying) return;
    if (enabled) {
      // Start from wherever the orbit camera currently is, facing the
      // point it was already looking at — no jump on entry.
      flyPos.x = camera.position.x; flyPos.y = camera.position.y; flyPos.z = camera.position.z;
      flyVel.x = 0; flyVel.y = 0; flyVel.z = 0;
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
      camTarget.x = targetCamTarget.x = flyPos.x + fwd.x * aheadDist;
      camTarget.y = targetCamTarget.y = flyPos.y + fwd.y * aheadDist;
      camTarget.z = targetCamTarget.z = flyPos.z + fwd.z * aheadDist;
      targetAzimuth = camAzimuth = yaw;
      targetPolar = camPolar = Math.max(0.08, Math.min(Math.PI / 2 - 0.02, Math.PI / 2 - pitch));
      targetRadius = camRadius = aheadDist;
      flying = false;
    }
  }

  function applyPreset(name) {
    const preset = typeof name === "string" ? PRESETS[name] : name;
    if (!preset) return;
    if (flying) {
      setFlyMode(false);
    }
    targetCamTarget.x = preset.target.x;
    targetCamTarget.y = preset.target.y;
    targetCamTarget.z = preset.target.z;
    targetRadius = Math.max(8, Math.min(3600, preset.radius));
    targetPolar = Math.max(0.08, Math.min(Math.PI / 2 - 0.02, preset.polar));

    // Shortest angular arc interpolation for azimuth
    const twoPi = Math.PI * 2;
    let diff = (preset.azimuth - camAzimuth) % twoPi;
    if (diff < -Math.PI) diff += twoPi;
    if (diff > Math.PI) diff -= twoPi;
    targetAzimuth = camAzimuth + diff;
    lastInputTime = performance.now();
  }

  function applyPan(dt) {
    const f = (keysDown.KeyW || keysDown.ArrowUp ? 1 : 0) - (keysDown.KeyS || keysDown.ArrowDown ? 1 : 0);
    const r = (keysDown.KeyD || keysDown.ArrowRight ? 1 : 0) - (keysDown.KeyA || keysDown.ArrowLeft ? 1 : 0);
    const sp = camRadius * 0.01 * panSpeedScale;
    // camera sits at +sin(az), +cos(az) from camTarget, so "forward" points the opposite way
    const desiredX = (-Math.sin(camAzimuth) * f + Math.cos(camAzimuth) * r) * sp;
    const desiredZ = (-Math.cos(camAzimuth) * f - Math.sin(camAzimuth) * r) * sp;
    const panEase = 1 - Math.exp(-13.4 * dt);
    panVelocity.x += (desiredX - panVelocity.x) * panEase;
    panVelocity.z += (desiredZ - panVelocity.z) * panEase;
    if (Math.abs(panVelocity.x) > 0.0008 || Math.abs(panVelocity.z) > 0.0008) {
      const step = dt * 60;
      targetCamTarget.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, targetCamTarget.x + panVelocity.x * step));
      targetCamTarget.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, targetCamTarget.z + panVelocity.z * step));
      camTarget.x = targetCamTarget.x;
      camTarget.z = targetCamTarget.z;
      if (f || r) lastInputTime = performance.now();
    }
  }

  function syncFromPose(position, quaternion) {
    if (!position || !quaternion) return;
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    const aheadDist = Math.max(30, Math.min(camRadius, 180));

    if (flying) {
      flyPos.x = position.x;
      flyPos.y = position.y;
      flyPos.z = position.z;
      flyVel.x = 0; flyVel.y = 0; flyVel.z = 0;
      pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      yaw = Math.atan2(fwd.x, fwd.z);
    } else {
      camTarget.x = targetCamTarget.x = position.x + fwd.x * aheadDist;
      camTarget.y = targetCamTarget.y = position.y + fwd.y * aheadDist;
      camTarget.z = targetCamTarget.z = position.z + fwd.z * aheadDist;
      pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      yaw = Math.atan2(fwd.x, fwd.z);
      camAzimuth = targetAzimuth = yaw;
      camPolar = targetPolar = Math.max(0.08, Math.min(Math.PI / 2 - 0.02, Math.PI / 2 - pitch));
      camRadius = targetRadius = aheadDist;
    }
  }

  // Call once per frame from the render loop with delta time (dt in seconds).
  function tick(dt) {
    const delta = Math.max(0.001, Math.min(0.1, Number.isFinite(dt) ? dt : 1 / 60));

    if (replayPose) {
      camera.position.copy(replayPose.position);
      camera.quaternion.copy(replayPose.quaternion);
      return;
    }
    if (flying) {
      tickFly(delta);
      return;
    }

    applyPan(delta);
    if (driftEnabled) targetAzimuth += driftSpeed * (delta * 60);

    const ease = 1 - Math.exp(-easeDecayRate * delta);
    camTarget.x += (targetCamTarget.x - camTarget.x) * ease;
    camTarget.y += (targetCamTarget.y - camTarget.y) * ease;
    camTarget.z += (targetCamTarget.z - camTarget.z) * ease;
    camAzimuth += (targetAzimuth - camAzimuth) * ease;
    camPolar += (targetPolar - camPolar) * ease;
    camRadius += (targetRadius - camRadius) * ease;
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
    setPanSpeedScale: (v) => { panSpeedScale = v; },
    setFlySpeedScale: (v) => { flySpeedScale = v; },
    setEase: (v) => { easeDecayRate = Math.max(2, Math.min(32, v * 65)); },
    applyPreset,
    syncFromPose,
    getCamera: () => camera,
    setReplayPose: (pose) => { replayPose = pose; },
    clearReplayPose: () => { replayPose = null; },
  };
}
