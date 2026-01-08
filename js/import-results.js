import { supabase } from "./supabaseClient.js";
import { ageOnYear, getAgeCategoryId } from "./utils/ageCategories.js";

const $ = (id) => document.getElementById(id);

function log(msg) {
  const el = $("log");
  el.textContent = (el.textContent ? el.textContent + "\n" : "") + msg;
}
function setStatus(msg, isError = false) {
  const el = $("statusLine");
  el.innerHTML = isError ? `<span class="err">${msg}</span>` : msg;
}

function normalizeKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function parseTimeToSeconds(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s)); // seconds
  const parts = s.split(":").map(p => p.trim());
  if (parts.length === 2) {
    const mm = Number(parts[0]), ss = Number(parts[1]);
    if (Number.isFinite(mm) && Number.isFinite(ss)) return mm * 60 + ss;
  }
  if (parts.length === 3) {
    const hh = Number(parts[0]), mm = Number(parts[1]), ss = Number(parts[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm) && Number.isFinite(ss)) return hh * 3600 + mm * 60 + ss;
  }
  return null;
}

function splitName(fullName) {
  const s = String(fullName ?? "").trim();
  if (!s) return { first_name: "", last_name: "" };

  // Heuristique simple:
  // - Si "NOM Prénom" (NOM en majuscules) => last = NOM, first = reste
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };

  const firstToken = parts[0];
  const isAllCaps = firstToken === firstToken.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(firstToken);
  if (isAllCaps) {
    return { last_name: firstToken, first_name: parts.slice(1).join(" ") };
  }

  // Sinon: last = dernier mot, first = le reste
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.slice(-1).join(" ") };
}

function guessDefaultMapping(headers) {
  const h = headers.map(x => ({ raw: x, k: normalizeKey(x) }));

  const find = (...candidates) => {
    for (const c of candidates) {
      const key = normalizeKey(c);
      const found = h.find(x => x.k === key) || h.find(x => x.k.includes(key));
      if (found) return found.raw;
    }
    return "";
  };

  return {
    rank: find("rank", "place", "position", "classement"),
    name: find("name", "nom_prenom", "prenom_nom", "rider", "coureur", "nom"),
    first_name: find("first_name", "prenom", "prénom", "firstname"),
    last_name: find("last_name", "nomdefamille", "nom_famille", "lastname", "surname"),
    sex: find("sex", "sexe", "gender"),
    birth_year: find("birth_year", "annee_naissance", "year_of_birth", "yob", "naissance"),
    time: find("time", "temps", "chrono", "duration"),
    status: find("status", "statut", "etat", "result"),
    club: find("club", "team", "equipe", "équipe"),
    nationality: find("nationality", "nation", "pays", "country")
  };
}

function fillSelect(selectEl, options, defaultValue = "") {
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "—";
  selectEl.appendChild(opt0);

  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    selectEl.appendChild(opt);
  }
  if (defaultValue && options.includes(defaultValue)) selectEl.value = defaultValue;
}

// -------- State
let races = [];
let currentRace = null;
let rows = [];
let headers = [];
let mappedPreview = [];

