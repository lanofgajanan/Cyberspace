import * as THREE from "three";

const VERSION = 1;
const validWaypoint = (w) => w && Array.isArray(w.position) && w.position.length === 3
  && Array.isArray(w.quaternion) && w.quaternion.length === 4 && Number.isFinite(w.duration);

export function createCameraReplay(cameraControls, scene) {
  let waypoints = [];
  let playing = false, elapsed = 0, looping = false, pathVisible = true;
  const statusListeners = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  const PATH_COLOR = 0xffe600;

  // Scene objects for path visualization
  let pathGroup = null;
  let pathLine = null;
  let pathXrayLine = null;
  let indicatorSegments = null;
  let indicatorXraySegments = null;
  let progressMarker = null;

  const pathMaterial = new THREE.LineBasicMaterial({
    color: PATH_COLOR,
    fog: true,
  });
  const pathXrayMaterial = new THREE.LineBasicMaterial({
    color: PATH_COLOR,
    transparent: true,
    opacity: 0.22,
    depthTest: false,
  });

  const indicatorMaterial = new THREE.LineBasicMaterial({
    color: PATH_COLOR,
    fog: true,
  });
  const indicatorXrayMaterial = new THREE.LineBasicMaterial({
    color: PATH_COLOR,
    transparent: true,
    opacity: 0.22,
    depthTest: false,
  });

  if (scene) {
    pathGroup = new THREE.Group();
    pathGroup.name = "camera-replay-path";
    scene.add(pathGroup);

    progressMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6, 0),
      new THREE.MeshBasicMaterial({ color: 0x4fd1ff, wireframe: true, depthTest: false })
    );
    progressMarker.visible = false;
    pathGroup.add(progressMarker);
  }

  function sampleSpline(w0, w1, w2, w3, u, outPos, outTangent) {
    const u2 = u * u;
    const u3 = u2 * u;

    const c0 = -0.5 * u3 + u2 - 0.5 * u;
    const c1 = 1.5 * u3 - 2.5 * u2 + 1;
    const c2 = -1.5 * u3 + 2 * u2 + 0.5 * u;
    const c3 = 0.5 * u3 - 0.5 * u2;

    outPos.set(
      w0[0] * c0 + w1[0] * c1 + w2[0] * c2 + w3[0] * c3,
      w0[1] * c0 + w1[1] * c1 + w2[1] * c2 + w3[1] * c3,
      w0[2] * c0 + w1[2] * c1 + w2[2] * c2 + w3[2] * c3
    );

    if (outTangent) {
      const d0 = -1.5 * u2 + 2 * u - 0.5;
      const d1 = 4.5 * u2 - 5 * u;
      const d2 = -4.5 * u2 + 4 * u + 0.5;
      const d3 = 1.5 * u2 - u;

      outTangent.set(
        w0[0] * d0 + w1[0] * d1 + w2[0] * d2 + w3[0] * d3,
        w0[1] * d0 + w1[1] * d1 + w2[1] * d2 + w3[1] * d3,
        w0[2] * d0 + w1[2] * d1 + w2[2] * d2 + w3[2] * d3
      );
    }
  }

  const tmpP = new THREE.Vector3();
  const tmpT = new THREE.Vector3();
  const tmpR = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  function updatePathVisualization() {
    if (!pathGroup) return;

    if (!pathVisible || waypoints.length === 0) {
      pathGroup.visible = false;
      return;
    }
    pathGroup.visible = true;

    if (pathLine) { pathGroup.remove(pathLine); pathLine.geometry.dispose(); pathLine = null; }
    if (pathXrayLine) { pathGroup.remove(pathXrayLine); pathXrayLine.geometry.dispose(); pathXrayLine = null; }
    if (indicatorSegments) { pathGroup.remove(indicatorSegments); indicatorSegments.geometry.dispose(); indicatorSegments = null; }
    if (indicatorXraySegments) { pathGroup.remove(indicatorXraySegments); indicatorXraySegments.geometry.dispose(); indicatorXraySegments = null; }

    const pathPoints = [];
    const indicatorPoints = [];

    // 1. Generate smooth spline path if at least 2 waypoints
    if (waypoints.length >= 2) {
      for (let i = 0; i < waypoints.length - 1; i++) {
        const w0 = waypoints[Math.max(0, i - 1)].position;
        const w1 = waypoints[i].position;
        const w2 = waypoints[i + 1].position;
        const w3 = waypoints[Math.min(waypoints.length - 1, i + 2)].position;

        const segDist = Math.hypot(w2[0] - w1[0], w2[1] - w1[1], w2[2] - w1[2]);
        const steps = Math.max(16, Math.min(64, Math.floor(segDist / 4)));

        for (let s = (i === 0 ? 0 : 1); s <= steps; s++) {
          const u = s / steps;
          sampleSpline(w0, w1, w2, w3, u, tmpP);
          pathPoints.push(tmpP.x, tmpP.y, tmpP.z);
        }

        // Direction arrows along this segment to indicate flight path direction
        const arrowCount = segDist > 120 ? 3 : (segDist > 30 ? 2 : 1);
        const arrowSteps = arrowCount === 1 ? [0.5] : (arrowCount === 2 ? [0.35, 0.7] : [0.25, 0.5, 0.75]);
        const arrowScale = Math.min(4.5, Math.max(1.8, segDist * 0.035));

        for (const u of arrowSteps) {
          sampleSpline(w0, w1, w2, w3, u, tmpP, tmpT);
          if (tmpT.lengthSq() > 0.0001) tmpT.normalize();
          else tmpT.set(0, 0, -1);

          if (Math.abs(tmpT.y) < 0.92) {
            tmpR.crossVectors(tmpT, new THREE.Vector3(0, 1, 0)).normalize();
          } else {
            tmpR.crossVectors(tmpT, new THREE.Vector3(1, 0, 0)).normalize();
          }
          tmpN.crossVectors(tmpR, tmpT).normalize();

          const tipX = tmpP.x + tmpT.x * arrowScale * 0.7;
          const tipY = tmpP.y + tmpT.y * arrowScale * 0.7;
          const tipZ = tmpP.z + tmpT.z * arrowScale * 0.7;

          const baseX = tmpP.x - tmpT.x * arrowScale * 0.5;
          const baseY = tmpP.y - tmpT.y * arrowScale * 0.5;
          const baseZ = tmpP.z - tmpT.z * arrowScale * 0.5;

          const rw = arrowScale * 0.4;
          const nw = arrowScale * 0.4;

          const w0x = baseX + tmpR.x * rw, w0y = baseY + tmpR.y * rw, w0z = baseZ + tmpR.z * rw;
          const w1x = baseX - tmpR.x * rw, w1y = baseY - tmpR.y * rw, w1z = baseZ - tmpR.z * rw;
          const w2x = baseX + tmpN.x * nw, w2y = baseY + tmpN.y * nw, w2z = baseZ + tmpN.z * nw;
          const w3x = baseX - tmpN.x * nw, w3y = baseY - tmpN.y * nw, w3z = baseZ - tmpN.z * nw;

          // Tip to 4 base wings
          indicatorPoints.push(tipX, tipY, tipZ, w0x, w0y, w0z);
          indicatorPoints.push(tipX, tipY, tipZ, w1x, w1y, w1z);
          indicatorPoints.push(tipX, tipY, tipZ, w2x, w2y, w2z);
          indicatorPoints.push(tipX, tipY, tipZ, w3x, w3y, w3z);

          // Connect 4 base wings
          indicatorPoints.push(w0x, w0y, w0z, w2x, w2y, w2z);
          indicatorPoints.push(w2x, w2y, w2z, w1x, w1y, w1z);
          indicatorPoints.push(w1x, w1y, w1z, w3x, w3y, w3z);
          indicatorPoints.push(w3x, w3y, w3z, w0x, w0y, w0z);
        }
      }
    }

    // 2. Waypoint beacon diamonds & camera orientation frustums
    for (let i = 0; i < waypoints.length; i++) {
      const w = waypoints[i];
      const px = w.position[0], py = w.position[1], pz = w.position[2];
      tmpQ.fromArray(w.quaternion);

      // Node diamond marker
      const r = 1.3;
      const vxP = [px + r, py, pz], vxN = [px - r, py, pz];
      const vyP = [px, py + r, pz], vyN = [px, py - r, pz];
      const vzP = [px, py, pz + r], vzN = [px, py, pz - r];

      const addSeg = (p1, p2) => indicatorPoints.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      addSeg(vyP, vxP); addSeg(vyP, vxN); addSeg(vyP, vzP); addSeg(vyP, vzN);
      addSeg(vyN, vxP); addSeg(vyN, vxN); addSeg(vyN, vzP); addSeg(vyN, vzN);
      addSeg(vxP, vzP); addSeg(vzP, vxN); addSeg(vxN, vzN); addSeg(vzN, vxP);

      // Camera view direction frustum
      const fDist = 4.8;
      const fW = 2.4;
      const fH = 1.35;

      const corners = [
        new THREE.Vector3(-fW,  fH, -fDist).applyQuaternion(tmpQ).add({ x: px, y: py, z: pz }),
        new THREE.Vector3( fW,  fH, -fDist).applyQuaternion(tmpQ).add({ x: px, y: py, z: pz }),
        new THREE.Vector3( fW, -fH, -fDist).applyQuaternion(tmpQ).add({ x: px, y: py, z: pz }),
        new THREE.Vector3(-fW, -fH, -fDist).applyQuaternion(tmpQ).add({ x: px, y: py, z: pz }),
      ];
      const topCenter = new THREE.Vector3(0, fH * 1.35, -fDist).applyQuaternion(tmpQ).add({ x: px, y: py, z: pz });
      const topEdgeMid = new THREE.Vector3(0, fH, -fDist).applyQuaternion(tmpQ).add({ x: px, y: py, z: pz });

      // 4 rays from waypoint to rectangle corners
      for (let c = 0; c < 4; c++) {
        indicatorPoints.push(px, py, pz, corners[c].x, corners[c].y, corners[c].z);
      }
      // 4 edges of the view rectangle
      for (let c = 0; c < 4; c++) {
        const next = corners[(c + 1) % 4];
        indicatorPoints.push(corners[c].x, corners[c].y, corners[c].z, next.x, next.y, next.z);
      }
      // Top orientation triangle
      indicatorPoints.push(topEdgeMid.x, topEdgeMid.y, topEdgeMid.z, topCenter.x, topCenter.y, topCenter.z);
    }

    if (pathPoints.length >= 6) {
      const pathGeom = new THREE.BufferGeometry();
      pathGeom.setAttribute("position", new THREE.Float32BufferAttribute(pathPoints, 3));
      pathLine = new THREE.Line(pathGeom, pathMaterial);
      pathXrayLine = new THREE.Line(pathGeom, pathXrayMaterial);
      pathGroup.add(pathLine);
      pathGroup.add(pathXrayLine);
    }

    if (indicatorPoints.length >= 6) {
      const indGeom = new THREE.BufferGeometry();
      indGeom.setAttribute("position", new THREE.Float32BufferAttribute(indicatorPoints, 3));
      indicatorSegments = new THREE.LineSegments(indGeom, indicatorMaterial);
      indicatorXraySegments = new THREE.LineSegments(indGeom, indicatorXrayMaterial);
      pathGroup.add(indicatorSegments);
      pathGroup.add(indicatorXraySegments);
    }
  }

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
      pathVisible,
    };
  }

  function notifyStatus() {
    updatePathVisualization();
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
    if (progressMarker) progressMarker.visible = false;
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
      if (progressMarker) progressMarker.visible = pathVisible;
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
      if (progressMarker) progressMarker.visible = false;
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
    seek: (time) => {
      const total = getTotalDuration();
      if (total <= 0) return;
      elapsed = Math.max(0, Math.min(total, time));
      const curPose = poseAt(elapsed);
      if (progressMarker && pathVisible) {
        progressMarker.visible = true;
        progressMarker.position.copy(curPose.position);
      }
      cameraControls.setReplayPose(curPose);
      notifyStatus();
    },
    onStatusChange: (fn) => {
      statusListeners.push(fn);
      fn(getStatus());
    },
    togglePath: () => {
      pathVisible = !pathVisible;
      updatePathVisualization();
      notifyStatus();
      return pathVisible;
    },
    setPathVisible: (vis) => {
      pathVisible = !!vis;
      updatePathVisualization();
      notifyStatus();
    },
    isPathVisible: () => pathVisible,
    getPathGroup: () => pathGroup,
    dispose: () => {
      if (pathGroup && scene) {
        scene.remove(pathGroup);
        if (pathLine) pathLine.geometry.dispose();
        if (pathXrayLine) pathXrayLine.geometry.dispose();
        if (indicatorSegments) indicatorSegments.geometry.dispose();
        if (indicatorXraySegments) indicatorXraySegments.geometry.dispose();
        if (progressMarker) {
          progressMarker.geometry.dispose();
          progressMarker.material.dispose();
        }
        pathMaterial.dispose();
        pathXrayMaterial.dispose();
        indicatorMaterial.dispose();
        indicatorXrayMaterial.dispose();
      }
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
          if (progressMarker) progressMarker.visible = false;
          const finalPose = poseAt(elapsed);
          if (cameraControls.syncFromPose) {
            cameraControls.syncFromPose(finalPose.position, finalPose.quaternion);
          }
          cameraControls.clearReplayPose();
          notifyStatus();
          return;
        }
      }
      const curPose = poseAt(elapsed);
      if (progressMarker && pathVisible) {
        progressMarker.visible = true;
        progressMarker.position.copy(curPose.position);
      }
      cameraControls.setReplayPose(curPose);
      notifyStatus();
    },
  };
}
