// js/meeting.js
(function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
const btn = document.getElementById("btnCreateRace");
if (btn && id) {
  btn.href = `course.html?meetingId=${encodeURIComponent(id)}`;
}

  const qEl = document.getElementById("q");
  const discEl = document.getElementById("fDisc");
  const ebikeEl = document.getElementById("fEbike");
  const minGlobalEl = document.getElementById("minGlobal");
  const minGlobalValEl = document.getElementById("minGlobalVal");
  const sortEl = document.getElementById("sortBy");
  const clearBtn = document.getElementById("clearBtn");
  const countFilteredEl = document.getElementById("countFiltered");
  const miniChartEl = document.getElementById("miniChart");

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function valOrDash(x){ const s = String(x ?? "").trim(); return s ? s : "—"; }
  function normalize(s){
    return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  }
  function parseDateKey(d){
    if (!d) return 0;
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return 0;
    return Number(m[1] + m[2] + m[3]);
  }

  const m = (typeof findMeeting === "function") ? findMeeting(id) : null;
  if (!m) {
    document.getElementById("mName").textContent = "Événement introuvable";
    return;
  }

  document.getElementById("mName").textContent = m.name || "—";
  document.getElementById("mMeta").textContent = `${m.date || "—"} • ${m.location || "—"}`;
  document.getElementById("mComment").textContent = m.comment || "";

  // Load all races (stored + base)
  const baseEvents = (window.VTT_DATA && Array.isArray(window.VTT_DATA.events)) ? window.VTT_DATA.events : [];
  const storedEvents = (typeof loadStoredEvents === "function") ? loadStoredEvents() : [];
  const all = [...storedEvents, ...baseEvents];

  const racesAll = (m.raceIds || [])
    .map(rid => all.find(e => e.id === rid))
    .filter(Boolean);

  // --- scoring logic (same as events/event-detail) ---
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

  const scoredAll = racesAll.map(ev => ({ ev, s: computeScores(ev) }));

  // KPI elements
  const kCount = document.getElementById("kpiCount");
  const kRange = document.getElementById("kpiRange");
  const kPhys = document.getElementById("kpiPhys");
  const kTech = document.getElementById("kpiTech");
  const kGlobal = document.getElementById("kpiGlobal");
  const kGlobal5 = document.getElementById("kpiGlobal5");
  const kGlobalBar = document.getElementById("kpiGlobalBar");
  const kParticipants = document.getElementById("kpiParticipants");
  const kHardestLink = document.getElementById("kpiHardestLink");
  const kHardestScore = document.getElementById("kpiHardestScore");

  function renderKPIs(scored) {
    if (!scored.length) {
      kCount.textContent = "0";
      kRange.textContent = "Aucune épreuve (avec ces filtres)";
      kPhys.textContent = "—";
      kTech.textContent = "—";
      kGlobal.textContent = "—";
      kGlobal5.textContent = "—";
      if (kGlobalBar) kGlobalBar.style.width = `0%`;
      kParticipants.textContent = "—";
      kHardestLink.textContent = "—";
      kHardestLink.href = "#";
      kHardestScore.textContent = "—";
      return;
    }

    const avgPhys = Math.round(scored.reduce((a,x)=>a+x.s.phys,0) / scored.length);
    const avgTech = Math.round(scored.reduce((a,x)=>a+x.s.tech,0) / scored.length);
    const avgGlobal = Math.round(scored.reduce((a,x)=>a+x.s.global,0) / scored.length);
    const avgGlobal5 = 1 + Math.round(4 * clamp(avgGlobal / 100, 0, 1));

    const minGlobal = Math.min(...scored.map(x => x.s.global));
    const maxGlobal = Math.max(...scored.map(x => x.s.global));
    const participantsTotal = scored.reduce((a,x)=> a + (Number(x.ev.participantsCount) || 0), 0);

    const hardest = scored.slice().sort((a,b)=> b.s.global - a.s.global)[0];

    kCount.textContent = String(scored.length);
    kRange.textContent = `Global min: ${minGlobal}/100 • max: ${maxGlobal}/100`;
    kPhys.textContent = String(avgPhys);
    kTech.textContent = String(avgTech);
    kGlobal.textContent = String(avgGlobal);
    kGlobal5.textContent = String(avgGlobal5);
    if (kGlobalBar) kGlobalBar.style.width = `${avgGlobal}%`;
    kParticipants.textContent = participantsTotal ? String(participantsTotal) : "—";

    kHardestLink.textContent = hardest.ev.name || "—";
    kHardestLink.href = `event.html?id=${encodeURIComponent(hardest.ev.id)}`;
    kHardestScore.textContent = `Global: ${hardest.s.global}/100 (≈${hardest.s.global5}/5) • ${hardest.ev.distanceKm ?? "—"} km • D+ ${hardest.ev.dplusM ?? "—"} m`;
  }

  function renderMiniChart(scored) {
    if (!miniChartEl) return;
    if (!scored.length) {
      miniChartEl.innerHTML = `<div class="muted">—</div>`;
      return;
    }
    const top = scored.slice().sort((a,b)=> b.s.global - a.s.global).slice(0, 8);
    miniChartEl.innerHTML = top.map(x => `
      <div class="chartRow">
        <div class="chartName" title="${valOrDash(x.ev.name)}">${valOrDash(x.ev.name)}</div>
        <div class="chartBarWrap"><div class="chartBar" style="width:${x.s.global}%;"></div></div>
        <div style="min-width:62px;text-align:right;"><strong>${x.s.global}</strong></div>
      </div>
    `).join("");
  }

  function renderList(scored) {
    const racesDiv = document.getElementById("races");
    if (!racesDiv) return;

    if (!scored.length) {
      racesDiv.innerHTML = `<div class="muted">Aucune épreuve ne correspond à ces filtres.</div>`;
      return;
    }

    racesDiv.innerHTML = scored.map(({ ev, s }) => `
      <a class="item" href="event.html?id=${encodeURIComponent(ev.id)}">
        <div class="title">
          ${valOrDash(ev.name)}
          <span class="muted">• ${valOrDash(ev.disc)} • ${valOrDash(ev.level)}</span>
          <span class="muted">• ${ev.ebike ? "E-Bike" : "Musculaire"}</span>
        </div>
        <div class="muted" style="margin-top:6px;">
          ${valOrDash(ev.date)} • ${ev.distanceKm ?? "—"} km • D+ ${ev.dplusM ?? "—"} m • Tech ${ev.tech5 ? ev.tech5 + "/5" : "—"}
        </div>
        <div class="muted" style="margin-top:6px;">
          Phys ${s.phys}/100 • Tech ${s.tech}/100 • <strong>Global ${s.global}/100</strong> (≈${s.global5}/5)
        </div>
        <div class="bar"><div style="width:${s.global}%;"></div></div>
      </a>
    `).join("");
  }

  function apply() {
    const q = normalize(qEl.value);
    const disc = discEl.value;
    const eb = ebikeEl.value; // "", "0", "1"
    const sortBy = sortEl.value;
    const minG = Number(minGlobalEl ? minGlobalEl.value : 0) || 0;

    if (minGlobalValEl) minGlobalValEl.textContent = String(minG);

    let scored = scoredAll.slice();

    if (q) {
      scored = scored.filter(x => {
        const hay = normalize([x.ev.name, x.ev.startPlace, x.ev.finishPlace, x.ev.comment].join(" "));
        return hay.includes(q);
      });
    }
    if (disc) scored = scored.filter(x => x.ev.disc === disc);
    if (eb !== "") scored = scored.filter(x => (!!x.ev.ebike) === (eb === "1"));

    // NEW: min global filter
    scored = scored.filter(x => x.s.global >= minG);

    // sort
    scored.sort((a,b) => {
      if (sortBy === "global_desc") return b.s.global - a.s.global;
      if (sortBy === "global_asc") return a.s.global - b.s.global;
      if (sortBy === "date_asc") return parseDateKey(a.ev.date) - parseDateKey(b.ev.date);
      if (sortBy === "date_desc") return parseDateKey(b.ev.date) - parseDateKey(a.ev.date);
      if (sortBy === "distance_desc") return Number(b.ev.distanceKm ?? 0) - Number(a.ev.distanceKm ?? 0);
      if (sortBy === "name_asc") return normalize(a.ev.name).localeCompare(normalize(b.ev.name));
      return b.s.global - a.s.global;
    });

    if (countFilteredEl) countFilteredEl.textContent = String(scored.length);

    renderKPIs(scored);
    renderMiniChart(scored);
    renderList(scored);
  }

  // events
  [qEl, discEl, ebikeEl, sortEl].forEach(el => el && el.addEventListener("input", apply));
  if (minGlobalEl) minGlobalEl.addEventListener("input", apply);

  clearBtn && clearBtn.addEventListener("click", () => {
    qEl.value = "";
    discEl.value = "";
    ebikeEl.value = "";
    sortEl.value = "global_desc";
    if (minGlobalEl) minGlobalEl.value = "0";
    if (minGlobalValEl) minGlobalValEl.textContent = "0";
    apply();
  });

  // initial
  if (minGlobalValEl && minGlobalEl) minGlobalValEl.textContent = String(minGlobalEl.value);
  apply();
})();

