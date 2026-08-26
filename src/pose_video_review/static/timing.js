(function initializeFrameTiming(root) {
  function frameForMediaTime(frameTimes, fps, mediaTime) {
    if (!frameTimes?.length) return Math.round(mediaTime * fps);
    let low = 0;
    let high = frameTimes.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (frameTimes[middle] < mediaTime) low = middle + 1;
      else high = middle;
    }
    if (
      low > 0
      && Math.abs(frameTimes[low - 1] - mediaTime) <= Math.abs(frameTimes[low] - mediaTime)
    ) return low - 1;
    return low;
  }

  function frameSeekTime(frameTimes, fps, frame, attempt = 0) {
    if (!frameTimes?.length) return frame / fps;
    const start = frameTimes[frame];
    const previousDuration = frame > 0 ? start - frameTimes[frame - 1] : 1 / fps;
    const end = frame + 1 < frameTimes.length ? frameTimes[frame + 1] : start + previousDuration;
    const fractions = [0.5, 0.25, 0.75];
    return start + (end - start) * fractions[Math.min(attempt, fractions.length - 1)];
  }

  const api = { frameForMediaTime, frameSeekTime };
  root.FrameTiming = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
