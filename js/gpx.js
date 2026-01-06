// js/gpx.js
// MTB Points — Frontend GPX analyzer
// Expose: window.analyzeGPX(file, opts?) -> Promise<GPXAnalysis>

(function () {
  // -------------------------
  // Status helpers (UI)
  // -------------------------
  function emitStatus(detail) {
    try {
      window.dispatchEvent(new CustomEvent("mtb:status", { detail }));
    } catch (_) {}
  }

  function setPhase(phase, message, opts = {}) {
    emitStatus({
      phase, // "idle" | "gpx" | "osm" | "done" | "error"
      message,
      progress: typeof opts.progress === "number" ? opts.progress : null,
      spinning: opts.spinning !== false,
      ts: Date.now(),
    });
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // -------------------------
  // Utils
  // -------------------------
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toRad(deg) { return (deg * Math.PI) / 180; }

  function haversi
