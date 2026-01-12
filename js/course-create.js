// js/course-create.js
// MTB Points — Création d'épreuve (organizer)
// - GPX obligatoire + altitude obligatoire + distance >= 3 km
// - utilise window.analyzeGPX() (js/gpx.js)

(function () {
  const $ = (id) => document.getElementById(id);

  const elMeetingId = $("meetingId");
  const elDate = $("date");
  const elTime = $("time");
  const elName = $("name");
  const elDisc = $("disc");

  const inpGpx = $("gpxFile");
  const btnPickAnalyze = $("btnPickAnalyze");
  const btnClear = $("btnClearGPX");
  const btnSave = $("btnSave");
  const btnReset = $("btnReset");
  const btnViewRace = $("btnViewRace");

  const meetingHint = $("meetingHint");
  const pickedFileName = $("pickedFileName");

  const msg = $("msg");

  const kpiPhys = $("kpiPhys");
  const kpiPhysSub = $("kpiPhysSub");
  const kpiTech = $("kpiTech");
  const kpiTechSub = $("kpiTechSub");
  const kpiGlobal = $("kpiGlobal");
  const kpiGlobalSub = $("kpiGlobalSub");

  const statusBox = $("statusBox");
  const statusPhase = $("statusPhase");
  const statusMsg = $("statusMsg");
  const statusBarWrap = $("statusBarWrap");
  const statusBar = $("statusBar");
  const statusSub = $("statusSub");

  let ANALYSIS = null;
  let BUSY = false;

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  function showMsg(html, ok = true) {
    if (!msg) return;
    msg.style.display = html ? "block" : "none";
    msg.innerHTML = html ? (ok ? `✅ ${html}` : `❌ ${html}`) : "";
    msg.style.borderColor = ok ? "#cfe9d6" : "#fee2e2";
  }

  function setBusy(on){
    BUSY = !!on;
    if (btnPickAnalyze) btnPickAnalyze.disabled = BUSY;
    if (btnSave) btnSave.disabled = BUSY;
  }

  function setStatusUI(phase, message, progress) {
    if (!statusBox) return;
    statusBox.style.display = "block";

    if (statusPhase) statusPhase.innerHTML = `<span class="dot"></span> ${esc(phase || "—")}`;
    if (statusMsg) statusMsg.textContent = message || "—";

    if (typeof progress === "number" && isFinite(progress)) {
      if (statusBarWrap) statusBarWrap.style.display = "block";
      if (statusBar) statusBar.style.width = `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;
    } else {
      if (statusBarWrap) statusBarWrap.style.display = "none";
      if (statusBar) statusBar.style.width = "0%";
    }
  }

  window.addEventListener("mtb:status", (e) => {
    const d = e?.detail || {};
    setStatusUI(d.phase, d.message, d.progress);
    if (statusSub) statusSub.textContent = "";
  });

  // ---- storage helpers (fallback si storage.js absent)
  function lsLoad(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (_) { return fallback; }
  }
  function lsSave(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function listMeetingsSafe(){
    if (typeof window.listMeetings === "function") return window.listMeetings();
    return lsLoad("mtb.meetings.v1", []);
  }
  function findMeetingSafe(id){
    if (!id) return null;
    if (typeof window.findMeeting === "function") return window.findMeeting(id);
    return listMeetingsSafe().find(m => m && m.id === id) || null;
  }

  function upsertRaceSafe(r){
    if (typeof window.upsertRace === "function") return window.upsertRace(r);
    const KEY = "mtb.races.v1";
    const arr = lsLoad(KEY, []);
    const i = arr.findIndex(x => x && x.id === r.id);
    if (i >= 0) arr[i] = r; else arr.unshift(r);
    lsSave(KEY, arr);
  }

  function upsertMeetingSafe(m){
    if (typeof window.upsertMeeting === "function") return window.upsertMeeting(m);
    const KEY = "mtb.meetings.v1";
    const arr = lsLoad(KEY, []);
    const i = arr.findIndex(x => x && x.id === m.id);
    if (i >= 0) arr[i] = m; else arr.unshift(m);
    lsSave(KEY, arr);
  }

  function attachRaceToMeeting(meetingId, raceId){
    const m = findMeetingSafe(meetingId);
    if (!m) return;
    m.raceIds = Array.isArray(m.raceIds) ? m.raceIds : [];
    if (!m.raceIds.includes(raceId)) m.raceIds.push(raceId);
    upsertMeetingSafe(m);
  }

  function makeIdFromName(name){
    const base = String(name || "").trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") || "race";
    return `${base}-${Date.now()}`;
  }

  // ---- UI init meeting
  function applyMeetingDefaults(meetingId){
    const m = findMeetingSafe(meetingId);
    if (!m){
      if (meetingHint) meetingHint.textContent = "⚠️ Sélectionne un événement.";
      return;
    }
    const start = m.date || "";
    const end = m.endDate || "";
    if (meetingHint){
      meetingHint.textContent = end ? `📅 Plage : ${start || "—"} → ${end}` : `📅 Date : ${start || "—"}`;
    }
    if (elDate){
      elDate.min = start || "";
      elDate.max = end || start || "";
      if (!elDate.value && start) elDate.value = start;
      if (start && elDate.value && elDate.value < start) elDate.value = start;
      if (end && elDate.value && elDate.value > end) elDate.value = start || end;
    }
    const back = $("btnBack");
    if (back) back.href = `meeting.html?id=${encodeURIComponent(m.id)}`;
  }

  function initMeetingSelect(){
    if (!elMeetingId) return;
    const meetings = listMeetingsSafe().slice().sort((a,b)=> String(b?.date||"").localeCompare(String(a?.date||"")));
    elMeetingId.innerHTML =
      `<option value="">— Choisir —</option>` +
      meetings.map(m => `<option value="${esc(m.id)}">${esc(m.name || "Événement")}${m.date ? " • " + esc(m.date) : ""}</option>`).join("");

    const params = new URLSearchParams(location.search);
    const mid = params.get("meetingId");
    if (mid) elMeetingId.value = mid;

    applyMeetingDefaults(elMeetingId.value);
    elMeetingId.addEventListener("change", () => applyMeetingDefaults(elMeetingId.value));
  }

  // ---- KPIs
  function setKpi(el, val){ if (el) el.textContent = (val == null ? "—" : String(val)); }

  function updateKpis(a){
    if (!a){
      setKpi(kpiPhys, "—"); if (kpiPhysSub) kpiPhysSub.textContent = "—";
      setKpi(kpiTech, "—"); if (kpiTechSub) kpiTechSub.textContent = "—";
      setKpi(kpiGlobal, "—"); if (kpiGlobalSub) kpiGlobalSub.textContent = "—";
      return;
    }

    const phys = a?.phys?.score ?? null;
    const tech = a?.techV2?.techScoreV2 ?? null;
    const mrs  = a?.mrs ?? null;

    setKpi(kpiPhys, Number.isFinite(phys) ? phys : "—");
    if (kpiPhysSub) kpiPhysSub.textContent = a?.phys ? `Effort: ${a.phys.effort ?? "—"} • IPB: ${a.phys.ipbOverall ?? "—"}` : "—";

    setKpi(kpiTech, Number.isFinite(tech) ? tech : "—");
    if (kpiTechSub) {
      kpiTechSub.textContent = Number.isFinite(tech)
        ? "TechScoreV2 (OSM Hybrid) ✅"
        : (a?.techV2?.details?.error ? `OSM: ${a.techV2.details.error}` : "TechScore indisponible");
    }

    setKpi(kpiGlobal, Number.isFinite(mrs) ? mrs : "—");
    if (kpiGlobalSub) kpiGlobalSub.textContent = Number.isFinite(mrs) ? "Global = 0.55 Phys + 0.45 Tech" : "Global si Tech dispo";
  }

  // ---- GPX
  function clearGpx(){
    ANALYSIS = null;
    if (inpGpx) inpGpx.value = "";
    if (pickedFileName) pickedFileName.textContent = "";
    updateKpis(null);
    if (btnViewRace){
      btnViewRace.style.display = "none";
      btnViewRace.href = "#";
    }
    showMsg("");
  }

  async function analyzeSelectedGpx(){
    const file = inpGpx?.files?.[0];
    if (!file){
      showMsg("GPX obligatoire : sélectionne un fichier.", false);
      return;
    }
    if (typeof window.analyzeGPX !== "function"){
      showMsg("Erreur: analyzeGPX() introuvable. Vérifie js/gpx.js.", false);
      return;
    }

    try{
      setBusy(true);
      showMsg("");
      const a = await window.analyzeGPX(file, { keepPoints: true, timeoutMs: 60000 });
      ANALYSIS = a;
      window.GPX_CACHE = a; // compat si d'autres scripts l'utilisent

      // auto discipline hint
      if (elDisc && !elDisc.value && a?.discipline?.hint){
        // ton server renvoie parfois "XCO / XCM court" etc
        // on ne force pas si ça ne matche pas exactement tes options
      }

      updateKpis(a);

      showMsg(`GPX OK : <b>${esc(a.distanceKm)}</b> km • D+ <b>${esc(a.dplusM)}</b> m • Altitude ✅`, true);
    } catch (e){
      ANALYSIS = null;
      window.GPX_CACHE = null;
      updateKpis(null);
      showMsg(esc(e?.message || "Erreur analyse GPX"), false);
    } finally {
      setBusy(false);
    }
  }

  function validate(){
    if (BUSY) return "Analyse en cours : attends la fin.";
    if (!elMeetingId?.value) return "Événement obligatoire.";
    if (!elDate?.value) return "Date obligatoire.";
    if (!elName?.value?.trim()) return "Nom d’épreuve obligatoire.";
    if (!inpGpx?.files?.[0]) return "GPX obligatoire : sélectionne un fichier.";
    if (!ANALYSIS) return "Analyse obligatoire : choisis un GPX et attends la fin.";
    if (!ANALYSIS.hasElevation) return "Altitude obligatoire : exporte un GPX avec élévation.";
    if (!(Number(ANALYSIS.distanceKm) >= 3)) return "Distance minimale : GPX < 3 km.";
    return null;
  }

  function buildRace(){
    const id = makeIdFromName(elName.value.trim());
    return {
      id,
      meetingId: elMeetingId.value,
      date: elDate.value,
      time: elTime?.value || null,
      name: elName.value.trim(),
      disc: elDisc?.value || null,

      // analyse
      distanceKm: ANALYSIS.distanceKm,
      dplusM: ANALYSIS.dplusM,
      physScore: ANALYSIS?.phys?.score ?? null,
      techScore: ANALYSIS?.techV2?.techScoreV2 ?? null,
      globalScore: ANALYSIS?.mrs ?? null,

      gpx: {
        fileName: ANALYSIS.fileName,
        hasElevation: ANALYSIS.hasElevation
      },

      analysis: ANALYSIS, // utile pour debug (tu peux l'enlever si tu veux)
      createdAt: Date.now(),
      isPublished: false
    };
  }

  function doSave(){
    const err = validate();
    if (err) { showMsg(esc(err), false); return; }

    const race = buildRace();
    upsertRaceSafe(race);
    attachRaceToMeeting(race.meetingId, race.id);

    showMsg(`Épreuve créée : <b>${esc(race.name)}</b>`, true);

    if (btnViewRace){
      btnViewRace.href = `race.html?id=${encodeURIComponent(race.id)}`;
      btnViewRace.style.display = "inline-flex";
    }
  }

  function resetForm(){
    clearGpx();
    if (elName) elName.value = "";
    if (elTime) elTime.value = "";
    if (elDisc) elDisc.value = "";
    showMsg("");
  }

  // ---- wire
  initMeetingSelect();

  if (btnPickAnalyze && inpGpx){
    btnPickAnalyze.addEventListener("click", () => {
      showMsg("");
      inpGpx.value = ""; // force change
      inpGpx.click();
    });
  }

  if (inpGpx){
    inpGpx.addEventListener("change", async () => {
      const f = inpGpx.files?.[0];
      if (pickedFileName) pickedFileName.textContent = f ? `Fichier : ${f.name}` : "";
      if (f) await analyzeSelectedGpx();
    });
  }

  if (btnClear) btnClear.addEventListener("click", clearGpx);
  if (btnSave) btnSave.addEventListener("click", doSave);
  if (btnReset) btnReset.addEventListener("click", resetForm);
})();
