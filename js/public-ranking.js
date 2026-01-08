// js/public-ranking.js
// MTB Points — Classement public (Supabase -> fallback demo)
// - Catégories UCI en "code court" : U7 U9 U11 U13 U15 U17 U23 SEN M1..M9
// - Filtre: affiche "U7 — Poussin", etc.
// - Tableau: affiche uniquement le code (U15 / M3 / ...)

import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

const tbody = $("tbody");
const search = $("search");
const sexSel = $("sex");
const ageSel = $("agecat");
const countLine = $("countLine");
const whoami = $("whoami");
const warning = $("supabaseWarning");
const refreshBtn = $("refreshBtn");

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function sexLabel(sex) {
  if (sex === "M") return "H";
  if (sex === "F") return "F";
  return "—";
}

// ---------- UCI age categories (codes + labels) ----------
const UCI = [
  { code: "U7",  label: "Poussin", ageMin: 7,  ageMax: 8 },
  { code: "U9",  label: "Pupille", ageMin: 9,  ageMax: 10 },
  { code: "U11", label: "Benjamin", ageMin: 11, ageMax: 12 },
  { code: "U13", label: "Minime", ageMin: 13, ageMax: 14 },
  { code: "U15", label: "Cadet", ageMin: 15, ageMax: 16 },
  { code: "U17", label: "Junior", ageMin: 17, ageMax: 18 },

  // overlap: U23 prioritaire sur SEN
  { code: "U23", label: "Espoir", ageMin: 19, ageMax: 22 },
  { code: "SEN", label: "Senior / Élite", ageMin: 19, ageMax: 34 },

  { code: "M1", label: "Masters 1", ageMin: 35, ageMax: 39 },
  { code: "M2", label: "Masters 2", ageMin: 40, ageMax: 44 },
  { code: "M3", label: "Masters 3", ageMin: 45, ageMax: 49 },
  { code: "M4", label: "Masters 4", ageMin: 50, ageMax: 54 },
  { code: "M5", label: "Masters 5", ageMin: 55, ageMax: 59 },
  { code: "M6", label: "Masters 6", ageMin: 60, ageMax: 64 },
  { code: "M7", label: "Masters 7", ageMin: 65, ageMax: 69 },
  { code: "M8", label: "Masters 8", ageMin: 70, ageMax: 74 },
  { code: "M9", label: "Masters 9", ageMin: 75, ageMax: 79 },
];

function computeUciCodeFromBirthYear(birthYear, refYear = new Date().getFullYear()) {
  const y = Number(birthYear);
  if (!Number.isFinite(y)) return null;
  const age = refYear - y;

  // U23 prioritaire
  if (age >= 19 && age <= 22) return "U23";

  for (const c of UCI) {
    if (c.code === "U23") continue;
    if (age >= c.ageMin && age <= c.ageMax) return c.code;
  }
  return null;
}

function uciLabelFromCode(code) {
  const c = UCI.find((x) => x.code === code);
  if (!c) return null;
  return `${c.code} — ${c.label} (${c.ageMin}–${c.ageMax})`;
}

function isMastersCode(code) {
  return /^M[1-9]$/.test(String(code || ""));
}

