export function wireUI(getSceneObjects, cameraControls, replay) {
  const getObjects = () => getSceneObjects() || {};
  const initial = getObjects();
  const { streakMat } = initial;

  const driftBtn = document.getElementById("drift-toggle");
  driftBtn.addEventListener("click", () => {
    const enabled = !cameraControls.isDriftEnabled();
    cameraControls.setDriftEnabled(enabled);
    driftBtn.textContent = enabled ? "Stop drift" : "Start drift";
  });

  let showingDots = false;
  const viewBtn = document.getElementById("view-toggle");
  viewBtn.addEventListener("click", () => {
    const { lineView, sparseDotView, ensureDenseDotView, DENSE_DOT_ZOOM_THRESHOLD } = getObjects();
    showingDots = !showingDots;
    lineView.visible = !showingDots;
    sparseDotView.visible = showingDots;
    if (showingDots && cameraControls.getRadius() < DENSE_DOT_ZOOM_THRESHOLD) {
      ensureDenseDotView().visible = true;
    }
    viewBtn.textContent = showingDots ? "Edge view" : "Dot view";
  });

  const glitchBtn = document.getElementById("glitch-toggle");
  glitchBtn.addEventListener("click", () => {
    const { glitchMesh } = getObjects();
    if (!glitchMesh) return;
    glitchMesh.visible = !glitchMesh.visible;
    glitchBtn.textContent = glitchMesh.visible ? "Hide glitch cubes" : "Show glitch cubes";
  });

  const flyBtn = document.getElementById("fly-toggle");
  flyBtn.addEventListener("click", () => {
    cameraControls.setFlyMode(!cameraControls.isFlying());
    flyBtn.textContent = cameraControls.isFlying() ? "Exit fly mode" : "Fly mode";
  });

  function wireTerrainToggle(id, viewKey, label) {
    const button = document.getElementById(id);
    button.addEventListener("click", () => {
      const objects = getObjects();
      const view = objects[viewKey];
      if (!view) return;
      view.visible = !view.visible;
      button.textContent = view.visible ? `Hide ${label}` : label;
    });
  }
  wireTerrainToggle("terrain-heatmap-toggle", "heatmapView", "Terrain heatmap");
  wireTerrainToggle("terrain-slope-toggle", "slopeView", "Terrain slope");

  const settingsBtn = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("open"));

  function wireSlider(id, onChange) {
    const el = document.getElementById(id);
    const out = document.getElementById(id + "-val");
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      if (out) out.textContent = el.dataset.fmt === "pct" ? Math.round(v * 100) + "%" : v;
      onChange(v);
    });
  }
  wireSlider("drift-speed-slider", (v) => cameraControls.setDriftSpeed(v));
  wireSlider("pan-speed-slider", (v) => cameraControls.setPanSpeedScale(v));
  wireSlider("streak-brightness-slider", (v) => { const objects = getObjects(); if (objects.streakMat) objects.streakMat.color.setScalar(v); });
  wireSlider("fog-slider", (v) => {
    const objects = getObjects();
    if (!objects.scene || !objects.scene.fog) return;
    // v is 0 (no fog, far pulled way out) to 1 (fog as originally tuned)
    objects.scene.fog.near = 170 + (1 - v) * 2000;
    objects.scene.fog.far = 950 + (1 - v) * 4000;
  });

  document.getElementById("replay-capture").addEventListener("click", () => replay.capture());
  document.getElementById("replay-play").addEventListener("click", () => replay.play());
  document.getElementById("replay-export").addEventListener("click", () => {
    const blob = new Blob([replay.exportJSON()], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "cyberspace-replay.json"; link.click();
    URL.revokeObjectURL(link.href);
  });
  const replayFile = document.getElementById("replay-file");
  document.getElementById("replay-import").addEventListener("click", () => replayFile.click());
  replayFile.addEventListener("change", async () => {
    const file = replayFile.files && replayFile.files[0]; if (!file) return;
    try {
      replay.importJSON(await file.text());
    } catch (error) {
      document.getElementById("stats").textContent = `replay error [E_REPLAY_IMPORT_INVALID]: ${error.message}`;
      document.getElementById("diagnostics").textContent = "status: replay import rejected";
    }
    replayFile.value = "";
  });

  // Tab hides every bit of UI (HUD text, buttons, settings panel) so the
  // scene can be viewed completely clean.
  const uiLayer = document.getElementById("ui-layer");
  window.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      uiLayer.classList.toggle("hidden");
    }
  });

  return {
    getShowingDots: () => showingDots,
  };
}
