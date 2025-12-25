// js/events.js
(function () {
  const list = document.getElementById("eventsList");
  const countEl = document.getElementById("count");

  const qEl = document.getElementById("q");
  const discEl = document.getElementById("fDisc");
  const levelEl = document.getElementById("fLevel");
  const ebikeEl = document.getElementById("fEbike");
  const sortEl = document.getElementById("sortBy");
  const clearBtn = document.getElementById("clearBtn");

  if (!list) return;

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function valOrDash(x) {
    if (x === null || x === undefined) return "—";
    const s = String(x).trim();
    return s ? s : "—";
  }

  function formatKm(x) {
    if (x === null || x === undefined) return "—";
    return `${String(x).replace(".", ",")} km`;
  }

  function formatM(x) {
    if (x === null || x === undefined) return "—";
    return `${x} m`;
  }

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();
  }

  // ----- scoring logic (same as event-detail.js) -----
  function computePhysScore(ev) {
    const D = Number(ev.distanceKm ?? 0);
    const H = Number(ev.dplusM ?? 0);
    const effort = Math.sqrt(Math.max(0, D)) + (H / 1000);

    const steep = (ev.gpx && ev.gpx.steep) ? ev.gpx.steep : {};
    const p10 = Number(steep.p10 ?? 0);
    const p15 = Number(steep.p15 ?? 0);

    const steepBonus = clamp(0.7 * p10 + 1.3 * p15, 0, 1);
    const effN = clamp(effort / 12, 0, 1);
    const phys = Math.round(100 * (0.78 * effN + 0.22 * steepBonus));

    return clamp(phys, 0, 100);
  }

  function computeTechScore(ev) {
    const surf = ev.surface || {};
    const r = clamp(Number(surf.roadPct ?? 0) / 100, 0, 1);
    const t = clamp(Number(surf.trackPct ?? 0) / 100, 0, 1);
    const s = clamp(Number(surf.singlePct ?? 0) / 100, 0, 1);
    const surfaceScore = clamp((0.0 * r) + (0.45 * t) + (1.0 * s), 0, 1);

    const rockyN = clamp(Number(ev.rockyPct ?? 0) / 100, 0, 1);
    const hairN = clamp(Number(ev.hairpins ?? 0) / 5, 0, 1);
    const jumpN = clamp(Number(ev.jumps ?? 0) / 5, 0, 1);
    const hikeN = clamp(Number(ev.hikeabike ?? 0) / 5, 0, 1);

    const techAuto = 100 * (
      0.30 * rockyN +
      0.30 * surfaceScore +
      0.15 * hairN +
      0.15 * jumpN +
      0.10 * hikeN
    );

    const tech5 = ev.tech5 ? clamp(Number(ev.tech5), 1, 5) : null;
    const techFromTech5 = tech5 ? ((tech5 - 1) / 4) * 100 : null;

    const tech = Math.round(
      techFromTech5 === null
        ? techAuto
        : (0.70 * techFromTech5 + 0.30 * techAuto)
    );

    return clamp(tech, 0, 100);
  }

  function computeScores(ev) {
    const phys = computePhysScore(ev);
    const tech = computeTechScore(ev);
    const global = Math.round(0.60 * phys + 0.40 * tech);
    const global5 = 1 + Math.round(4 * clamp(global / 100, 0, 1));
    return { phys, tech, global: clamp(global, 0, 100), global5 };
  }

  // Load events
  const baseEvents = (window.VTT_DATA && Array.isArray(window.VTT_DATA.events)) ? window.VTT_DATA.events : [];
  const storedEvents = (typeof loadStoredEvents === "function") ? loadStoredEvents() : [];
  const allEvents = [...storedEvents, ...baseEvents].map(ev => ({ ...ev, __scores: computeScores(ev) }));

  function parseDateKey(d) {
    // expects YYYY-MM-DD; fallback 0
    if (!d) return 0;
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return 0;
    return Number(m[1] + m[2] + m[3]);
  }

  function render(events) {
    if (countEl) countEl.textContent = String(events.length);

    if (!events.length) {
      list.innerHTML = `<div class="muted">Aucune épreuve ne correspond à ces filtres.</div>`;
      return;
    }

    list.innerHTML = `
      <div style="display:grid;gap:12px;">
        ${events.map(ev => {
          const s = ev.__scores;
          const level = valOrDash(ev.level);
          const disc = valOrDash(ev.disc);
          const ebikeBadge = ev.ebike
            ? `<span style="margin-left:8px;padding:2px 8px;border-radius:999px;background:#dcfce7;">E-Bike</span>`
            : `<span style="margin-left:8px;padding:2px 8px;border-radius:999px;background:#f1f5f9;">Musculaire</span>`;

          return `
            <a href="event.html?id=${encodeURIComponent(ev.id)}" style="text-decoration:none;color:inherit;">
              <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;box-shadow:0 2px 10px rgba(0,0,0,.05);">
                <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
                  <div>
                    <div style="font-weight:800;font-size:18px;">${valOrDash(ev.name)} ${ebikeBadge}</div>
                    <div style="color:#667085;margin-top:4px;">
                      ${valOrDash(ev.date)} • ${disc} • ${level}
                    </div>
                    <div style="color:#667085;margin-top:6px;">
                      ${formatKm(ev.distanceKm)} • ${formatM(ev.dplusM)}
                    </div>
                  </div>

                  <div style="min-width:300px;">
                    <div style="font-weight:700;margin-bottom:6px;">Difficulté</div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;color:#0f172a;">
                      <div>Phys: <strong>${s.phys}</strong>/100</div>
                      <div>Tech: <strong>${s.tech}</strong>/100</div>
                      <div>Global: <strong>${s.global}</strong>/100 (≈ <strong>${s.global5}</strong>/5)</div>
                    </div>
                    <div style="height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:8px;">
                      <div style="height:100%;width:${s.global}%;background:#2563eb;"></div>
                    </div>
                  </div>
                </div>
              </div>
            </a>
          `;
        }).join("")}
      </div>
    `;
  }

  function applyFilters() {
    const q = normalize(qEl.value);
    const disc = discEl.value;
    const level = levelEl.value;
    const eb = ebikeEl.value; // "", "0", "1"
    const sortBy = sortEl.value;

    let filtered = allEvents.slice();

    if (q) {
      filtered = filtered.filter(ev => {
        const hay = normalize([ev.name, ev.startPlace, ev.finishPlace, ev.comment].join(" "));
        return hay.includes(q);
      });
    }
    if (disc) filtered = filtered.filter(ev => ev.disc === disc);
    if (level) filtered = filtered.filter(ev => ev.level === level);
    if (eb !== "") filtered = filtered.filter(ev => (!!ev.ebike) === (eb === "1"));

    // Sort
    filtered.sort((a, b) => {
      const sa = a.__scores, sb = b.__scores;
      if (sortBy === "global_desc") return sb.global - sa.global;
      if (sortBy === "global_asc") return sa.global - sb.global;
      if (sortBy === "phys_desc") return sb.phys - sa.phys;
      if (sortBy === "tech_desc") return sb.tech - sa.tech;
      if (sortBy === "name_asc") return normalize(a.name).localeCompare(normalize(b.name));
      if (sortBy === "date_asc") return parseDateKey(a.date) - parseDateKey(b.date);
      return parseDateKey(b.date) - parseDateKey(a.date); // date_desc default
    });

    render(filtered);
  }

  [qEl, discEl, levelEl, ebikeEl, sortEl].forEach(el => el.addEventListener("input", applyFilters));
  clearBtn.addEventListener("click", () => {
    qEl.value = "";
    discEl.value = "";
    levelEl.value = "";
    ebikeEl.value = "";
    sortEl.value = "date_desc";
    applyFilters();
  });

  // initial
  render(allEvents);
  applyFilters();
})();



