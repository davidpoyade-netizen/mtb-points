// js/ranking.js
// Classement public + grille Top 5 (24 mois) par groupes fixes

(function(){
  const $ = (id) => document.getElementById(id);

  const els = {
    disc: $("disc"),
    sex: $("sex"),
    age: $("age"),
    ebike: $("ebike"),
    period: $("period"),
    year: $("year"),

    nat: $("nat"),
    sort: $("sort"),
    q: $("q"),
    topN: $("topN"),

    rows: $("rows"),
    resetBtn: $("resetBtn"),
    refreshBtn: $("refreshBtn"),
    lastUpdate: $("lastUpdate"),

    // Top grid
    top_vtt_m_mus: $("top_vtt_m_mus"),
    top_vtt_m_ebike: $("top_vtt_m_ebike"),
    top_vtt_f_mus: $("top_vtt_f_mus"),
    top_vtt_f_ebike: $("top_vtt_f_ebike"),
    top_gravel_m: $("top_gravel_m"),
    top_gravel_f: $("top_gravel_f"),
  };

  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
  function normStr(s){
    return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }
  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function parseTimeToSec(v){
    if (v == null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
    const s = String(v).trim();
    if (!s) return null;

    const upper = s.toUpperCase();
    if (["DNF","DNS","OT","DSQ","AB","ABANDON","HORS DELAI","HORS DÉLAI"].includes(upper)) return null;

    const parts = s.split(":").map(x => x.trim());
    if (parts.length === 2 || parts.length === 3){
      const nums = parts.map(p => Number(p));
      if (nums.some(n => !Number.isFinite(n))) return null;
      let h=0,m=0,sec=0;
      if (parts.length === 2){ m=nums[0]; sec=nums[1]; }
      else { h=nums[0]; m=nums[1]; sec=nums[2]; }
      return Math.max(0, Math.round(h*3600 + m*60 + sec));
    }

    const n = Number(s.replace(",", "."));
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
    return null;
  }

  function isoToDate(d){
    const s = String(d||"").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2])-1, da = Number(m[3]);
    const dt = new Date(Date.UTC(y,mo,da,0,0,0));
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

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

    const now = new Date();
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
    return 0.8;
  }

  function loadEventsSafe(){
    if (typeof loadStoredEvents === "function") {
      try { return loadStoredEvents() || []; } catch {}
    }
    const key = "vtt_events_v1";
    try{
      const raw = localStorage.getItem(key);
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function computeEventValuePoints(ev){
    const phys = Number(ev?.gpx?.phys?.score);
    const tech = Number(ev?.gpx?.tech?.techScore);
    if (!Number.isFinite(phys) || !Number.isFinite(tech)) return null;

    const S = 0.55*phys + 0.45*tech;
    const gamma = 1.20;
    const base = 200 * Math.pow(clamp(S/100, 0, 1), gamma);
    const mult = levelMultiplier(ev?.level);
    const Pe = Math.round(base * mult);
    return clamp(Pe, 0, 200);
  }

  function normalizeStatus(res){
    const st = String(res?.status || "").trim().toUpperCase();
    if (st) return st;
    const t = res?.time;
    if (t == null) return "DNS";
    const ts = String(t).trim().toUpperCase();
    if (!ts) return "DNS";
    if (["DNF","DNS","OT","DSQ","AB","ABANDON","HORS DELAI","HORS DÉLAI"].includes(ts)) {
      if (ts === "AB" || ts === "ABANDON") return "DNF";
      if (ts.startsWith("HORS")) return "OT";
      return ts;
    }
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

  function getResultNat(res){
    const n = String(res?.nationality || "").trim().toUpperCase();
    return n || "—";
  }

  function matchFilters(ev, res, f){
    if (f.disc !== "ALL" && String(ev?.disc || "") !== f.disc) return false;

    const isEbike = (res?.ebike != null) ? !!res.ebike : !!ev?.ebike;
    if (f.ebike !== "ALL") {
      const want = (f.ebike === "1");
      if (isEbike !== want) return false;
    }

    if (f.sex !== "ALL" && String(res?.sex || "").toUpperCase() !== f.sex) return false;
    if (f.age !== "ALL" && String(res?.ageCat || "") !== f.age) return false;

    if (f.nat !== "ALL"){
      if (getResultNat(res) !== f.nat) return false;
    }

    if (!withinPeriod(ev?.date, f.period, f.year)) return false;

    return true;
  }

  function computePointsForEventCategory(ev, group){
    const Pe = computeEventValuePoints(ev);
    if (Pe == null) return group.map(x => ({...x, points:0}));

    const finishers = group.filter(x => x.status === "FIN" && x.timeSec != null);
    if (!finishers.length) return group.map(x => ({...x, points:0}));

    const tRef = Math.min(...finishers.map(x => x.timeSec));
    const N = finishers.length;
    const corr = Math.min(1, Math.sqrt(N / 30));
    const PeAdj = Pe * corr;
    const k = 3.0;

    return group.map(x => {
      if (x.status !== "FIN" || x.timeSec == null) return ({...x, points:0});
      const r = x.timeSec / tRef;
      const pts = Math.round(PeAdj * Math.pow(r, -k));
      return ({...x, points: Math.max(5, pts)});
    });
  }

  function collectScoredRows(filter){
    const events = loadEventsSafe();
    const raw = [];

    for (const ev of events){
      const results = Array.isArray(ev?.results) ? ev.results : [];
      if (!results.length) continue;

      for (const res of results){
        if (!matchFilters(ev, res, filter)) continue;

        raw.push({
          ev,
          res,
          status: normalizeStatus(res),
          timeSec: getResultTimeSec(res),
          key: getAthleteKey(res)
        });
      }
    }

    // group by event + category (sex + age + ebike + disc)
    const byEventCat = new Map();
    for (const rr of raw){
      const disc = String(rr.ev?.disc || "");
      const sex = String(rr.res?.sex || "").toUpperCase() || "U";
      const age = String(rr.res?.ageCat || "ALL");
      const eb = (rr.res?.ebike != null) ? (rr.res.ebike ? "E" : "M") : (rr.ev?.ebike ? "E" : "M");
      const catKey = `${rr.ev.id}__${disc}__${sex}__${age}__${eb}`;

      if (!byEventCat.has(catKey)) byEventCat.set(catKey, []);
      byEventCat.get(catKey).push(rr);
    }

    const scored = [];
    for (const [k, group] of byEventCat.entries()){
      const ev = group[0].ev;
      const withPts = computePointsForEventCategory(ev, group);
      for (const x of withPts) scored.push(x);
    }

    return { scored, eventsCount: events.length };
  }

  function aggregateAthletes(scored, topN, qStr){
    const per = new Map();

    for (const s of scored){
      const name = displayName(s.res);
      const team = String(s.res?.team || "—");
      const nat = getResultNat(s.res);

      // search filter
      if (qStr){
        const nq = normStr(qStr);
        if (!normStr(name).includes(nq) && !normStr(team).includes(nq)) continue;
      }

      if (!per.has(s.key)){
        per.set(s.key, {
          key: s.key,
          name,
          team,
          nationality: nat,
          pointsList: [],
          racesCount: 0
        });
      }

      const a = per.get(s.key);
      a.pointsList.push(Number(s.points) || 0);
      a.racesCount += 1;

      if (a.team === "—" && team !== "—") a.team = team;
      if ((a.nationality === "—" || !a.nationality) && nat) a.nationality = nat;
    }

    const athletes = Array.from(per.values()).map(a => {
      const pts = a.pointsList.filter(Number.isFinite).sort((x,y)=>y-x);
      const used = (topN === 999) ? pts : pts.slice(0, Math.max(1, topN));
      const total = used.reduce((sum,x)=>sum+x,0);

      return {
        ...a,
        totalPoints: Math.round(total),
        usedCount: used.length
      };
    });

    return athletes;
  }

  function sortAthletes(arr, sortMode){
    const copy = [...arr];
    if (sortMode === "NAME_ASC"){
      copy.sort((a,b)=>a.name.localeCompare(b.name));
      return copy;
    }
    if (sortMode === "NAT_THEN_POINTS"){
      copy.sort((a,b)=>{
        const an = (a.nationality||"").localeCompare(b.nationality||"");
        if (an !== 0) return an;
        return (b.totalPoints - a.totalPoints) || a.name.localeCompare(b.name);
      });
      return copy;
    }
    // default points desc
    copy.sort((a,b)=> (b.totalPoints - a.totalPoints) || a.name.localeCompare(b.name));
    return copy;
  }

  function renderTable(athletes){
    if (!els.rows) return;

    if (!athletes.length){
      els.rows.innerHTML = `
        <tr>
          <td colspan="6" class="muted">
            Aucun résultat à afficher pour ces filtres.
            <br>Il faut des <code>results[]</code> dans tes épreuves + une analyse GPX pour calculer la valeur.
          </td>
        </tr>
      `;
      return;
    }

    els.rows.innerHTML = athletes.map((r, idx) => `
      <tr>
        <td><strong>${idx+1}</strong></td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.team)}</td>
        <td>${escapeHtml(r.nationality)}</td>
        <td><strong>${r.totalPoints}</strong></td>
        <td>${r.usedCount} / ${r.racesCount}</td>
      </tr>
    `).join("");
  }

  function fillNationalityOptionsFromData(events){
    const set = new Set();
    for (const ev of events){
      const results = Array.isArray(ev?.results) ? ev.results : [];
      for (const r of results){
        const nat = String(r?.nationality || "").trim().toUpperCase();
        if (nat) set.add(nat);
      }
    }
    const list = Array.from(set).sort();
    const prev = els.nat?.value || "ALL";

    if (els.nat){
      els.nat.innerHTML = `<option value="ALL">Toutes</option>` + list.map(n => `<option value="${n}">${n}</option>`).join("");
      if (list.includes(prev)) els.nat.value = prev;
      else els.nat.value = "ALL";
    }
  }

  function updateLastUpdate(){
    const now = new Date();
    const dd = String(now.getDate()).padStart(2,"0");
    const mm = String(now.getMonth()+1).padStart(2,"0");
    const yy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2,"0");
    const mi = String(now.getMinutes()).padStart(2,"0");
    if (els.lastUpdate) els.lastUpdate.textContent = `Dernier calcul : ${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  // -------- Top grid helpers (24 months, ignore age) --------
  function topGridGroupConfig(){
    // VTT = toutes disciplines sauf Gravel ? → on prend "ALL" sauf "Gravel"
    // Mais tu as demandé “VTT” : on l'interprète comme XC/Enduro/DH/Marathon/Ultra (pas Gravel).
    return [
      { id:"top_vtt_m_mus", title:"VTT Hommes Musculaire", discMode:"VTT", sex:"M", ebike:false },
      { id:"top_vtt_m_ebike", title:"VTT Hommes E-bike", discMode:"VTT", sex:"M", ebike:true },
      { id:"top_vtt_f_mus", title:"VTT Femmes Musculaire", discMode:"VTT", sex:"F", ebike:false },
      { id:"top_vtt_f_ebike", title:"VTT Femmes E-bike", discMode:"VTT", sex:"F", ebike:true },
      { id:"top_gravel_m", title:"Gravel Hommes", discMode:"Gravel", sex:"M", ebike:false },
      { id:"top_gravel_f", title:"Gravel Femmes", discMode:"Gravel", sex:"F", ebike:false },
    ];
  }

  function discMatchesForTopGrid(evDisc, discMode){
    if (discMode === "Gravel") return String(evDisc||"") === "Gravel";
    if (discMode === "VTT") return String(evDisc||"") !== "Gravel"; // tout sauf gravel
    return true;
  }

  function computeTop5ForGroup(events, cfg, topN){
    // Filter: 24 months, ignore age
    const filter = {
      disc: "ALL",
      sex: cfg.sex,
      age: "ALL",
      ebike: cfg.ebike ? "1" : "0",
      period: "24M",
      year: "",
      nat: "ALL",
    };

    // collect raw eligible rows with disc override
    const raw = [];
    for (const ev of events){
      if (!discMatchesForTopGrid(ev?.disc, cfg.discMode)) continue;

      const results = Array.isArray(ev?.results) ? ev.results : [];
      if (!results.length) continue;

      for (const res of results){
        // match sex/ebike/period (ignore age)
        if (filter.sex !== "ALL" && String(res?.sex||"").toUpperCase() !== filter.sex) continue;

        const isEbike = (res?.ebike != null) ? !!res.ebike : !!ev?.ebike;
        if ((filter.ebike === "1") !== isEbike) continue;

        if (!withinPeriod(ev?.date, "24M", "")) continue;

        raw.push({
          ev,
          res,
          status: normalizeStatus(res),
          timeSec: getResultTimeSec(res),
          key: getAthleteKey(res)
        });
      }
    }

    // group by event + category (sex + ebike + disc) but age ignored:
    const byEventCat = new Map();
    for (const rr of raw){
      const disc = String(rr.ev?.disc || "");
      const sex = String(rr.res?.sex || "").toUpperCase() || "U";
      const eb = (rr.res?.ebike != null) ? (rr.res.ebike ? "E" : "M") : (rr.ev?.ebike ? "E" : "M");
      const catKey = `${rr.ev.id}__${disc}__${sex}__${eb}`; // age removed
      if (!byEventCat.has(catKey)) byEventCat.set(catKey, []);
      byEventCat.get(catKey).push(rr);
    }

    const scored = [];
    for (const [k, group] of byEventCat.entries()){
      const ev = group[0].ev;
      const withPts = computePointsForEventCategory(ev, group);
      for (const x of withPts) scored.push(x);
    }

    // aggregate per athlete
    const athletes = aggregateAthletes(scored, topN, "");
    const sorted = sortAthletes(athletes, "POINTS_DESC");

    return sorted.slice(0, 5);
  }

  function renderTopList(el, arr){
    if (!el) return;
    if (!arr.length){
      el.innerHTML = `<li class="muted">Aucun résultat</li>`;
      return;
    }
    el.innerHTML = arr.map(a => `
      <li>
        <strong>${escapeHtml(a.name)}</strong>
        <span class="muted">— ${escapeHtml(a.team)}</span>
        <span class="muted">• ${escapeHtml(a.nationality)}</span>
        <span style="float:right;font-weight:900;">${a.totalPoints} pts</span>
      </li>
    `).join("");
  }

  // -------- Main render --------
  function renderAll(){
    const events = loadEventsSafe();
    fillNationalityOptionsFromData(events);

    const filter = {
      disc: els.disc.value,
      sex: els.sex.value,
      age: els.age.value,
      ebike: els.ebike.value,
      period: els.period.value,
      year: els.year.value,
      nat: els.nat.value,
    };

    const { scored } = collectScoredRows({
      ...filter,
      q: "", // q applied later in aggregation
    });

    const topN = Number(els.topN.value);
    const q = String(els.q.value || "").trim();

    let athletes = aggregateAthletes(scored, topN, q);
    athletes = sortAthletes(athletes, els.sort.value);

    renderTable(athletes);
    updateLastUpdate();

    // Top grid (always 24 months, ignore age, use same topN selection as dropdown)
    const cfgs = topGridGroupConfig();
    for (const cfg of cfgs){
      const arr = computeTop5ForGroup(events, cfg, topN === 999 ? 5 : topN); // grid stays meaningful
      renderTopList($(cfg.id), arr);
    }
  }

  function bind(){
    const rerender = () => renderAll();

    ["change","input"].forEach(evt => {
      els.disc?.addEventListener(evt, rerender);
      els.sex?.addEventListener(evt, rerender);
      els.age?.addEventListener(evt, rerender);
      els.ebike?.addEventListener(evt, rerender);
      els.period?.addEventListener(evt, rerender);
      els.year?.addEventListener(evt, rerender);
      els.nat?.addEventListener(evt, rerender);
      els.sort?.addEventListener(evt, rerender);
      els.q?.addEventListener(evt, rerender);
      els.topN?.addEventListener(evt, rerender);
    });

    els.refreshBtn?.addEventListener("click", rerender);

    els.resetBtn?.addEventListener("click", () => {
      els.disc.value = "ALL";
      els.sex.value = "ALL";
      els.age.value = "ALL";
      els.ebike.value = "ALL";
      els.period.value = "24M";
      if (els.year){
        const y = new Date().getFullYear();
        els.year.value = String(y);
        els.year.disabled = true;
      }
      if (els.nat) els.nat.value = "ALL";
      if (els.sort) els.sort.value = "POINTS_DESC";
      if (els.q) els.q.value = "";
      if (els.topN) els.topN.value = "5";
      renderAll();
    });
  }

  bind();
  renderAll();
})();
