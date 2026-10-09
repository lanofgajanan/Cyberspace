import * as THREE from "three";

const VERSION = 1;
const validWaypoint = (w) => w && Array.isArray(w.position) && w.position.length === 3
  && Array.isArray(w.quaternion) && w.quaternion.length === 4 && Number.isFinite(w.duration);

export function createCameraReplay(cameraControls) {
  let waypoints = [];
  let playing = false, elapsed = 0, looping = false;
  const statusListeners = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  function getTotalDuration() {
    if (waypoints.length < 2) return 0;
    return waypoints.slice(0, -1).reduce((sum, w) => sum + w.duration, 0);
  }

  function getStatus() {
    return {
      count: waypoints.length,
      duration: getTotalDuration(),
      playing,
      looping,
      elapsed,
    };
  }

  function notifyStatus() {
    const s = getStatus();
    for (const fn of statusListeners) {
      try { fn(s); } catch (_) {}
    }
  }

  function validate(input) {
    if (!input || input.version !== VERSION || !Array.isArray(input.waypoints) || input.waypoints.length < 2 || input.waypoints.some((w) => !validWaypoint(w))) {
      throw new Error("Replay JSON must be version 1 with at least two valid waypoints.");
    }
    return input.waypoints;
  }

  function capture(duration = 3) {
    waypoints.push({ position: cameraControls.getCamera().position.toArray(), quaternion: cameraControls.getCamera().quaternion.toArray(), duration });
    notifyStatus();
  }

  function undo() {
    if (waypoints.length > 0) {
      waypoints.pop();
      if (playing && waypoints.length < 2) stop();
      notifyStatus();
    }
  }

  function poseAt(time) {
    let t = time;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const w0 = waypoints[Math.max(0, i - 1)], w1 = waypoints[i], w2 = waypoints[i + 1], w3 = waypoints[Math.min(waypoints.length - 1, i + 2)];
      if (t > w1.duration && i < waypoints.length - 2) { t -= w1.duration; continue; }
      const u = Math.max(0, Math.min(1, t / Math.max(0.01, w1.duration)));
      a.fromArray(w0.position); b.fromArray(w1.position); c.fromArray(w2.position); d.fromArray(w3.position);
      const u2 = u * u, u3 = u2 * u;
      const p = a.clone().multiplyScalar(-0.5 * u3 + u2 - 0.5 * u)
        .add(b.clone().multiplyScalar(1.5 * u3 - 2.5 * u2 + 1))
        .add(c.clone().multiplyScalar(-1.5 * u3 + 2 * u2 + 0.5 * u))
        .add(d.clone().multiplyScalar(0.5 * u3 - 0.5 * u2));
      qa.fromArray(w1.quaternion); qb.fromArray(w2.quaternion);
      return { position: p, quaternion: qa.clone().slerp(qb, u) };
    }
    const last = waypoints[waypoints.length - 1];
    return { position: new THREE.Vector3().fromArray(last.position), quaternion: new THREE.Quaternion().fromArray(last.quaternion) };
  }

  function stop() {
    if (!playing) return;
    playing = false;
    const finalPose = poseAt(elapsed);
    if (cameraControls.syncFromPose) {
      cameraControls.syncFromPose(finalPose.position, finalPose.quaternion);
    }
    cameraControls.clearReplayPose();
    notifyStatus();
  }

  function play() {
    if (waypoints.length >= 2) {
      elapsed = 0;
      playing = true;
      cameraControls.setReplayPose(poseAt(0));
      notifyStatus();
    }
  }

  function togglePlay() {
    if (playing) stop();
    else play();
  }

  function toggleLoop() {
    looping = !looping;
    notifyStatus();
    return looping;
  }

  return {
    capture,
    undo,
    clear: () => {
      waypoints = [];
      playing = false;
      cameraControls.clearReplayPose();
      notifyStatus();
    },
    exportJSON: () => JSON.stringify({ version: VERSION, waypoints }, null, 2),
    importJSON: (text) => {
      const parsed = JSON.parse(text);
      waypoints = validate(parsed);
      elapsed = 0;
      notifyStatus();
    },
    getWaypoints: () => waypoints,
    play,
    stop,
    togglePlay,
    toggleLoop,
    isLooping: () => looping,
    isPlaying: () => playing,
    getStatus,
    onStatusChange: (fn) => {
      statusListeners.push(fn);
      fn(getStatus());
    },
    update: (dt) => {
      if (!playing) return;
      elapsed += dt;
      const total = getTotalDuration();
      if (total > 0 && elapsed >= total) {
        if (looping) {
          elapsed = elapsed % total;
        } else {
          elapsed = total;
          playing = false;
          const finalPose = poseAt(elapsed);
          if (cameraControls.syncFromPose) {
            cameraControls.syncFromPose(finalPose.position, finalPose.quaternion);
          }
          cameraControls.clearReplayPose();
          notifyStatus();
          return;
        }
      }
      cameraControls.setReplayPose(poseAt(elapsed));
      notifyStatus();
    },
  };
}
