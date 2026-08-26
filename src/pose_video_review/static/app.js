const state = {
  trials: [],
  entries: [],
  poses: new Map(),
  offsets: new Map(),
  elapsed: 0,
  duration: 0,
  playing: false,
  animationFrame: null,
  lastSyncAt: 0,
  playbackStartedAt: 0,
  playbackStartElapsed: 0,
  loadRevision: 0,
};

const els = Object.fromEntries([
  "trialSelect", "showPose", "status", "cameraGrid", "playButton",
  "stepBackButton", "stepForwardButton", "timeSlider", "currentTime",
  "duration", "speedSelect", "loopPlayback", "tileSize", "tileSizeValue",
  "saveOffsetsButton", "saveFilter",
].map((id) => [id, document.getElementById(id)]));

const TILE_SIZE_STORAGE_KEY = "pose-video-review:tile-size";

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
  return payload;
}

function setStatus(message, error = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", error);
}

function trialStatusLabel(trial) {
  if (trial.saveStatus === "saved") return "Saved";
  return "Unsaved";
}

function filteredTrials() {
  const filter = els.saveFilter.value;
  return filter === "all" ? state.trials : state.trials.filter((trial) => trial.saveStatus === filter);
}

function renderTrialOptions(preferredId = els.trialSelect.value) {
  const trials = filteredTrials();
  const counts = { unsaved: 0, saved: 0 };
  for (const trial of state.trials) counts[trial.saveStatus] += 1;
  els.saveFilter.options[0].textContent = `All (${state.trials.length})`;
  els.saveFilter.options[1].textContent = `Unsaved (${counts.unsaved})`;
  els.saveFilter.options[2].textContent = `Saved (${counts.saved})`;
  els.trialSelect.innerHTML = "";
  for (const trial of trials) {
    const option = document.createElement("option");
    option.value = trial.id;
    option.textContent = `${trial.id} · ${trial.cameraCount} cameras · ${trialStatusLabel(trial)}`;
    els.trialSelect.append(option);
  }
  if (trials.some((trial) => trial.id === preferredId)) els.trialSelect.value = preferredId;
  els.trialSelect.disabled = trials.length === 0;
  return els.trialSelect.value || null;
}

function showEmptyFilter() {
  state.loadRevision += 1;
  pauseVideos();
  state.entries = [];
  els.cameraGrid.innerHTML = "";
  els.saveOffsetsButton.disabled = true;
  setStatus(`No ${els.saveFilter.value} trials`);
}

function setTileSize(value) {
  const size = Math.max(260, Math.min(900, Math.round(Number(value) || 430)));
  document.documentElement.style.setProperty("--tile-width", `${size}px`);
  els.tileSize.value = String(size);
  els.tileSizeValue.textContent = `${size} px`;
  localStorage.setItem(TILE_SIZE_STORAGE_KEY, String(size));
  requestAnimationFrame(render);
}

function loadOffset(entry) {
  const saved = Number(entry.savedOffsetFrames);
  if (Number.isFinite(saved)) return Math.round(saved);
  return 0;
}

function offsetFrames(entry) {
  return state.offsets.get(entry.id) || 0;
}

function frameAt(entry, elapsed = state.elapsed) {
  const [start, end] = entry.frameRange;
  const frame = Math.round(start + elapsed * entry.fps + offsetFrames(entry));
  return Math.max(0, Math.min(entry.numFrames - 1, frame));
}

function targetVideoTime(entry, elapsed = state.elapsed) {
  return frameAt(entry, elapsed) / entry.fps;
}

function referenceStep() {
  return state.entries.length ? 1 / state.entries[0].fps : 1 / 30;
}

function videoFor(entry) {
  return document.querySelector(`video[data-entry-id="${entry.id}"]`);
}

function overlayFor(entry) {
  return document.querySelector(`canvas[data-entry-id="${entry.id}"]`);
}

function pauseVideos() {
  state.playing = false;
  els.playButton.textContent = "Play";
  if (state.animationFrame !== null) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = null;
  for (const entry of state.entries) videoFor(entry)?.pause();
}

function seekVideos(force = false) {
  for (const entry of state.entries) {
    const video = videoFor(entry);
    if (!video) continue;
    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) continue;
    const target = targetVideoTime(entry);
    if (force || Math.abs(video.currentTime - target) > 0.08) video.currentTime = target;
  }
}

