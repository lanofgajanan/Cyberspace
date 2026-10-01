export function wireUI(sceneObjects, cameraControls) {
  const { glitchMesh, lineView, sparseDotView, denseDotView, streakMat, DENSE_DOT_ZOOM_THRESHOLD } = sceneObjects;

  const driftBtn = document.getElementById("drift-toggle");
  driftBtn.addEventListener("click", () => {
    const enabled = !cameraControls.isDriftEnabled();
    cameraControls.setDriftEnabled(enabled);
    driftBtn.textContent = enabled ? "Stop drift" : "Start drift";
  });

  let showingDots = false;
  const viewBtn = document.getElementById("view-toggle");
  viewBtn.addEventListener("click", () => {
    showingDots = !showingDots;
    lineView.visible = !showingDots;
    sparseDotView.visible = showingDots;
    denseDotView.visible = showingDots && cameraControls.getRadius() < DENSE_DOT_ZOOM_THRESHOLD;
    viewBtn.textContent = showingDots ? "Edge view" : "Dot view";
  });

  const glitchBtn = document.getElementById("glitch-toggle");
  glitchBtn.addEventListener("click", () => {
    glitchMesh.visible = !glitchMesh.visible;
    glitchBtn.textContent = glitchMesh.visible ? "Hide glitch cubes" : "Show glitch cubes";
  });

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
  wireSlider("streak-brightness-slider", (v) => streakMat.color.setScalar(v));
  wireSlider("fog-slider", (v) => {
    // v is 0 (no fog, far pulled way out) to 1 (fog as originally tuned)
    sceneObjects.scene.fog.near = 170 + (1 - v) * 2000;
    sceneObjects.scene.fog.far = 950 + (1 - v) * 4000;
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
