// js/course-create.js (MODULE)
// MTB Points — course-create (organizer)
// - Analyse GPX via window.analyzeGPX (gpx.js)
// - Enregistre dans Supabase: table public.races
// - Fallback localStorage si pas connecté / erreur Supabase

import { supabase } from "./supabaseClient.js";

(function () {
  const $ = (id) => document.getElementById(id);

  // --- Elements (doivent exister dans course-create.html)
  const selMeeting = $("eventGroupId");
  const inpName = $("courseName");
  const inpDate = $("courseDate");
  const inpStartTime = $("startTime");
  const selDisc = $("disc");
  const selEbike = $("ebike");
  const selLevel = $("level");
  const inpDistance = $("distanceKm");
  const inpDplus = $("dplusM");
  const inpParticipants = $("participantsCount");
  const inpComment = $("comment");

  const inpGpx = $("courseGpxFile");
  const btnClearGPX = $("btnClearGPX");
  const btnSave = $("saveCourseBtn");

  const kpiPhys = $("kpiPhys");
  const kpiPhysSub = $("kpiPhysSub");
  const kpiTech = $("kpiTech");
  const kpiTechSub = $("kpiTechSub");
  const kpiGlobal = $("kpiGlobal");
  const kpiGlobalSub = $("kpiGlobalSub");

  // (optionnel) box status
  const statusBox = $("statusBox");
  const statusPhase = $("statusPhase");
  const statusMsg = $("statusMsg");
  const statusBarWrap = $("statusBarWrap");
  const statusBar = $("statusBar");
  const statusSub = $("statusSub");

  // --- Helpers
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function showMsg(text, ok = true) {
    const el = $("msg");
    if (!el) return;
    el.style.display = text ? "block" : "none";
    el.innerHTML = text ? (ok ? `✅ ${esc(text)}` : `❌ ${esc(text)}`) : "";
  }

  function toNumberOrNull(v) {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function makeIdFromName(name) {
    const slug = String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "race";
    return `${slug}-${Date.now()}`;
  }

  function safeISODate(s) {
    const v = String(s || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }

  function setDisabled(on) {
    if (btnSave) btnSave.disabled = !!on;
    if (inpGpx) inpGpx.disabled = !!on;
  }

  // --- STATUS UI (écoute mtb:status émis par gpx.js)
  function setStatusUI(d) {
    if (!statusBox) return;

    statusBox.style.display = "block";
    const phase = d?.phase || "—";
    const message = d?.message || "—";
    const progress = (typeof d?.progress === "number") ? d.progress : null;
    const spinning = d?.spinning !== false;

    const dotClass = phase === "error" ? "err" : (phase === "done" ? "ok" : (phase === "osm" ? "warn" : ""));
    if (statusPhase) statusPhase.innerHTML = `<span class="dot ${dotClass}"></span> ${esc(phase)}`;
    if (statusMsg) statusMsg.textContent = message;

    const hasProgress = typeof progress === "number" && progress >= 0 && progress <= 1;
    if (statusBarWrap) statusBarWrap.style.display = hasProgress ? "block" : "none";
    if (statusBar && hasProgress) statusBar.style.width = Math.round(progress * 100) + "%";

    if (statusSub) {
      const sub =
        phase === "gpx" ? "Analyse pente • effort • stats…" :
        phase === "osm" ? "Analyse terrain OSM • technicité…" :
        phase === "done" ? "Terminé" :
        phase === "error" ? "Erreur" : "—";
      statusSub.textContent = spinning ? sub : "";
    }
  }
  window.addEventListener("mtb:status", (e) => setStatusUI(e.detail || {}));

  // --- Meetings select (Supabase si connecté, sinon localStorage)
  function loadMeetingsLocal() {
    try {
      const raw = localStorage.getItem("mtb.meetings.v1");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  async function loadMeetingsSupabaseIfAuthed() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) return null; // pas connecté

      // On charge les meetings visibles de l'organizer (selon ton RLS)
      // Si tu as une policy plus ouverte, ça marchera aussi.
      const { data, error } = await supabase
        .from("meetings")
        .select("id,name,date,race_ids")
        .order("date", { ascending: false })
        .limit(2000);

      if (error) {
        console.warn("[course-create] meetings supabase error:", error);
        return null;
      }

      // Normalisation -> format front
      return (data || []).map(m => ({
        id: m.id,
        name: m.name,
        date: m.date,
        raceIds: Array.isArray(m.race_ids) ? m.race_ids : []
      }));
    } catch (e) {
      console.warn("[course-create] meetings supabase exception:", e);
      return null;
    }
  }

  async function initMeetingSelect() {
    if (!selMeeting) return;

    const supaMeetings = await loadMeetingsSupabaseIfAuthed();
    const meetings = (Array.isArray(supaMeetings) && supaMeetings.length) ? supaMeetings : loadMeetingsLocal();

    selMeeting.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = meetings.length ? "— Sélectionner un événement —" : "⚠️ Aucun événement (crée-en un d’abord)";
    selMeeting.appendChild(opt0);

    meetings.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.date || "—"})`;
      selMeeting.appendChild(opt);
    });

    // préselection via URL ?meetingId=
    const params = new URLSearchParams(location.search);
    const mid = params.get("meetingId");
    if (mid) selMeeting.value = mid;
  }

  // --- GPX analysis
  async function runAnalysisFromFile(file) {
    showMsg("", true);
    window.GPX_CACHE = null;

    if (!file) return;
    if (typeof window.analyzeGPX !== "function") {
      showMsg("analyzeGPX introuvable : vérifie que js/gpx.js est bien chargé.", false);
      return;
    }

    try {
      setDisabled(true);

      // On garde l'analyse complète (utile à stocker)
      const a = await window.analyzeGPX(file, { keepPoints: true, timeoutMs: 60000 });

      window.GPX_CACHE = a;

      // Autofill distance / d+
      if (inpDistance) inpDistance.value = String(a.distanceKm ?? "");
      if (inpDplus) inpDplus.value = String(a.dplusM ?? "");

      // KPIs
      if (kpiPhys) kpiPhys.textContent = (a?.phys?.score ?? "—");
      if (kpiPhysSub) kpiPhysSub.textContent = a?.phys ? `Effort: ${a.phys.effort ?? "—"} • IPB: ${a.phys.ipbOverall ?? "—"}` : "—";

      const techScore = (a?.techV2 && typeof a.techV2.techScoreV2 === "number") ? a.techV2.techScoreV2 : null;
      if (kpiTech) kpiTech.textContent = techScore ?? "—";
      if (kpiTechSub) kpiTechSub.textContent = techScore != null ? "TechScoreV2 officiel (OSM + bonus GPX capé)" : "ScoreTech indisponible (OSM/Overpass)";

      if (kpiGlobal) kpiGlobal.textContent = (typeof a?.mrs === "number") ? a.mrs : "—";
      if (kpiGlobalSub) kpiGlobalSub.textContent = (typeof a?.mrs === "number") ? "0.55 Phys + 0.45 Tech" : "Score global si Tech disponible";

      showMsg("Analyse GPX terminée : distance/D+ renseignés ✅", true);
    } catch (e) {
      window.GPX_CACHE = null;
      showMsg(e?.message || "Erreur analyse GPX/OSM.", false);
    } finally {
      setDisabled(false);
    }
  }

  function clearGPX() {
    window.GPX_CACHE = null;
    if (inpGpx) inpGpx.value = "";
    if (inpDistance) inpDistance.value = "";
    if (inpDplus) inpDplus.value = "";

    if (kpiPhys) kpiPhys.textContent = "—";
    if (kpiPhysSub) kpiPhysSub.textContent = "—";
    if (kpiTech) kpiTech.textContent = "—";
    if (kpiTechSub) kpiTechSub.textContent = "—";
    if (kpiGlobal) kpiGlobal.textContent = "—";
    if (kpiGlobalSub) kpiGlobalSub.textContent = "—";

    if (statusBox) statusBox.style.display = "none";
    showMsg("GPX effacé.", true);
  }

  // --- Validation
  function requireFields() {
    const meetingId = selMeeting?.value || "";
    const name = inpName?.value?.trim() || "";
    const date = inpDate?.value || "";
    const disc = selDisc?.value || "";

    if (!meetingId) return "Événement obligatoire.";
    if (!name) return "Nom d’épreuve obligatoire.";
    if (!safeISODate(date)) return "Date d’épreuve obligatoire (format YYYY-MM-DD).";
    if (!disc) return "Discipline obligatoire.";
    if (!window.GPX_CACHE) return "Importe un GPX : l’analyse est obligatoire.";
    if (!window.GPX_CACHE.hasElevation) return "GPX refusé : altitude obligatoire.";
    if (!(Number(window.GPX_CACHE.distanceKm) >= 3)) return "GPX refusé : distance minimale 3 km.";

    return null;
  }

  // --- Supabase insert
  async function insertRaceSupabase(payload) {
    // Vérifie session (organizer connecté)
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;
    if (!sess?.session) throw new Error("Non connecté : connecte-toi en organisateur pour enregistrer sur Supabase.");

    const { error } = await supabase.from("races").insert(payload);
    if (error) throw error;
  }

  async function attachRaceToMeetingSupabase(meetingId, raceId) {
    // optionnel: met à jour meetings.race_ids (si tu as bien cette colonne)
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select("race_ids")
        .eq("id", meetingId)
        .maybeSingle();

      if (error) throw error;

      const ids = Array.isArray(data?.race_ids) ? data.race_ids.slice() : [];
      if (!ids.includes(raceId)) ids.push(raceId);

      const { error: upErr } = await supabase
        .from("meetings")
        .update({ race_ids: ids })
        .eq("id", meetingId);

      if (upErr) throw upErr;
    } catch (e) {
      // on ne bloque pas la création si la colonne n’existe pas encore
      console.warn("[course-create] attachRaceToMeetingSupabase skipped:", e);
    }
  }

  // --- Save
  async function saveCourse() {
    const err = requireFields();
    if (err) {
      alert("⚠️ " + err);
      return;
    }

    setDisabled(true);
    showMsg("Enregistrement…", true);

    const id = makeIdFromName(inpName.value);

    // construit le payload DB (table public.races que tu viens de créer)
    const payload = {
      id,
      meeting_id: selMeeting.value,

      name: inpName.value.trim(),
      date: safeISODate(inpDate.value),

      discipline: selDisc.value,
      level: selLevel?.value || null,
      ebike: (selEbike?.value === "1"),

      distance_km: toNumberOrNull(inpDistance?.value) ?? Number(window.GPX_CACHE.distanceKm),
      dplus_m: toNumberOrNull(inpDplus?.value) ?? Number(window.GPX_CACHE.dplusM),

      score_phys: window.GPX_CACHE?.phys?.score ?? null,
      score_tech: (typeof window.GPX_CACHE?.techV2?.techScoreV2 === "number") ? window.GPX_CACHE.techV2.techScoreV2 : null,
      score_global: (typeof window.GPX_CACHE?.mrs === "number") ? window.GPX_CACHE.mrs : null,

      // on stocke l'analyse brute (très utile pour race.html)
      analysis_json: window.GPX_CACHE,

      // par défaut: non publié
      is_published: false
    };

    try {
      await insertRaceSupabase(payload);
      await attachRaceToMeetingSupabase(payload.meeting_id, payload.id);

      showMsg("Épreuve enregistrée sur Supabase ✅", true);

      // redirige vers la fiche publique
      location.href = `race.html?id=${encodeURIComponent(payload.id)}`;
    } catch (e) {
      console.error("[course-create] supabase insert failed:", e);

      // fallback localStorage pour ne pas perdre le travail
      try {
        const ev = {
          id: payload.id,
          name: payload.name,
          date: payload.date,
          disc: payload.discipline,
          level: payload.level,
          ebike: payload.ebike,
          distanceKm: payload.distance_km,
          dplusM: payload.dplus_m,
          physScore: payload.score_phys,
          techScore: payload.score_tech,
          globalScore: payload.score_global,
          eventGroupId: payload.meeting_id,
          comment: (inpComment?.value || "").trim() || null,
          participantsCount: toNumberOrNull(inpParticipants?.value),
          analysis: window.GPX_CACHE,
          createdAt: Date.now()
        };

        const key = "mtb.races.v1";
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(key) || "[]"); } catch { arr = []; }
        if (!Array.isArray(arr)) arr = [];
        arr.unshift(ev);
        localStorage.setItem(key, JSON.stringify(arr));

        showMsg("Supabase a refusé l’écriture → sauvegardé en localStorage (fallback).", false);
        alert("⚠️ Supabase a refusé l’écriture.\nSauvegarde locale faite.\nDétail: " + (e?.message || e));
      } catch (_) {
        alert("❌ Erreur Supabase et fallback local impossible: " + (e?.message || e));
      } finally {
        setDisabled(false);
      }
      return;
    } finally {
      setDisabled(false);
    }
  }

  // --- Wire
  initMeetingSelect();

  if (inpGpx) {
    inpGpx.addEventListener("change", () => {
      const file = inpGpx.files?.[0] || null;
      runAnalysisFromFile(file);
    });
  }

  if (btnClearGPX) btnClearGPX.addEventListener("click", clearGPX);
  if (btnSave) btnSave.addEventListener("click", saveCourse);
})();
