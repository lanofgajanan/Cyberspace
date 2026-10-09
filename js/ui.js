export function wireUI(getSceneObjects, cameraControls, replay, camera, renderer) {
  const getObjects = () => getSceneObjects() || {};

  // =========================================================================
  // 1. Tool Rail Tab Management & Inspector Panes
  // =========================================================================
  const railButtons = document.querySelectorAll(".rail-button[data-tab]");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorTab = document.getElementById("inspector-tab");
  const inspectorKicker = document.getElementById("inspector-kicker");
  const inspectorTitle = document.getElementById("inspector-title");
  const inspectorTabLabel = document.getElementById("inspector-tab-label");
  const collapseInspectorBtn = document.getElementById("collapse-inspector-btn");

  const TAB_META = {
    scene: { kicker: "SCENE CONTROL", title: "World Inspector", label: "SCENE" },
    layers: { kicker: "DISPLAY LAYERS", title: "Scene Layers", label: "LAYERS" },
    replay: { kicker: "CAMERA REPLAY", title: "Waypoints & Route", label: "REPLAY" },
    glitch: { kicker: "VOXEL GLITCH", title: "Glitch Cubes Tuner", label: "GLITCH" },
    diagnostics: { kicker: "DIAGNOSTICS", title: "System Telemetry", label: "LOAD" },
    settings: { kicker: "PREFERENCES", title: "Visualizer Settings", label: "SETTINGS" },
  };

  let activeTab = "scene";

  function setActiveTab(tab) {
    if (!TAB_META[tab]) return;
    activeTab = tab;

    // Update rail buttons
    railButtons.forEach((btn) => {
      const match = btn.dataset.tab === tab;
      btn.classList.toggle("rail-button--active", match);
      if (match) btn.setAttribute("aria-selected", "true");
      else btn.removeAttribute("aria-selected");
    });

    // Update inspector header
    if (inspectorKicker) inspectorKicker.textContent = TAB_META[tab].kicker;
    if (inspectorTitle) inspectorTitle.textContent = TAB_META[tab].title;
    if (inspectorTabLabel) inspectorTabLabel.textContent = TAB_META[tab].label;

    // Switch active pane
    document.querySelectorAll(".inspector-content-pane").forEach((pane) => {
      pane.classList.remove("is-active");
    });
    const targetPane = document.getElementById(`pane-${tab}`);
    if (targetPane) targetPane.classList.add("is-active");

    // Ensure inspector is visible
    if (inspectorPanel) {
      inspectorPanel.classList.remove("inspector--collapsed");
      inspectorPanel.classList.add("inspector--open-mobile");
    }
    if (inspectorTab) {
      inspectorTab.style.display = "none";
    }
  }

  railButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (inspectorPanel) {
        inspectorPanel.classList.remove("inspector--collapsed");
        inspectorPanel.classList.add("inspector--open-mobile");
      }
      if (uiLayer) uiLayer.classList.remove("inspector--collapsed-layout");
      if (inspectorTab) inspectorTab.style.display = "none";
      setActiveTab(btn.dataset.tab);
    });
  });

  if (collapseInspectorBtn) {
    collapseInspectorBtn.addEventListener("click", () => {
      if (inspectorPanel) {
        inspectorPanel.classList.add("inspector--collapsed");
        inspectorPanel.classList.remove("inspector--open-mobile");
      }
      if (uiLayer) uiLayer.classList.add("inspector--collapsed-layout");
      if (inspectorTab) {
        inspectorTab.style.display = "flex";
      }
    });
  }

  if (inspectorTab) {
    inspectorTab.addEventListener("click", () => {
      if (inspectorPanel) {
        inspectorPanel.classList.remove("inspector--collapsed");
        inspectorPanel.classList.add("inspector--open-mobile");
      }
      if (uiLayer) uiLayer.classList.remove("inspector--collapsed-layout");
      inspectorTab.style.display = "none";
    });
  }

  // =========================================================================
  // 2. World Profile Switcher (Segmented Control + Card)
  // =========================================================================
  const modeSelect = document.getElementById("mode-select");
  const btnMegacity = document.getElementById("btn-profile-megacity");
  const btnLegacy = document.getElementById("btn-profile-legacy");
  const worldCardSubtitle = document.getElementById("world-card-subtitle");
  const worldCardDesc = document.getElementById("world-card-desc");
  const worldCardSeed = document.getElementById("world-card-seed");
  const worldCardChunks = document.getElementById("world-card-chunks");
  const topbarSeed = document.getElementById("topbar-seed-indicator");
  const topbarStatus = document.getElementById("topbar-status-text");

  function syncWorldProfileUI(mode) {
    const isMegacity = mode === "megacity";
    if (btnMegacity) btnMegacity.classList.toggle("is-active", isMegacity);
    if (btnLegacy) btnLegacy.classList.toggle("is-active", !isMegacity);

    if (worldCardSubtitle) {
      worldCardSubtitle.textContent = isMegacity ? "VERTICAL SLICE" : "PROCEDURAL CITY";
    }
    if (worldCardDesc) {
      worldCardDesc.textContent = isMegacity
        ? "Terraced City Center & Blackwall"
        : "Rotated Downtown Grid & Buildings";
    }
    if (worldCardSeed) {
      worldCardSeed.textContent = isMegacity ? "4242" : "1337";
    }
    if (worldCardChunks) {
      worldCardChunks.textContent = isMegacity ? "06 / 06" : "18 / 18";
    }
    if (topbarSeed) {
      topbarSeed.textContent = isMegacity ? "SEED 4242" : "SEED 1337";
    }
    if (topbarStatus) {
      topbarStatus.textContent = isMegacity ? "MEGACITY ONLINE" : "WORLD ONLINE";
    }

    // Update relevant tab visibility hints
    const glitchRail = document.getElementById("rail-glitch");
    if (glitchRail) {
      glitchRail.style.opacity = isMegacity ? "0.45" : "1.0";
      glitchRail.title = isMegacity ? "Glitch Cubes (Legacy profile only)" : "Glitch Cubes Tuner";
    }
  }

  if (btnMegacity) {
    btnMegacity.addEventListener("click", () => {
      if (modeSelect && modeSelect.value !== "megacity") {
        modeSelect.value = "megacity";
        modeSelect.dispatchEvent(new Event("change"));
        syncWorldProfileUI("megacity");
      }
    });
  }

  if (btnLegacy) {
    btnLegacy.addEventListener("click", () => {
      if (modeSelect && modeSelect.value !== "legacy") {
        modeSelect.value = "legacy";
        modeSelect.dispatchEvent(new Event("change"));
        syncWorldProfileUI("legacy");
      }
    });
  }

  // =========================================================================
  // 3. Display Layers
  // =========================================================================
  function wireSwitchToggle(buttonId, onToggle) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const isPressed = btn.getAttribute("aria-pressed") === "true";
      const nextState = !isPressed;
      btn.setAttribute("aria-pressed", String(nextState));
      const switchEl = btn.querySelector(".switch");
      if (switchEl) switchEl.classList.toggle("switch--on", nextState);
      onToggle(nextState, btn);
    });
  }

  // Structures (Instanced building solids)
  wireSwitchToggle("layer-structures-toggle", (visible) => {
    const { buildingMesh } = getObjects();
    if (buildingMesh) buildingMesh.visible = visible;
  });

  // Road network (Line view)
  wireSwitchToggle("layer-roads-toggle", (visible) => {
    const { lineView } = getObjects();
    if (lineView) lineView.visible = visible;
  });

  // Dot View vs Edge View
  let showingDots = false;
  wireSwitchToggle("view-toggle", (visible) => {
    const { lineView, sparseDotView, ensureDenseDotView, DENSE_DOT_ZOOM_THRESHOLD } = getObjects();
    showingDots = visible;
    if (lineView) lineView.visible = !showingDots;
    if (sparseDotView) sparseDotView.visible = showingDots;
    if (showingDots && cameraControls.getRadius() < DENSE_DOT_ZOOM_THRESHOLD && ensureDenseDotView) {
      ensureDenseDotView().visible = true;
    }
  });

  // Traffic flow (Megacity center vectors)
  wireSwitchToggle("layer-traffic-toggle", (visible) => {
    const { trafficLine } = getObjects();
    if (trafficLine) trafficLine.visible = visible;
  });

  // Blackwall boundary (Megacity)
  wireSwitchToggle("layer-blackwall-toggle", (visible) => {
    const { blackwallLine, blackwallMesh, blackwallGroundMesh } = getObjects();
    if (blackwallLine) blackwallLine.visible = visible;
    if (blackwallMesh) blackwallMesh.visible = visible;
    if (blackwallGroundMesh) blackwallGroundMesh.visible = visible;
  });

  // Glitch cubes toggle
  wireSwitchToggle("glitch-toggle", (visible) => {
    const objects = getObjects();
    if (objects.setGlitchVisible) {
      objects.setGlitchVisible(visible);
    } else if (objects.glitchMesh) {
      objects.glitchMesh.visible = visible;
    }
  });

  // Terrain heatmap & slope diagnostic layers
  wireSwitchToggle("terrain-heatmap-toggle", (visible) => {
    const { heatmapView } = getObjects();
    if (heatmapView) heatmapView.visible = visible;
  });

  wireSwitchToggle("terrain-slope-toggle", (visible) => {
    const { slopeView } = getObjects();
    if (slopeView) slopeView.visible = visible;
  });

  // =========================================================================
  // 4. Viewport Quick Controls
  // =========================================================================
  const camCenterBtn = document.getElementById("cam-center-btn");
  if (camCenterBtn) {
    camCenterBtn.addEventListener("click", () => {
      cameraControls.applyPreset("overview");
    });
  }

  const camRotateBtn = document.getElementById("cam-rotate-btn");
  if (camRotateBtn) {
    camRotateBtn.addEventListener("click", () => {
      const enabled = !cameraControls.isDriftEnabled();
      cameraControls.setDriftEnabled(enabled);
      camRotateBtn.classList.toggle("is-active", enabled);
      camRotateBtn.title = enabled ? "Stop drift" : "Auto-rotate / Drift";
    });
  }

  const camFullscreenBtn = document.getElementById("cam-fullscreen-btn");
  if (camFullscreenBtn) {
    camFullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // Camera Presets
  function wirePreset(id, name) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", () => cameraControls.applyPreset(name));
    }
  }
  wirePreset("preset-overview", "overview");
  wirePreset("preset-street", "street");
  wirePreset("preset-iso", "isometric");

  // =========================================================================
  // 5. Replay Controls & Scrubber Timeline
  // =========================================================================
  const replayCaptureBtn = document.getElementById("replay-capture");
  const replayUndoBtn = document.getElementById("replay-undo");
  const replayPlayBtn = document.getElementById("replay-play");
  const replayLoopBtn = document.getElementById("replay-loop");
  const replayTogglePathBtn = document.getElementById("replay-toggle-path");
  const replayStatus = document.getElementById("replay-status");

  const telemetryReplayPlay = document.getElementById("telemetry-replay-play");
  const telemetryReplayElapsed = document.getElementById("telemetry-replay-elapsed");
  const telemetryReplayDuration = document.getElementById("telemetry-replay-duration");
  const telemetryTimeline = document.getElementById("telemetry-timeline");
  const telemetryElapsedBar = document.getElementById("telemetry-elapsed-bar");
  const telemetryPlayhead = document.getElementById("telemetry-playhead");
  const telemetryReplayRec = document.getElementById("telemetry-replay-rec");

  const PLAY_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>`;
  const PAUSE_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>`;

  function formatTimecode(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  function handlePlayToggle() {
    if (replay.togglePlay) replay.togglePlay();
    else if (replay.isPlaying && replay.isPlaying()) replay.stop();
    else replay.play();
  }

  function handleCapture() {
    replay.capture();
    setActiveTab("replay");
  }

  if (replayCaptureBtn) replayCaptureBtn.addEventListener("click", handleCapture);
  if (telemetryReplayRec) telemetryReplayRec.addEventListener("click", handleCapture);
  if (replayUndoBtn) replayUndoBtn.addEventListener("click", () => replay.undo());
  if (replayPlayBtn) replayPlayBtn.addEventListener("click", handlePlayToggle);
  if (telemetryReplayPlay) telemetryReplayPlay.addEventListener("click", handlePlayToggle);
  if (replayLoopBtn) replayLoopBtn.addEventListener("click", () => (replay.toggleLoop ? replay.toggleLoop() : null));

  if (replayTogglePathBtn && replay.togglePath) {
    replayTogglePathBtn.addEventListener("click", () => {
      const visible = replay.togglePath();
      replayTogglePathBtn.textContent = visible ? "Hide Path" : "Show Path";
    });
  }

  // Timeline scrub click
  if (telemetryTimeline) {
    telemetryTimeline.addEventListener("click", (e) => {
      const rect = telemetryTimeline.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const s = replay.getStatus ? replay.getStatus() : null;
      if (s && s.duration > 0 && replay.seek) {
        replay.seek(pct * s.duration);
      }
    });
  }

  if (replay.onStatusChange) {
    replay.onStatusChange((s) => {
      const elapsedStr = formatTimecode(s.elapsed);
      const durationStr = formatTimecode(s.duration);
      const pct = s.duration > 0 ? Math.min(100, Math.max(0, (s.elapsed / s.duration) * 100)) : 0;

      if (replayStatus) {
        if (s.playing) {
          replayStatus.textContent = `Playing: ${s.elapsed.toFixed(1)}s / ${s.duration.toFixed(1)}s`;
        } else {
          replayStatus.textContent = `Waypoints: ${s.count} (${s.duration.toFixed(1)}s)`;
        }
      }

      if (replayPlayBtn) {
        replayPlayBtn.textContent = s.playing ? "Stop Replay" : "Play Replay";
      }
      if (telemetryReplayPlay) {
        telemetryReplayPlay.innerHTML = s.playing ? PAUSE_ICON : PLAY_ICON;
        telemetryReplayPlay.title = s.playing ? "Pause Replay" : "Play Replay";
      }
      if (telemetryReplayElapsed) telemetryReplayElapsed.textContent = elapsedStr;
      if (telemetryReplayDuration) telemetryReplayDuration.textContent = durationStr;
      if (telemetryElapsedBar) telemetryElapsedBar.style.width = `${pct}%`;
      if (telemetryPlayhead) telemetryPlayhead.style.left = `${pct}%`;

      if (replayLoopBtn) {
        replayLoopBtn.textContent = s.looping ? "Loop: On" : "Loop: Off";
      }
      if (replayTogglePathBtn && s.pathVisible !== undefined) {
        replayTogglePathBtn.textContent = s.pathVisible ? "Hide Path" : "Show Path";
      }
    });
  }

  // Export & Import
  const replayExportBtn = document.getElementById("replay-export");
  if (replayExportBtn) {
    replayExportBtn.addEventListener("click", () => {
      const blob = new Blob([replay.exportJSON()], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "cyberspace-replay.json";
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  const replayFile = document.getElementById("replay-file");
  const replayImportBtn = document.getElementById("replay-import");
  if (replayImportBtn && replayFile) {
    replayImportBtn.addEventListener("click", () => replayFile.click());
    replayFile.addEventListener("change", async () => {
      const file = replayFile.files && replayFile.files[0];
      if (!file) return;
      try {
        replay.importJSON(await file.text());
      } catch (error) {
        if (replayStatus) replayStatus.textContent = `Import error: ${error.message}`;
      }
      replayFile.value = "";
    });
  }

  // =========================================================================
  // 6. Glitch Cubes Tuners
  // =========================================================================
  function wireSlider(id, onChange) {
    const el = document.getElementById(id);
    if (!el) return;
    const out = document.getElementById(id + "-val");
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      if (out) {
        if (el.dataset.fmt === "pct") out.textContent = Math.round(v * 100) + "%";
        else if (el.dataset.fmt === "deg") out.textContent = Math.round(v) + "°";
        else out.textContent = v;
      }
      onChange(v);
    });
  }

  wireSlider("glitch-density-slider", (v) => {
    const objects = getObjects();
    if (objects.setGlitchDensityScale) objects.setGlitchDensityScale(v);
  });
  wireSlider("glitch-speed-slider", (v) => {
    const objects = getObjects();
    if (objects.setGlitchSpeedScale) objects.setGlitchSpeedScale(v);
  });
  wireSlider("glitch-extrude-slider", (v) => {
    const objects = getObjects();
    if (objects.setGlitchExtrudeScale) objects.setGlitchExtrudeScale(v);
  });
  wireSlider("glitch-jitter-slider", (v) => {
    const objects = getObjects();
    if (objects.setGlitchJitterScale) objects.setGlitchJitterScale(v);
  });
  wireSlider("glitch-size-slider", (v) => {
    const objects = getObjects();
    if (objects.setGlitchSizeScale) objects.setGlitchSizeScale(v);
  });

  // =========================================================================
  // 7. Preferences & Appearance
  // =========================================================================
  const edgeColorInput = document.getElementById("setting-edge-color");
  const edgeColorHex = document.getElementById("setting-edge-color-hex");
  if (edgeColorInput) {
    edgeColorInput.addEventListener("input", (e) => {
      const val = e.target.value;
      document.documentElement.style.setProperty("--accent", val);
      document.documentElement.style.setProperty("--accent-soft", `${val}24`);
      if (edgeColorHex) edgeColorHex.textContent = val.toUpperCase();
    });
  }

  const bgColorInput = document.getElementById("setting-bg-color");
  const bgColorHex = document.getElementById("setting-bg-color-hex");
  if (bgColorInput) {
    bgColorInput.addEventListener("input", (e) => {
      const val = e.target.value;
      document.documentElement.style.setProperty("--ink", val);
      if (bgColorHex) bgColorHex.textContent = val.toUpperCase();
      const objects = getObjects();
      if (renderer) renderer.setClearColor(val);
      if (objects.scene && objects.scene.fog) {
        objects.scene.fog.color.set(val);
      }
    });
  }

  wireSlider("streak-brightness-slider", (v) => {
    const objects = getObjects();
    if (objects.streakMat) objects.streakMat.color.setScalar(v);
  });

  wireSlider("fog-slider", (v) => {
    const objects = getObjects();
    if (!objects.scene || !objects.scene.fog) return;
    objects.scene.fog.near = 170 + (1 - v) * 2000;
    objects.scene.fog.far = 950 + (1 - v) * 4000;
  });

  wireSlider("drift-speed-slider", (v) => cameraControls.setDriftSpeed(v));
  wireSlider("pan-speed-slider", (v) => cameraControls.setPanSpeedScale(v));
  wireSlider("fly-speed-slider", (v) => cameraControls.setFlySpeedScale(v));
  wireSlider("fov-slider", (v) => {
    if (camera) {
      camera.fov = v;
      camera.updateProjectionMatrix();
    }
  });
  wireSlider("cam-smooth-slider", (v) => {
    if (cameraControls.setEase) cameraControls.setEase(v);
  });

  const resetBtn = document.getElementById("settings-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      document.documentElement.style.setProperty("--accent", "#ef5b37");
      document.documentElement.style.setProperty("--accent-soft", "rgba(239, 91, 55, 0.14)");
      if (edgeColorInput) edgeColorInput.value = "#ef5b37";
      if (edgeColorHex) edgeColorHex.textContent = "#EF5B37";

      document.documentElement.style.setProperty("--ink", "#050b16");
      if (bgColorInput) bgColorInput.value = "#050b16";
      if (bgColorHex) bgColorHex.textContent = "#050B16";

      cameraControls.setDriftSpeed(0.0015);
      cameraControls.setPanSpeedScale(1.0);
      cameraControls.setFlySpeedScale(1.0);
      if (cameraControls.setEase) cameraControls.setEase(0.16);
      if (camera) {
        camera.fov = 55;
        camera.updateProjectionMatrix();
      }
      syncSceneSettings(getObjects());
    });
  }

  // =========================================================================
  // 8. Navigation Mode Toggle & Help Modal
  // =========================================================================
  const flyToggleBtn = document.getElementById("fly-toggle");
  const camChipMode = document.getElementById("cam-chip-mode");

  function syncNavModeUI() {
    const isFlying = cameraControls.isFlying();
    if (flyToggleBtn) {
      flyToggleBtn.textContent = isFlying ? "FLY" : "ORBIT";
      flyToggleBtn.title = isFlying ? "Exit fly mode (Press Esc)" : "Switch to First-Person Fly Mode";
    }
    if (camChipMode) {
      camChipMode.textContent = isFlying ? "FLY_01" : "ORBIT";
    }
  }

  if (flyToggleBtn) {
    flyToggleBtn.addEventListener("click", () => {
      cameraControls.setFlyMode(!cameraControls.isFlying());
      syncNavModeUI();
    });
  }

  const helpDialog = document.getElementById("help-dialog");
  const helpBtn = document.getElementById("telemetry-help-btn");
  const helpCloseBtn = document.getElementById("help-close-btn");

  function toggleHelp(open) {
    if (!helpDialog) return;
    const shouldOpen = open !== undefined ? open : !helpDialog.classList.contains("is-open");
    helpDialog.classList.toggle("is-open", shouldOpen);
  }

  if (helpBtn) helpBtn.addEventListener("click", () => toggleHelp(true));
  if (helpCloseBtn) helpCloseBtn.addEventListener("click", () => toggleHelp(false));
  if (helpDialog) {
    helpDialog.addEventListener("click", (e) => {
      if (e.target === helpDialog) toggleHelp(false);
    });
  }

  // Automatically blur buttons after click so Space/WASD navigation keys are never hijacked
  document.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (e.currentTarget) e.currentTarget.blur();
    });
  });

  // Keyboard Shortcuts: H for Help, Tab for Maximized View, Esc for Release/Close
  const uiLayer = document.getElementById("ui-layer");
  window.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (uiLayer) uiLayer.classList.toggle("is-maximized");
    } else if (e.key === "h" || e.key === "H") {
      if (!e.ctrlKey && !e.altKey && !e.metaKey && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        toggleHelp();
      }
    } else if (e.key === "Escape") {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      if (helpDialog && helpDialog.classList.contains("is-open")) {
        toggleHelp(false);
      }
    }
  });

  // =========================================================================
  // 9. Sync Scene Settings on Generator Swaps
  // =========================================================================
  function syncSceneSettings(objects) {
    if (!objects) return;
    const densityEl = document.getElementById("glitch-density-slider");
    if (densityEl && objects.setGlitchDensityScale) {
      objects.setGlitchDensityScale(parseFloat(densityEl.value));
    }
    const speedEl = document.getElementById("glitch-speed-slider");
    if (speedEl && objects.setGlitchSpeedScale) {
      objects.setGlitchSpeedScale(parseFloat(speedEl.value));
    }
    const extrudeEl = document.getElementById("glitch-extrude-slider");
    if (extrudeEl && objects.setGlitchExtrudeScale) {
      objects.setGlitchExtrudeScale(parseFloat(extrudeEl.value));
    }
    const jitterEl = document.getElementById("glitch-jitter-slider");
    if (jitterEl && objects.setGlitchJitterScale) {
      objects.setGlitchJitterScale(parseFloat(jitterEl.value));
    }
    const sizeEl = document.getElementById("glitch-size-slider");
    if (sizeEl && objects.setGlitchSizeScale) {
      objects.setGlitchSizeScale(parseFloat(sizeEl.value));
    }
    const streakEl = document.getElementById("streak-brightness-slider");
    if (streakEl && objects.streakMat) {
      objects.streakMat.color.setScalar(parseFloat(streakEl.value));
    }
    const fogEl = document.getElementById("fog-slider");
    if (fogEl && objects.scene && objects.scene.fog) {
      const v = parseFloat(fogEl.value);
      objects.scene.fog.near = 170 + (1 - v) * 2000;
      objects.scene.fog.far = 950 + (1 - v) * 4000;
    }
  }

  return {
    getShowingDots: () => showingDots,
    syncSceneSettings,
    syncWorldProfileUI,
    syncNavModeUI,
    setActiveTab,
  };
}