function resizeOverlay(entry) {
  const canvas = overlayFor(entry);
  const video = videoFor(entry);
  if (!canvas || !video) return null;
  const bounds = video.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * dpr));
  const height = Math.max(1, Math.round(bounds.height * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const containScale = Math.min(width / entry.width, height / entry.height);
  const contentWidth = entry.width * containScale;
  const contentHeight = entry.height * containScale;
  return {
    canvas,
    contentWidth,
    contentHeight,
    offsetX: (width - contentWidth) / 2,
    offsetY: (height - contentHeight) / 2,
  };
}

function drawPose(ctx, payload, frame, scaleX, scaleY) {
  if (!payload?.available || !payload.frames?.[frame]) return;
  const points = payload.frames[frame];
  ctx.lineWidth = Math.max(2, 2.5 / Math.min(scaleX, scaleY));
  ctx.strokeStyle = "#70f0b1";
  ctx.fillStyle = "#b5ffd8";
  for (const [a, b] of payload.edges || []) {
    if (!points[a] || !points[b]) continue;
    ctx.beginPath();
    ctx.moveTo(points[a][0], points[a][1]);
    ctx.lineTo(points[b][0], points[b][1]);
    ctx.stroke();
  }
  const radius = Math.max(2.5, 4 / Math.min(scaleX, scaleY));
  for (const point of Object.values(points)) {
    ctx.beginPath();
    ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderEntry(entry) {
  const frame = frameAt(entry);
  const poseFrame = frame + (entry.poseFrameOffset || 0);
  const label = document.querySelector(`[data-frame-label="${entry.id}"]`);
  if (label) label.textContent = `frame ${frame} · ${(frame / entry.fps).toFixed(3)} s`;
  const cameraSlider = document.querySelector(`input[data-offset-input="${entry.id}"]`);
  if (cameraSlider) cameraSlider.value = String(frame);
  updateOffsetLabel(entry);
  const overlay = resizeOverlay(entry);
  if (!overlay) return;
  const { canvas, contentWidth, contentHeight, offsetX, offsetY } = overlay;
  const poseScaleX = contentWidth / (entry.poseWidth || entry.width);
  const poseScaleY = contentHeight / (entry.poseHeight || entry.height);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!els.showPose.checked) return;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(poseScaleX, poseScaleY);
  drawPose(ctx, state.poses.get(entry.id), poseFrame, poseScaleX, poseScaleY);
  ctx.restore();
}

function render() {
  els.timeSlider.value = String(state.elapsed);
  els.currentTime.textContent = `${state.elapsed.toFixed(3)} s`;
  for (const entry of state.entries) renderEntry(entry);
}

function setElapsed(value, seek = true) {
  state.elapsed = Math.max(0, Math.min(state.duration, Number(value) || 0));
  if (seek) seekVideos(true);
  render();
}

function updateOffsetLabel(entry) {
  const frame = frameAt(entry);
  const frames = offsetFrames(entry);
  const output = document.querySelector(`[data-offset-label="${entry.id}"]`);
  if (output) {
    const sign = frames > 0 ? "+" : "";
    const seconds = frames / entry.fps;
    output.textContent = `frame ${frame} · offset ${sign}${frames} f (${seconds >= 0 ? "+" : ""}${seconds.toFixed(3)} s)`;
  }
}

function setCameraFrame(entry, value) {
  const selectedFrame = Math.round(Number(value) || 0);
  const sharedFrame = Math.round(entry.frameRange[0] + state.elapsed * entry.fps);
  const frames = selectedFrame - sharedFrame;
  state.offsets.set(entry.id, frames);
  els.saveOffsetsButton.disabled = false;
  els.saveOffsetsButton.classList.add("unsaved");
  updateOffsetLabel(entry);
  seekVideos(true);
  renderEntry(entry);
}

function setFocusedTile(tile, focused) {
  document.querySelector(".camera-tile.focused")?.classList.remove("focused");
  if (focused) tile.classList.add("focused");
  document.body.classList.toggle("tile-focused", focused);
  requestAnimationFrame(render);
}

function buildTiles() {
  document.body.classList.remove("tile-focused");
  els.cameraGrid.innerHTML = "";
  for (const entry of state.entries) {
    state.offsets.set(entry.id, loadOffset(entry));
    const tile = document.createElement("article");
    tile.className = "camera-tile";

    const header = document.createElement("header");
    const title = document.createElement("strong");
    title.textContent = entry.camera;
    const frameLabel = document.createElement("span");
    frameLabel.dataset.frameLabel = entry.id;
    header.append(title, frameLabel);

    const stage = document.createElement("div");
    stage.className = "video-stage";
    stage.style.aspectRatio = `${entry.width} / ${entry.height}`;
    stage.tabIndex = 0;
    stage.setAttribute("role", "button");
    stage.setAttribute("aria-label", `Enlarge ${entry.camera}`);
    stage.title = "Click to enlarge this camera; click again or press Escape to close";
    const toggleFocus = () => setFocusedTile(tile, !tile.classList.contains("focused"));
    stage.addEventListener("click", toggleFocus);
    stage.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        toggleFocus();
      }
    });
    const video = document.createElement("video");
    video.dataset.entryId = entry.id;
    video.src = `/media?id=${encodeURIComponent(entry.id)}`;
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.disablePictureInPicture = true;
    video.setAttribute("aria-label", `${entry.camera} video`);
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = targetVideoTime(entry);
      renderEntry(entry);
    });
    video.addEventListener("seeked", () => renderEntry(entry));
    const overlay = document.createElement("canvas");
    overlay.dataset.entryId = entry.id;
    overlay.setAttribute("aria-hidden", "true");
    stage.append(video, overlay);

    const alignment = document.createElement("div");
    alignment.className = "alignment-control";
    const alignmentHeader = document.createElement("div");
    const alignmentTitle = document.createElement("span");
    alignmentTitle.textContent = "Camera frame";
    const offsetLabel = document.createElement("output");
    offsetLabel.dataset.offsetLabel = entry.id;
    alignmentHeader.append(alignmentTitle, offsetLabel);
    const sliderRow = document.createElement("div");
    sliderRow.className = "offset-slider-row";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.dataset.offsetInput = entry.id;
    slider.min = "0";
    slider.max = String(entry.numFrames - 1);
    slider.step = "1";
    slider.value = String(frameAt(entry));
    slider.addEventListener("input", () => {
      pauseVideos();
      setCameraFrame(entry, slider.value);
    });
    sliderRow.append(slider);
    alignment.append(alignmentHeader, sliderRow);

    const footer = document.createElement("footer");
    const metadata = document.createElement("span");
    metadata.textContent = `${entry.width}×${entry.height} · ${entry.fps.toFixed(2)} fps`;
    const poseState = document.createElement("span");
    poseState.className = "pose-state loading";
    poseState.dataset.poseState = entry.id;
    poseState.textContent = "Checking pose…";
    footer.append(metadata, poseState);

    tile.append(header, stage, alignment, footer);
    els.cameraGrid.append(tile);
    updateOffsetLabel(entry);
  }
}

