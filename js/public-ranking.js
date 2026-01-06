// js/public-ranking.js
// Classement public (hybride) : Supabase si dispo -> sinon fallback demo (window.VTT_DATA)

import { supabase } from "./supabaseClient.js";

const tbody = document.getElementById("tbody");
const search = document.getElementById("search");
const sexSel = document.getElementById("sex");
const ageSel = document.getElementById("agecat");
const countLine = document.getElementById("countLine");
const whoami = document.getElementById("whoami");
const warning = document.getElementById("supabaseWarning");
const refreshBtn = document.getElementById("refreshBtn");

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

/** Labels */
function sexLabel(sex){
  if (sex === "M") return "H";
  if (sex === "F") return "F";
  return "—";
}

/**
 * Catégorie d'âge simple (tu peux remplacer par ton helper UCI si tu as déjà mieux)
 * - Si birthYear absent -> "—"
 */
function ageCategory(birthYear){
  const y = Number(birthYear);
  if (!Number.isFinite(y)) return "—";
  const now = new Date();
  const age = now.getFullYear() - y;

  if (age < 17) return "U17";
  if (age < 19) return "U19";
  if (age < 23) return "U23";
  if (age < 35) return "Senior";
  return "Master";
}

async function renderWhoami(){
  if (!whoami) return;

  try{
    const { data: u, error: ue } = await supabase.auth.getUser();
    if (ue) throw ue;

    const user = u?.user;
    if (!user){
      whoami.textContent = "Non connecté";
      return;
    }

    // Optionnel : lire role depuis profiles si table dispo (sinon ignore)
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

/**
 * Charge depuis Supabase.
 * Attendu : vue `public.v_public_ranking`
 * Colonnes conseillées:
 * - rider_id (text/uuid ou hash stable)
 * - name (text)
 * - sex (M/F)
 * - birth_year (int) ou birthYear
 * - nationality (text) ou nat
 * - team (text)
 * - score (int)
 * - races (int)
 */
async function loadRankingFromSupabase(){
  const { data, error } = await supabase
    .from("v_public_ranking")
    .select("*")
    .order("score", { ascending: false })
    .limit(5000);

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.rider_id ?? r.id ?? `${r.last_name || ""}_${r.first_name || ""}_${r.team || ""}`.trim() || crypto.randomUUID(),
    name: r.name ?? `${r.last_name || ""} ${r.first_name || ""}`.trim() || "—",
    sex: r.sex ?? null,
    birthYear: r.birth_year ?? r.birthYear ?? null,
    nat: r.nationality ?? r.nat ?? "—",
    team: r.team ?? "—",
    score: Number(r.score ?? 0),
    races: Number(r.races ?? r.race_count ?? 0),
  }));
}

function getDemoRiders(){
  const arr = window.VTT_DATA?.riders;
  return Array.isArray(arr) ? arr : [];
}

function setWarning(on, text){
  if (!warning) return;
  warning.style.display = on ? "" : "none";
  warning.textContent = on ? (text || "") : "";
}

let riders = [];

function renderTable(){
  const q = normalize(search?.value);
  const sex = sexSel?.value || "";
  const ageFilter = ageSel?.value || "";

  const filtered = riders
    .map(r => ({ ...r, ageCat: r.ageCat || ageCategory(r.birthYear) }))
    .filter(r => {
      const okName = !q || normalize(r.name).includes(q);
      const okSex = !sex || r.sex === sex;

      const okAge =
        !ageFilter ||
        (ageFilter === "Master"
          ? String(r.ageCat).startsWith("Master")
          : r.ageCat === ageFilter);

      return okName && okSex && okAge;
    })
    .slice()
    .sort((a,b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  tbody.innerHTML = filtered.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="name"><a href="rider.html?id=${encodeURIComponent(r.id)}">${escapeHTML(r.name)}</a></td>
      <td>${escapeHTML(sexLabel(r.sex))}</td>
      <td>${escapeHTML(r.ageCat || "—")}</td>
      <td>${escapeHTML(r.nat || "—")}</td>
      <td>${escapeHTML(r.team || "—")}</td>
      <td class="right"><strong>${Number.isFinite(r.score) ? r.score : "—"}</strong></td>
      <td class="right">${Number.isFinite(r.races) ? r.races : "—"}</td>
    </tr>
  `).join("");

  if (countLine) countLine.textContent = `${filtered.length} cycliste(s)`;
}

async function loadData(){
  // default state
  riders = [];
  renderTable();

  // 1) try Supabase
  try{
    const data = await loadRankingFromSupabase();
    riders = data;
    setWarning(false);
  } catch(e){
    console.warn("[public-ranking] supabase failed:", e);

    riders = getDemoRiders();
    setWarning(true, "⚠️ Impossible de charger les données Supabase (vue absente / RLS / configuration). Affichage en mode démo.");
  }

  renderTable();
}

function bind(){
  if (search) search.addEventListener("input", renderTable);
  if (sexSel) sexSel.addEventListener("change", renderTable);
  if (ageSel) ageSel.addEventListener("change", renderTable);
  if (refreshBtn) refreshBtn.addEventListener("click", loadData);
}

bind();
await renderWhoami();
await loadData();
