// js/ranking.js
// Classement public MTB Points
// - filtres: discipline, sexe, âge, e-bike, période (24 mois / année), recherche
// - top N (5/8/tout)
// - lit les résultats depuis les épreuves stockées (localStorage) : ev.results[]
//
// Format attendu pour chaque résultat (flexible) :
// {
//   firstName: "Paul", lastName: "Martin",  // ou name: "Paul Martin"
//   sex: "M"|"F",
//   ageCat: "U19"|"SENIOR"|...,
//   team: "Team X", nationality:"FR",
//   ebike: true|false,                       // optionnel (sinon hérite de ev.ebike)
//   status: "FIN"|"DNF"|"DNS"|"OT"|"DSQ",    // FIN=finisher
//   time: "02:34:12"                         // ou timeSec: 9252
// }
//
// Points (règle fixée) :
// - FIN: points = max(5, round(Pe' * r^-k))
// - DNF/DNS/OT/DSQ: 0
//
// Valeur d'épreuve Pe (0..200) :
// ScoreGlobal -> Pe = round(200*(S/100)^1.2)*M_level (clamp 0..200)
// S = 0.55*Phys + 0.45*Tech
// M_level Local/Régional/National/International = 0.8/1.0/1.2/1.5
//
// Correctif faible participation par catégorie (option activée) : Pe' = Pe * min(1, sqrt(N/30))