function updatePoseState(entry, payload) {
  const badge = document.querySelector(`[data-pose-state="${entry.id}"]`);
  if (!badge) return;
  badge.classList.remove("loading", "available", "missing");
  if (payload.available) {
    badge.classList.add("available");
    badge.textContent = `${entry.poseType} · ${payload.frames.length} frames`;
  } else {
    badge.classList.add("missing");
    badge.textContent = "No pose file";
    badge.title = payload.message || "No pose data is available for this camera.";
  }
}

async function loadTrial(id) {
  const revision = ++state.loadRevision;
  pauseVideos();
  setStatus("Loading trial…");
  const payload = await getJson(`/api/trial?id=${encodeURIComponent(id)}`);
  if (revision !== state.loadRevision) return;
  state.entries = payload.entries;
  state.elapsed = 0;
  state.duration = Math.min(...state.entries.map((entry) => entry.durationSeconds));
  state.poses.clear();
  state.offsets.clear();
  buildTiles();
  els.saveOffsetsButton.disabled = false;
  els.saveOffsetsButton.classList.remove("unsaved");
  els.timeSlider.max = String(state.duration);
  els.timeSlider.step = String(referenceStep());
  els.duration.textContent = `${state.duration.toFixed(3)} s`;
  seekVideos(true);
  render();

  const poseResults = await Promise.all(state.entries.map(async (entry) => {
    try { return [entry, await getJson(`/api/poses?id=${encodeURIComponent(entry.id)}`)]; }
    catch (error) { return [entry, { available: false, message: error.message, frames: [] }]; }
  }));
  if (revision !== state.loadRevision) return;
  for (const [entry, poses] of poseResults) {
    state.poses.set(entry.id, poses);
    updatePoseState(entry, poses);
  }
  const available = poseResults.filter(([, poses]) => poses.available).length;
  setStatus(`${state.entries.length} cameras · pose data for ${available}`);
  render();
}

function stopAtEnd() {
  pauseVideos();
  state.elapsed = state.duration;
  seekVideos(true);
  render();
}