// -------- Load races (use your RLS)
async function loadRaces() {
  setStatus("Chargement des épreuves…");

  const url = new URL(window.location.href);
  const raceIdFromUrl = url.searchParams.get("raceId");

  // Important: on lit via races (RLS)
  const { data, error } = await supabase
    .from("races")
    .select("id,name,date,meeting_id,race_category_id")
    .order("date", { ascending: false })
    .limit(200);

  if (error) {
    setStatus("Erreur Supabase: impossible de charger les épreuves.", true);
    log(error.message);
    return;
  }

  races = data || [];
  const sel = $("raceSelect");
  sel.innerHTML = "";

  for (const r of races) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.name || "Épreuve"} — ${r.date ? new Date(r.date).toLocaleDateString("fr-FR") : "date ?"} (${r.meeting_id || "-"})`;
    sel.appendChild(opt);
  }

  if (raceIdFromUrl && races.some(r => r.id === raceIdFromUrl)) sel.value = raceIdFromUrl;

  await onRaceChange();
  setStatus("Sélectionne un fichier CSV/XLSX.");
}

async function onRaceChange() {
  const raceId = $("raceSelect").value;
  currentRace = races.find(r => r.id === raceId) || null;

  if (!currentRace) {
    $("raceMeta").textContent = "";
    return;
  }

  $("raceMeta").innerHTML = `
    <div class="muted">
      <b>Race ID:</b> <span class="mono">${currentRace.id}</span><br/>
      <b>Date:</b> ${currentRace.date ? new Date(currentRace.date).toLocaleDateString("fr-FR") : "?"}<br/>
      <b>Race category:</b> ${currentRace.race_category_id || "—"}
    </div>
  `;

  if (rows.length) buildPreview();
}

// -------- Parse CSV/XLSX (uses PapaParse / XLSX from HTML)
function parseFile(file) {
  log("");
  log(`Fichier: ${file.name}`);

  const ext = file.name.toLowerCase().split(".").pop();

  if (ext === "csv") {
    setStatus("Lecture CSV…");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        rows = res.data || [];
        headers = res.meta?.fields || Object.keys(rows[0] || {});
        onFileParsed();
      },
      error: (err) => {
        setStatus("Erreur lecture CSV.", true);
        log(String(err));
      }
    });
    return;
  }

  if (ext === "xlsx" || ext === "xls") {
    setStatus("Lecture XLSX…");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        rows = json;
        headers = Object.keys(json[0] || {});
        onFileParsed();
      } catch (err) {
        setStatus("Erreur lecture XLSX.", true);
        log(String(err));
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  setStatus("Format non supporté. Utilise CSV ou XLSX.", true);
}

function onFileParsed() {
  if (!headers.length) {
    setStatus("Aucune donnée trouvée dans le fichier.", true);
    return;
  }

  setStatus(`Fichier chargé: ${rows.length} lignes.`);
  log(`Colonnes détectées: ${headers.join(", ")}`);

  const guess = guessDefaultMapping(headers);

  // On réutilise tes selects existants + on “réaffecte”:
  // mapName = name ; mapSex ; mapBirthYear ; mapTime ; mapStatus ; mapRank
  fillSelect($("mapRank"), headers, guess.rank);
  fillSelect($("mapName"), headers, guess.name);
  fillSelect($("mapSex"), headers, guess.sex);
  fillSelect($("mapBirthYear"), headers, guess.birth_year);
  fillSelect($("mapTime"), headers, guess.time);
  fillSelect($("mapStatus"), headers, guess.status);

  // Bonus: si tu veux aussi mapper club/nationality plus tard, on peut ajouter des selects (optionnel)
  // Pour ne pas modifier ton HTML maintenant, on tente juste de lire ces colonnes si elles existent.
  $("mapName").dataset.guess_first = guess.first_name;
  $("mapName").dataset.guess_last = guess.last_name;
  $("mapName").dataset.guess_club = guess.club;
  $("mapName").dataset.guess_nat = guess.nationality;

  buildPreview();
}

function getMapping() {
  return {
    rank: $("mapRank").value,
    name: $("mapName").value,
    sex: $("mapSex").value,
    birth_year: $("mapBirthYear").value,
    time: $("mapTime").value,
    status: $("mapStatus").value,

    // “hidden” guesses (no UI)
    first_name: $("mapName").dataset.guess_first || "",
    last_name: $("mapName").dataset.guess_last || "",
    club: $("mapName").dataset.guess_club || "",
    nationality: $("mapName").dataset.guess_nat || ""
  };
}

function buildPreview() {
  if (!currentRace) return setStatus("Choisis d’abord une épreuve (race).", true);

  const m = getMapping();
  if (!m.name || !m.time) setStatus("Choisis au minimum les colonnes: Nom + Temps.", true);

  const eventDate = currentRace.date || new Date().toISOString();

  mappedPreview = rows
    .filter(r => r && Object.keys(r).length)
    .slice(0, 5000)
    .map((r) => {
      const rank = m.rank ? Number(r[m.rank]) : null;

      // name / first / last
      const fullName = m.name ? String(r[m.name] ?? "").trim() : "";
      let first_name = "";
      let last_name = "";

      if (m.first_name && r[m.first_name]) first_name = String(r[m.first_name]).trim();
      if (m.last_name && r[m.last_name]) last_name = String(r[m.last_name]).trim();

      if (!first_name || !last_name) {
        const s = splitName(fullName);
        first_name = first_name || s.first_name;
        last_name = last_name || s.last_name;
      }

      // sex
      const sexRaw = m.sex ? String(r[m.sex] ?? "").trim().toUpperCase() : "";
      const sexNorm = (sexRaw === "H" ? "M" : sexRaw);
      const sex = (sexNorm === "M" || sexNorm === "F") ? sexNorm : null;

      // birth year
      const by = m.birth_year ? Number(r[m.birth_year]) : null;

      // time
      const timeSec = m.time ? parseTimeToSeconds(r[m.time]) : null;

      // status
      const statusRaw = m.status ? String(r[m.status] ?? "").trim().toUpperCase() : "";
      const status = statusRaw || (timeSec != null ? "FINISH" : "DNF");

      // optional extra
      const club = m.club && r[m.club] ? String(r[m.club]).trim() : null;
      const nationality = m.nationality && r[m.nationality] ? String(r[m.nationality]).trim() : null;

      // preview calc (DB will compute again)
      const age = Number.isFinite(by) ? ageOnYear(by, eventDate) : null;
      const ageCatPreview = (age != null) ? getAgeCategoryId(age) : null;

      return {
        rank: Number.isFinite(rank) ? rank : null,
        first_name,
        last_name,
        club,
        nationality,
        sex,
        birth_year: Number.isFinite(by) ? by : null,
        time_seconds: timeSec,
        time_display: (m.time ? String(r[m.time] ?? "").trim() : null),
        status,
        age_on_year: age,
        age_category_preview: ageCatPreview
      };
    });

  const body = $("previewBody");
  body.innerHTML = "";
  mappedPreview.slice(0, 25).forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${(r.last_name || "") + " " + (r.first_name || "")}</td>
      <td>${r.sex || ""}</td>
      <td>${r.birth_year ?? ""}</td>
      <td>${r.time_seconds ?? ""}</td>
      <td>${r.age_on_year ?? ""}</td>
      <td>${r.age_category_preview ?? ""}</td>
    `;
    body.appendChild(tr);
  });

  setStatus(`Aperçu prêt. Lignes: ${mappedPreview.length}.`);
}