// ---------- UI: age filter options ----------
function fillAgeFilterOptions() {
  if (!ageSel) return;

  const current = ageSel.value || "";
  const options = [];

  options.push({ value: "", label: "Toutes catégories" });
  options.push({ value: "MASTERS", label: "Masters (M1–M9)" });

  // U* + SEN + M*
  for (const c of UCI) {
    options.push({ value: c.code, label: `${c.code} — ${c.label} (${c.ageMin}–${c.ageMax})` });
  }

  ageSel.innerHTML = options
    .map((o) => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`)
    .join("");

  // restore if still possible
  ageSel.value = options.some((o) => o.value === current) ? current : "";
}

// ---------- Whoami ----------
async function renderWhoami() {
  if (!whoami) return;

  try {
    const { data: u, error: ue } = await supabase.auth.getUser();
    if (ue) throw ue;

    const user = u?.user;
    if (!user) {
      whoami.textContent = "Non connecté";
      return;
    }

    const { data: p } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    whoami.textContent = `${user.email}${p?.role ? ` (${p.role})` : ""}`;
  } catch {
    whoami.textContent = "Non connecté";
  }
}

// ---------- Data loading ----------
async function loadRankingFromSupabase() {
  const { data, error } = await supabase
    .from("v_public_ranking")
    .select("*")
    .order("score", { ascending: false })
    .limit(5000);

  if (error) throw error;

  return (data || []).map((r) => {
    const birthYear = r.birth_year ?? r.birthYear ?? null;

    // ✅ if your SQL view provides it (recommended)
    const ageCode =
      r.age_category_id ??
      r.age_category ??
      r.agecat ??
      null;

    const computed = computeUciCodeFromBirthYear(birthYear);

    return {
      id: r.rider_id ?? r.id ?? `${r.last_name || ""}_${r.first_name || ""}_${r.team || ""}`.trim() || crypto.randomUUID(),
      name: r.name ?? `${r.last_name || ""} ${r.first_name || ""}`.trim() || "—",
      sex: r.sex ?? null,
      birthYear,
      ageCode: (ageCode || computed || null),
      nat: r.nationality ?? r.nat ?? "—",
      team: r.team ?? "—",
      score: Number(r.score ?? 0),
      races: Number(r.races ?? r.race_count ?? 0),
    };
  });
}

function getDemoRiders() {
  const arr = window.VTT_DATA?.riders;
  if (!Array.isArray(arr)) return [];

  // normalize demo rows to match our shape
  return arr.map((r) => {
    const birthYear = r.birthYear ?? r.birth_year ?? null;
    const computed = computeUciCodeFromBirthYear(birthYear);
    return {
      id: r.id ?? crypto.randomUUID(),
      name: r.name ?? "—",
      sex: r.sex ?? null,
      birthYear,
      ageCode: r.ageCode ?? r.age_category_id ?? computed ?? null,
      nat: r.nat ?? r.nationality ?? "—",
      team: r.team ?? "—",
      score: Number(r.score ?? 0),
      races: Number(r.races ?? 0),
    };
  });
}

function setWarning(on, text) {
  if (!warning) return;
  warning.style.display = on ? "" : "none";
  warning.textContent = on ? (text || "") : "";
}

let riders = [];

// ---------- Render ----------
function renderTable() {
  if (!tbody) return;

  const q = normalize(search?.value);
  const sex = sexSel?.value || "";
  const ageFilter = ageSel?.value || "";

  const filtered = riders
    .filter((r) => {
      const okName = !q || normalize(r.name).includes(q);
      const okSex = !sex || r.sex === sex;

      const code = r.ageCode || "";
      const okAge =
        !ageFilter ||
        (ageFilter === "MASTERS" ? isMastersCode(code) : code === ageFilter);

      return okName && okSex && okAge;
    })
    .slice()
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  tbody.innerHTML = filtered
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="name">
          <a href="rider.html?id=${encodeURIComponent(r.id)}">${escapeHTML(r.name)}</a>
          <div class="muted" style="font-size:12px; margin-top:2px;">
            ${escapeHTML(r.team || "—")}
          </div>
        </td>
        <td>${escapeHTML(sexLabel(r.sex))}</td>

        <!-- ✅ Ici: on affiche UNIQUEMENT le code -->
        <td><b>${escapeHTML(r.ageCode || "—")}</b></td>

        <td>${escapeHTML(r.nat || "—")}</td>
        <td class="right"><strong>${Number.isFinite(r.score) ? r.score : "—"}</strong></td>
        <td class="right">${Number.isFinite(r.races) ? r.races : "—"}</td>
      </tr>
    `
    )
    .join("");

  if (countLine) countLine.textContent = `${filtered.length} rider(s)`;
}

async function loadData() {
  riders = [];
  renderTable();

  try {
    const data = await loadRankingFromSupabase();
    riders = data;
    setWarning(false);
  } catch (e) {
    console.warn("[public-ranking] supabase failed:", e);
    riders = getDemoRiders();
    setWarning(true, "⚠️ Impossible de charger Supabase (vue absente / RLS / config). Affichage en mode démo.");
  }

  renderTable();
}

function bind() {
  fillAgeFilterOptions();

  if (search) search.addEventListener("input", renderTable);
  if (sexSel) sexSel.addEventListener("change", renderTable);
  if (ageSel) ageSel.addEventListener("change", renderTable);
  if (refreshBtn) refreshBtn.addEventListener("click", loadData);
}

bind();
await renderWhoami();
await loadData();