function tick(timestamp) {
  if (!state.playing) return;
  const rate = Number(els.speedSelect.value);
  state.elapsed = state.playbackStartElapsed + (timestamp - state.playbackStartedAt) / 1000 * rate;
  if (state.elapsed >= state.duration - referenceStep() / 2) {
    if (els.loopPlayback.checked) {
      setElapsed(0, true);
      state.playbackStartElapsed = 0;
      state.playbackStartedAt = timestamp;
    } else {
      stopAtEnd();
      return;
    }
  }
  if (timestamp - state.lastSyncAt > 500) {
    seekVideos(false);
    state.lastSyncAt = timestamp;
  }
  render();
  state.animationFrame = requestAnimationFrame(tick);
}

async function startPlayback() {
  if (state.elapsed >= state.duration - referenceStep() / 2) setElapsed(0, true);
  const rate = Number(els.speedSelect.value);
  seekVideos(true);
  for (const entry of state.entries) videoFor(entry).playbackRate = rate;
  try {
    await Promise.all(state.entries.map((entry) => videoFor(entry).play()));
    state.playing = true;
    els.playButton.textContent = "Pause";
    state.playbackStartElapsed = state.elapsed;
    state.playbackStartedAt = performance.now();
    state.lastSyncAt = performance.now();
    state.animationFrame = requestAnimationFrame(tick);
  } catch (error) {
    pauseVideos();
    setStatus(`Playback failed: ${error.message}`, true);
  }
}

async function saveOffsets() {
  els.saveOffsetsButton.disabled = true;
  const offsets = state.entries.map((entry) => ({
    id: entry.id,
    offset_frames: offsetFrames(entry),
  }));
  try {
    const result = await postJson("/api/offsets", { offsets });
    for (const entry of state.entries) {
      entry.savedOffsetFrames = offsetFrames(entry);
      entry.hasSavedOffset = true;
    }
    const currentTrial = state.trials.find((trial) => trial.id === els.trialSelect.value);
    if (currentTrial) {
      currentTrial.savedCameraCount = currentTrial.cameraCount;
      currentTrial.saveStatus = "saved";
    }
    els.saveOffsetsButton.classList.remove("unsaved");
    setStatus(`Saved ${result.saved} camera offsets`);
    const nextId = renderTrialOptions(currentTrial?.id);
    if (nextId && nextId !== currentTrial?.id) await loadTrial(nextId);
    else if (!nextId) showEmptyFilter();
  } catch (error) {
    els.saveOffsetsButton.disabled = false;
    setStatus(`Could not save offsets: ${error.message}`, true);
  }
}

els.trialSelect.addEventListener("change", () => loadTrial(els.trialSelect.value).catch((error) => setStatus(error.message, true)));
els.saveFilter.addEventListener("change", () => {
  const nextId = renderTrialOptions();
  if (nextId) loadTrial(nextId).catch((error) => setStatus(error.message, true));
  else showEmptyFilter();
});
els.saveOffsetsButton.addEventListener("click", saveOffsets);
els.tileSize.addEventListener("input", () => setTileSize(els.tileSize.value));
els.showPose.addEventListener("change", render);
els.timeSlider.addEventListener("input", () => {
  pauseVideos();
  setElapsed(els.timeSlider.value, true);
});
els.stepBackButton.addEventListener("click", () => {
  pauseVideos();
  setElapsed(state.elapsed - referenceStep(), true);
});
els.stepForwardButton.addEventListener("click", () => {
  pauseVideos();
  setElapsed(state.elapsed + referenceStep(), true);
});
els.playButton.addEventListener("click", () => {
  if (state.playing) pauseVideos();
  else startPlayback();
});
els.speedSelect.addEventListener("change", () => {
  const rate = Number(els.speedSelect.value);
  for (const entry of state.entries) {
    const video = videoFor(entry);
    if (video) video.playbackRate = rate;
  }
});
window.addEventListener("resize", render);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector(".camera-tile.focused")) {
    setFocusedTile(document.querySelector(".camera-tile.focused"), false);
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === "ArrowLeft") els.stepBackButton.click();
  if (event.key === "ArrowRight") els.stepForwardButton.click();
  if (event.key === " ") { event.preventDefault(); els.playButton.click(); }
});

setTileSize(localStorage.getItem(TILE_SIZE_STORAGE_KEY) || els.tileSize.value);

getJson("/api/trials").then(({ trials }) => {
  state.trials = trials;
  if (!trials.length) throw new Error("No dynamic trials were found.");
  return loadTrial(renderTrialOptions());
}).catch((error) => setStatus(error.message, true));