function validateRows(items) {
  const errors = [];
  items.forEach((r, idx) => {
    const n = idx + 1;
    if (!r.first_name) errors.push(`Ligne ${n}: first_name vide (impossible d’insérer)`);
    if (!r.last_name) errors.push(`Ligne ${n}: last_name vide (impossible d’insérer)`);
    if (r.status === "FINISH" && r.time_seconds == null) errors.push(`Ligne ${n}: temps invalide alors que FINISH`);
  });
  return errors;
}

async function doDryRun() {
  if (!currentRace) return setStatus("Choisis une épreuve.", true);
  if (!mappedPreview.length) return setStatus("Charge un fichier d’abord.", true);

  const errors = validateRows(mappedPreview);
  log("---- DRY RUN ----");
  if (!errors.length) {
    log("OK ✅ Aucun problème bloquant détecté.");
    setStatus("Dry-run OK ✅");
  } else {
    log("Problèmes détectés:");
    errors.slice(0, 40).forEach(e => log(" - " + e));
    if (errors.length > 40) log(`… +${errors.length - 40} autres`);
    setStatus("Dry-run: erreurs détectées (voir log).", true);
  }
}

async function doImport() {
  if (!currentRace) return setStatus("Choisis une épreuve.", true);
  if (!mappedPreview.length) return setStatus("Charge un fichier d’abord.", true);

  // Get current user (needed for organizer_id policy)
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    setStatus("Tu dois être connecté (organizer) pour importer.", true);
    log(authErr?.message || "Not authenticated");
    return;
  }
  const organizerId = authData.user.id;

  const errors = validateRows(mappedPreview);
  if (errors.length) {
    log("Import bloqué: corrige d’abord ces erreurs (extrait):");
    errors.slice(0, 40).forEach(e => log(" - " + e));
    setStatus("Import bloqué (voir log).", true);
    return;
  }

  // Build payload matching YOUR results schema
  // organizer_id MUST be set to auth.uid() because of RLS "with check"
  const payload = mappedPreview.map((r) => ({
    race_id: currentRace.id,
    organizer_id: organizerId,

    // rider_id optional (nullable)
    rider_id: null,

    last_name: r.last_name,
    first_name: r.first_name,
    club: r.club,
    nationality: r.nationality,

    sex: r.sex,
    birth_year: r.birth_year,

    // these can be null; trigger will compute if possible
    age_on_year: null,
    age_category_id: null,
    course_category_id: null,

    category: null,
    rank: r.rank,
    time_seconds: r.time_seconds,
    time_display: r.time_display,

    points: null,
    status: r.status
  }));

  setStatus("Import en cours…");
  log(`Insertion Supabase: ${payload.length} lignes…`);

  // Chunk insert
  const CHUNK = 200;
  let inserted = 0;

  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);

    const { error } = await supabase.from("results").insert(chunk);
    if (error) {
      setStatus("Erreur import Supabase (voir log).", true);
      log("Erreur Supabase: " + error.message);
      return;
    }
    inserted += chunk.length;
    setStatus(`Import… ${inserted}/${payload.length}`);
  }

  setStatus(`Import terminé ✅ (${inserted} lignes)`);
  log(`OK ✅ Import terminé: ${inserted} résultats insérés.`);
}

// -------- Wire UI
function wireEvents() {
  $("raceSelect").addEventListener("change", onRaceChange);

  $("fileInput").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
  });

  ["mapRank","mapName","mapSex","mapBirthYear","mapTime","mapStatus"].forEach(id => {
    $(id).addEventListener("change", () => {
      if (rows.length) buildPreview();
    });
  });

  $("btnClear").addEventListener("click", () => {
    rows = [];
    headers = [];
    mappedPreview = [];
    $("fileInput").value = "";
    $("previewBody").innerHTML = "";
    $("log").textContent = "";
    setStatus("Réinitialisé. Charge un fichier.");
  });

  $("btnDryRun").addEventListener("click", doDryRun);
  $("btnImport").addEventListener("click", doImport);
}

// Init
wireEvents();
loadRaces();
