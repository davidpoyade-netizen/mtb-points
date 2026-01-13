// js/event-detail.js
// Fiche épreuve — affiche détails + liens meeting + bouton "Créer une autre épreuve dans le même événement"

(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let _currentRace = null;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    // iso expected YYYY-MM-DD
    return iso;
  }

  function fmtNum(n) {
    const x = Number(n);
    return Number.isFinite(x) ? String(x) : "—";
  }

  function fmtKm(n) {
    const x = Number(n);
    return Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : "—";
  }

  function fmtM(n) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.round(x).toString() : "—";
  }

  function fmtTs(ts) {
    const x = Number(ts);
    if (!Number.isFinite(x)) return "—";
    try {
      return new Date(x).toLocaleString("fr-FR");
    } catch (_) {
      return "—";
    }
  }

  // ---- Storage adapters (use storage.js if present, else fallback localStorage)
  function listRacesSafe() {
    if (typeof window.listRaces === "function") return window.listRaces();
    if (typeof window.getRaces === "function") return window.getRaces();
    try {
      const raw = localStorage.getItem("mtb.races.v1");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function findRaceSafe(id) {
    if (!id) return null;
    if (typeof window.findRace === "function") return window.findRace(id);
    const all = listRacesSafe();
    return all.find((r) => r && r.id === id) || null;
  }

  function listMeetingsSafe() {
    if (typeof window.listMeetings === "function") return window.listMeetings();
    if (typeof window.getMeetings === "function") return window.getMeetings();
    try {
      const raw = localStorage.getItem("mtb.meetings.v1");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function findMeetingSafe(id) {
    if (!id) return null;
    if (typeof window.findMeeting === "function") return window.findMeeting(id);
    const all = listMeetingsSafe();
    return all.find((m) => m && m.id === id) || null;
  }

  function setAlert(html) {
    const box = $("alertBox");
    if (!box) return;
    box.style.display = html ? "block" : "none";
    box.innerHTML = html || "";
  }

  function setPillMeeting(text, kind) {
    const pill = $("pillMeeting");
    const pillTxt = $("pillMeetingTxt");
    if (pillTxt) pillTxt.textContent = text || "—";
    // dot color via classes ok/warn/err on dot
    if (pill) {
      const dot = pill.querySelector(".dot");
      if (dot) {
        dot.classList.remove("ok", "warn", "err");
        if (kind) dot.classList.add(kind);
      }
    }
  }

  function showMeetingActions(meetingId) {
    const a1 = $("btnOpenMeeting");
    const a2 = $("btnGoMeeting2");
    const b1 = $("btnCreateSibling");
    const b2 = $("btnCreateSibling2");

    if (!meetingId) {
      if (a1) a1.style.display = "none";
      if (a2) a2.style.display = "none";
      if (b1) b1.style.display = "none";
      if (b2) b2.style.display = "none";
      return;
    }

    const meetingUrl = `meeting.html?id=${encodeURIComponent(meetingId)}`;
    const createSiblingUrl = `course-create.html?meetingId=${encodeURIComponent(meetingId)}`;

    if (a1) { a1.href = meetingUrl; a1.style.display = "inline-flex"; }
    if (a2) { a2.href = meetingUrl; a2.style.display = "inline-flex"; }
    if (b1) { b1.href = createSiblingUrl; b1.style.display = "inline-flex"; }
    if (b2) { b2.href = createSiblingUrl; b2.style.display = "inline-flex"; }
  }

  function render() {
    const id = params.get("id");
    if (!id) {
      setAlert(`❌ ID d’épreuve manquant. Retourne à la liste des épreuves.`);
      return;
    }

    const race = findRaceSafe(id);
    _currentRace = race;
    if (!race) {
      setAlert(`❌ Épreuve introuvable. (id: <code>${esc(id)}</code>)`);
      setPillMeeting("Introuvable", "err");
      return;
    }

    // Back button: if meeting exists -> return to meeting, else events list
    const btnBack = $("btnBack");
    if (btnBack) {
      btnBack.href = race.meetingId
        ? `meeting.html?id=${encodeURIComponent(race.meetingId)}`
        : "events.html";
    }

    // Header / hero
    $("raceName").textContent = race.name || "Épreuve";
    const metaBits = [];
    metaBits.push(`📅 ${fmtDate(race.date)}`);
    if (race.time) metaBits.push(`🕒 ${esc(race.time)}`);
    if (race.location) metaBits.push(`📍 ${esc(race.location)}`);
    if (race.meetingName) metaBits.push(`🏁 ${esc(race.meetingName)}`);
    $("raceMeta").textContent = metaBits.join(" • ") || "—";

    if (race.comment) {
      const c = $("raceComment");
      if (c) {
        c.style.display = "block";
        c.textContent = race.comment;
      }
    }

    // Meeting
    const meetingId = race.meetingId || race.eventGroupId || null;
    const meeting = meetingId ? findMeetingSafe(meetingId) : null;

    if (!meetingId) {
      setAlert(
        `⚠️ Cette épreuve n’est rattachée à <b>aucun événement</b> (données anciennes).<br/>
         Crée les nouvelles épreuves depuis un événement : <a href="meetings.html">voir les événements</a>.`
      );
      setPillMeeting("Aucun événement", "warn");
      showMeetingActions(null);
    } else {
      const label = meeting ? meeting.name : "Événement";
      setPillMeeting(label, "ok");
      showMeetingActions(meetingId);
    }

    // KPIs — distance / D+
    $("kpiDistance").textContent = fmtKm(race.distanceKm);
    $("kpiDplus").textContent = `D+ : ${fmtM(race.dplusM)} m`;

    // KPIs — scores
    const phys = (race.physScore != null) ? Number(race.physScore) : null;
    const tech = (race.techV2 && typeof race.techV2.techScoreV2 === "number")
      ? Number(race.techV2.techScoreV2)
      : (race.techScore != null ? Number(race.techScore) : null);

    const glob = (race.globalScore != null) ? Number(race.globalScore) : (race.mrs != null ? Number(race.mrs) : null);

    $("kpiPhys").textContent = Number.isFinite(phys) ? String(Math.round(phys)) : "—";
    $("kpiPhysSub").textContent = Number.isFinite(phys) ? "Calculé (GPX / effort)" : "—";

    $("kpiTech").textContent = Number.isFinite(tech) ? String(Math.round(tech)) : "—";
    $("kpiTechSub").textContent = Number.isFinite(tech)
      ? "TechScore disponible"
      : "TechScore indisponible (serveur requis)";

    $("kpiGlobal").textContent = Number.isFinite(glob) ? String(Math.round(glob)) : "—";
    $("kpiGlobalSub").textContent = Number.isFinite(glob)
      ? "Synthèse Phys/Tech"
      : "Calculé si Tech disponible";

    // Discipline / ebike
    $("kpiDisc").textContent = race.disc ? String(race.disc) : "—";
    const eb = (race.ebike === true) ? "E-bike" : "Musculaire";
    $("kpiEbike").textContent = `Vélo : ${eb}`;

    // participants
    $("kpiParticipants").textContent = (race.participants != null && Number.isFinite(Number(race.participants)))
      ? String(Math.round(Number(race.participants)))
      : "—";

    $("kpiCreated").textContent = `Créé : ${fmtTs(race.createdAt)}`;

    // Edit link (optional)
    const edit = $("btnEdit");
    if (edit) {
      // si tu n’as pas encore de page d’édition, laisse vers course-create.html pré-rempli
      // (simple: recréer une épreuve dans le meeting)
      edit.href = meetingId
        ? `course-create.html?meetingId=${encodeURIComponent(meetingId)}`
        : "meetings.html";
    }
  }

render();
  // ---- PDF (print to PDF)
function buildPdfTitle(race) {
  const safe = (s) => String(s || "").trim().replace(/[\\/:*?"<>|]+/g, "-");
  const name = safe(race?.name || "epreuve");
  const date = safe(race?.date || "");
  return `MTB-Points_Fiche-epreuve_${name}${date ? "_" + date : ""}`;
}

function setupPdfButtons(getRaceFn) {
  const btnTop = document.getElementById("btnPdfTop");
  const btnBottom = document.getElementById("btnPdfBottom");

  const handler = () => {
    const race = typeof getRaceFn === "function" ? getRaceFn() : null;

    // Nom du document imprimé (certains navigateurs l’utilisent)
    const title = buildPdfTitle(race);
    const prevTitle = document.title;
    document.title = title;

    // Petit délai : laisse Leaflet/canvas finir de peindre
    setTimeout(() => {
      window.print();
      // restore
      setTimeout(() => { document.title = prevTitle; }, 250);
    }, 250);
  };

  if (btnTop) btnTop.addEventListener("click", handler);
  if (btnBottom) btnBottom.addEventListener("click", handler);
}


  // ---- PDF (print to PDF)
  function buildPdfTitle(race) {
    const safe = (s) => String(s || "").trim().replace(/[\\/:*?"<>|]+/g, "-");
    const name = safe(race?.name || "epreuve");
    const date = safe(race?.date || "");
    return `MTB-Points_Fiche-epreuve_${name}${date ? "_" + date : ""}`;
  }

  function setupPdfButtons(getRaceFn) {
    const btnTop = document.getElementById("btnPdfTop");
    const btnBottom = document.getElementById("btnPdfBottom");

    const handler = () => {
      const race = typeof getRaceFn === "function" ? getRaceFn() : null;

      const title = buildPdfTitle(race);
      const prevTitle = document.title;
      document.title = title;

      // Petit délai : laisse Leaflet/canvas finir de peindre
      setTimeout(() => {
        window.print();
        setTimeout(() => { document.title = prevTitle; }, 250);
      }, 250);
    };

    if (btnTop) btnTop.addEventListener("click", handler);
    if (btnBottom) btnBottom.addEventListener("click", handler);
  }

  // wire PDF buttons once; race will be filled by render()
  setupPdfButtons(() => _currentRace);

  render();
})();