(function(){
  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    disc: $("disc"),
    sex: $("sex"),
    age: $("age"),
    ebike: $("ebike"),
    period: $("period"),
    year: $("year"),
    q: $("q"),
    topN: $("topN"),
    rows: $("rows"),
    resetBtn: $("resetBtn"),
    refreshBtn: $("refreshBtn"),
    lastUpdate: $("lastUpdate"),
  };

  // ---------- utils ----------
  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

  function normStr(s){
    return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }

  function parseTimeToSec(v){
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
    const s = String(v).trim();
    if (!s) return null;

    // allow "DNF" etc
    const upper = s.toUpperCase();
    if (["DNF","DNS","OT","DSQ","AB","ABANDON","HORS DELAI","HORS DÉLAI"].includes(upper)) return null;

    // "HH:MM:SS" or "MM:SS"
    const parts = s.split(":").map(x => x.trim());
    if (parts.length === 2 || parts.length === 3){
      const nums = parts.map(p => Number(p));
      if (nums.some(n => !Number.isFinite(n))) return null;
      let h=0,m=0,sec=0;
      if (parts.length === 2){ m=nums[0]; sec=nums[1]; }
      else { h=nums[0]; m=nums[1]; sec=nums[2]; }
      return Math.max(0, Math.round(h*3600 + m*60 + sec));
    }

    // "12345" seconds
    const n = Number(s.replace(",", "."));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
    return null;
  }

  function isoToDate(d){
    // expects YYYY-MM-DD
    const s = String(d||"").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2])-1, da = Number(m[3]);
    const dt = new Date(Date.UTC(y,mo,da,0,0,0));
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  function nowUTC(){ return new Date(); }

  function withinPeriod(eventDateISO, periodMode, yearStr){
    const d = isoToDate(eventDateISO);
    if (!d) return false;

    if (periodMode === "YEAR"){
      const y = Number(yearStr);
      if (!Number.isFinite(y)) return false;
      const yStart = new Date(Date.UTC(y,0,1,0,0,0));
      const yEnd = new Date(Date.UTC(y+1,0,1,0,0,0));
      return d >= yStart && d < yEnd;
    }

    // 24 months sliding
    const now = nowUTC();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0,0,0));
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - 24);
    return d >= start && d <= end;
  }

  function levelMultiplier(level){
    const s = String(level||"").toLowerCase();
    if (s.includes("intern")) return 1.5;
    if (s.includes("nation")) return 1.2;
    if (s.includes("rég") || s.includes("reg")) return 1.0;
    return 0.8; // local default
  }

  // ---------- storage ----------
  function loadEventsSafe(){
    // Prefer storage.js functions if present
    if (typeof loadStoredEvents === "function") {
      try { return loadStoredEvents() || []; } catch { /* fallthrough */ }
    }
    // Fallback to key
    const key = "vtt_events_v1";
    try{
      const raw = localStorage.getItem(key);
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // ---------- points engine ----------
  function computeEventValuePoints(ev){
    // Pe based on GPX scores
    const phys = Number(ev?.gpx?.phys?.score);
    const tech = Number(ev?.gpx?.tech?.techScore);
    if (!Number.isFinite(phys) || !Number.isFinite(tech)) return null;

    const S = 0.55*phys + 0.45*tech; // 0..100
    const gamma = 1.20;
    const base = 200 * Math.pow(clamp(S/100, 0, 1), gamma);
    const mult = levelMultiplier(ev?.level);
    const Pe = Math.round(base * mult);
    return clamp(Pe, 0, 200);
  }

  function normalizeStatus(res){
    const st = String(res?.status || "").trim().toUpperCase();
    if (st) return st;
    // infer from time content if provided as text
    const t = res?.time;
    if (t == null) return "DNS";
    const ts = String(t).trim().toUpperCase();
    if (!ts) return "DNS";
    if (["DNF","DNS","OT","DSQ","AB","ABANDON","HORS DELAI","HORS DÉLAI"].includes(ts)) {
      if (ts === "AB" || ts === "ABANDON") return "DNF";
      if (ts.startsWith("HORS")) return "OT";
      return ts;
    }
    // otherwise time looks parseable => FIN
    const sec = parseTimeToSec(t);
    return (sec != null) ? "FIN" : "DNS";
  }

  function getResultTimeSec(res){
    if (res?.timeSec != null) {
      const n = Number(res.timeSec);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
    }
    return parseTimeToSec(res?.time);
  }

  function getAthleteKey(res){
    // Prefer an explicit athleteId if you add it later
    if (res?.athleteId) return String(res.athleteId);

    const first = normStr(res?.firstName || "");
    const last = normStr(res?.lastName || "");
    let name = (first || last) ? (first + " " + last).trim() : normStr(res?.name || "");
    if (!name) name = "cycliste-inconnu";

    const nat = normStr(res?.nationality || "");
    return (name + "|" + nat).trim();
  }

  function displayName(res){
    const first = String(res?.firstName || "").trim();
    const last = String(res?.lastName || "").trim();
    if (first || last) return (first + " " + last).trim();
    return String(res?.name || "—").trim() || "—";
  }

  function matchFilters(ev, res, f){
    // discipline
    if (f.disc !== "ALL" && String(ev?.disc || "") !== f.disc) return false;

    // ebike: result can override, else inherit event
    const isEbike = (res?.ebike != null) ? !!res.ebike : !!ev?.ebike;
    if (f.ebike !== "ALL") {
      const want = (f.ebike === "1");
      if (isEbike !== want) return false;
    }

    // sex
    if (f.sex !== "ALL" && String(res?.sex || "").toUpperCase() !== f.sex) return false;

    // age
    if (f.age !== "ALL" && String(res?.ageCat || "") !== f.age) return false;

    // period
    if (!withinPeriod(ev?.date, f.period, f.year)) return false;

    return true;
  }

  function computePointsForCategoryResults(ev, catResults){
    // catResults: array of {res, timeSec, status, key}
    // Determine Pe and apply small participation correction (optional)
    const Pe = computeEventValuePoints(ev);
    if (Pe == null) return []; // cannot score without GPX scores

    // finishers only for reference time
    const finishers = catResults.filter(x => x.status === "FIN" && x.timeSec != null);
    if (!finishers.length) {
      // all get 0 (DNF/DNS/OT/DSQ or missing times)
      return catResults.map(x => ({...x, points: 0}));
    }

    // reference = best time (minimum)
    const tRef = Math.min(...finishers.map(x => x.timeSec));

    // participation correction
    const N = finishers.length;
    const corr = Math.min(1, Math.sqrt(N / 30));
    const PeAdj = Pe * corr;

    const k = 3.0;
    return catResults.map(x => {
      if (x.status !== "FIN" || x.timeSec == null) return ({...x, points: 0});
      const r = x.timeSec / tRef; // >= 1
      const pts = Math.round(PeAdj * Math.pow(r, -k));
      return ({...x, points: Math.max(5, pts)}); // min 5 for finishers
    });
  }

  // ---------- build ranking ----------
  function buildRanking(){
    const events = loadEventsSafe();

    const f = {
      disc: els.disc.value,
      sex: els.sex.value,
      age: els.age.value,
      ebike: els.ebike.value,
      period: els.period.value,
      year: els.year.value,
      q: normStr(els.q.value),
      topN: Number(els.topN.value)
    };

    // gather eligible results
    const rawRows = [];
    for (const ev of events){
      if (!ev) continue;
      const results = Array.isArray(ev.results) ? ev.results : [];
      if (!results.length) continue;

      for (const res of results){
        if (!matchFilters(ev, res, f)) continue;

        const status = normalizeStatus(res);
        const timeSec = getResultTimeSec(res);
        const key = getAthleteKey(res);

        rawRows.push({
          key,
          res,
          ev,
          status,
          timeSec
        });
      }
    }

    if (!rawRows.length) {
      return { rows: [], meta: { eventsCount: events.length, resultsCount: 0 } };
    }

    // group by event + category (to compute relative points correctly per category)
    // category key includes sex + age + ebike + discipline (discipline already filtered but keep stable)
    const byEventCat = new Map();

    for (const rr of rawRows){
      const ev = rr.ev;
      const disc = String(ev?.disc || "");
      const sex = String(rr.res?.sex || "").toUpperCase() || "U";
      const age = String(rr.res?.ageCat || "ALL");
      const eb = (rr.res?.ebike != null) ? (rr.res.ebike ? "E" : "M") : (ev?.ebike ? "E" : "M");
      const catKey = `${ev.id}__${disc}__${sex}__${age}__${eb}`;
      if (!byEventCat.has(catKey)) byEventCat.set(catKey, []);
      byEventCat.get(catKey).push(rr);
    }

    // compute points for each event-category group
    const scored = [];
    for (const [k, group] of byEventCat.entries()){
      const ev = group[0]?.ev;
      // map to minimal structures, compute points, then push back
      const catResults = group.map(x => ({
        key: x.key,
        res: x.res,
        ev: x.ev,
        status: x.status,
        timeSec: x.timeSec
      }));
      const withPts = computePointsForCategoryResults(ev, catResults);
      for (const x of withPts) scored.push(x);
    }

    // aggregate per athlete (top N)
    const perAthlete = new Map();

    for (const s of scored){
      // search filter (name/team)
      const n = normStr(displayName(s.res));
      const team = normStr(s.res?.team || "");
      if (f.q && !(n.includes(f.q) || team.includes(f.q))) continue;

      if (!perAthlete.has(s.key)){
        perAthlete.set(s.key, {
          key: s.key,
          name: displayName(s.res),
          team: String(s.res?.team || "—"),
          nationality: String(s.res?.nationality || "—"),
          pointsList: [],
          racesCount: 0
        });
      }
      const a = perAthlete.get(s.key);
      a.pointsList.push(Number(s.points) || 0);
      a.racesCount += 1;
      // keep best known non-empty
      if (a.team === "—" && s.res?.team) a.team = String(s.res.team);
      if (a.nationality === "—" && s.res?.nationality) a.nationality = String(s.res.nationality);
    }

    const athletes = Array.from(perAthlete.values()).map(a => {
      const pts = a.pointsList
        .filter(x => Number.isFinite(x))
        .sort((x,y)=>y-x);

      const used = (f.topN === 999) ? pts : pts.slice(0, Math.max(1, f.topN));
      const total = used.reduce((sum,x)=>sum+x,0);

      return {
        ...a,
        totalPoints: Math.round(total),
        usedCount: used.length
      };
    });

    athletes.sort((a,b)=> b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));

    return {
      rows: athletes,
      meta: {
        eventsCount: events.length,
        resultsCount: scored.length
      }
    };
  }

  // ---------- render ----------
  function render(){
    const out = buildRanking();

    // update last update text
    const now = new Date();
    if (els.lastUpdate) {
      const dd = String(now.getDate()).padStart(2,"0");
      const mm = String(now.getMonth()+1).padStart(2,"0");
      const yy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2,"0");
      const mi = String(now.getMinutes()).padStart(2,"0");
      els.lastUpdate.textContent = `Dernier calcul : ${dd}/${mm}/${yy} ${hh}:${mi}`;
    }

    const rowsEl = els.rows;
    if (!rowsEl) return;

    const rows = out.rows;

    if (!rows.length){
      rowsEl.innerHTML = `
        <tr>
          <td colspan="6" class="muted">
            Aucun résultat à afficher pour ces filtres.
            <br>Astuce : il faut que les épreuves contiennent <code>results[]</code> avec statuts FIN/DNF/DNS/OT/DSQ et temps.
          </td>
        </tr>
      `;
      return;
    }

    const html = rows.map((r, idx) => {
      const rank = idx + 1;
      return `
        <tr>
          <td><strong>${rank}</strong></td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.team)}</td>
          <td>${escapeHtml(r.nationality)}</td>
          <td><strong>${r.totalPoints}</strong></td>
          <td>${r.usedCount} / ${r.racesCount}</td>
        </tr>
      `;
    }).join("");

    rowsEl.innerHTML = html;
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------- events ----------
  function bind(){
    const rerender = () => render();

    ["change","input"].forEach(evt => {
      els.disc?.addEventListener(evt, rerender);
      els.sex?.addEventListener(evt, rerender);
      els.age?.addEventListener(evt, rerender);
      els.ebike?.addEventListener(evt, rerender);
      els.period?.addEventListener(evt, rerender);
      els.year?.addEventListener(evt, rerender);
      els.q?.addEventListener(evt, rerender);
      els.topN?.addEventListener(evt, rerender);
    });

    els.refreshBtn?.addEventListener("click", rerender);

    els.resetBtn?.addEventListener("click", () => {
      if (els.disc) els.disc.value = "ALL";
      if (els.sex) els.sex.value = "ALL";
      if (els.age) els.age.value = "ALL";
      if (els.ebike) els.ebike.value = "ALL";
      if (els.period) els.period.value = "24M";
      if (els.year) {
        const y = new Date().getFullYear();
        els.year.value = String(y);
        els.year.disabled = true;
      }
      if (els.q) els.q.value = "";
      if (els.topN) els.topN.value = "5";
      render();
    });
  }

  bind();
  render();
})();
