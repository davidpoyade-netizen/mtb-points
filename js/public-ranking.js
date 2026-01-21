// js/public-ranking.js
// MTB Points — classement public
// ✅ 4 tableaux : Musculaire H/F + AE H/F
// ✅ onglets : Global + XC-Global + XCC/XCO/XCR/XCM + Gravel/DH/Enduro
// ✅ filtres : search, nat, agecat, ageMin/Max, minPts, sort
// ✅ Supabase only

import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);
const esc = (s)=>String(s??"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const TABS = $("tabs");
const pillMode = $("pillMode");
const pillRows = $("pillRows");
const pillCount = $("pillCount");

const DISCIPLINES = [
  { key: "GLOBAL", label: "Global" },
  { key: "XC-GLOBAL", label: "XC-Global" },
  { key: "XCC", label: "XCC" },
  { key: "XCO", label: "XCO" },
  { key: "XCR", label: "XCR" },
  { key: "XCM", label: "XCM" },
  { key: "DH", label: "DH" },
  { key: "Enduro", label: "Enduro" },
  { key: "Gravel", label: "Gravel" },
];

let ACTIVE = "GLOBAL";
let BASE_ROWS = []; // rows for active mode (already filtered by discipline at load if possible)

function num(x){
  const n = Number(String(x ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function normalize(s){
  return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}

function ageFromBirthYear(birthYear){
  const y = Number(birthYear);
  if (!Number.isFinite(y)) return null;
  const now = new Date();
  return now.getFullYear() - y;
}

function ageCategory(birthYear){
  const age = ageFromBirthYear(birthYear);
  if (age == null) return "—";
  if (age < 17) return "U17";
  if (age < 19) return "U19";
  if (age < 23) return "U23";
  if (age < 35) return "Senior";
  return "Master";
}

function buildTabs(){
  TABS.innerHTML = "";
  for (const d of DISCIPLINES){
    const b = document.createElement("button");
    b.type = "button";
    b.className = `tab ${d.key === ACTIVE ? "active" : ""}`;
    b.textContent = d.label;
    b.addEventListener("click", async () => {
      ACTIVE = d.key;
      buildTabs();
      await loadForMode();
      renderAll();
    });
    TABS.appendChild(b);
  }
}

function setOptions(selectEl, items){
  const keep = selectEl.value;
  selectEl.innerHTML = `<option value="">Toutes</option>` + items.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if (keep) selectEl.value = keep;
}

function splitRows(rows){
  const mm = rows.filter(r => r.sex === "M" && !r.ebike);
  const mf = rows.filter(r => r.sex === "F" && !r.ebike);
  const em = rows.filter(r => r.sex === "M" &&  r.ebike);
  const ef = rows.filter(r => r.sex === "F" &&  r.ebike);
  return { mm, mf, em, ef };
}

function clearTables(){
  ["tbodyMM","tbodyMF","tbodyEM","tbodyEF"].forEach(id => $(id).innerHTML = "");
  ["emptyMM","emptyMF","emptyEM","emptyEF"].forEach(id => $(id).style.display = "none");
}

function renderTable(tbodyId, emptyId, list){
  const tb = $(tbodyId);
  const empty = $(emptyId);
  tb.innerHTML = "";

  if (!list.length){
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.forEach((r, idx) => {
    const age = ageFromBirthYear(r.birth_year);
    const tr = document.createElement("tr");
    const riderLabel = r.name || "—";
    const riderLink = r.rider_id ? `<a href="rider.html?id=${encodeURIComponent(r.rider_id)}">${esc(riderLabel)}</a>` : esc(riderLabel);

    tr.innerHTML = `
      <td class="rank">${idx + 1}</td>
      <td>
        <div class="name">${riderLink}</div>
        <div class="small">${esc(r.team || "—")}</div>
      </td>
      <td>
        <div><b>${esc(ageCategory(r.birth_year))}</b></div>
        <div class="small">Âge : ${age != null ? esc(String(age)) : "—"}</div>
      </td>
      <td>${esc(r.nationality || "—")}</td>
      <td class="points">${esc(String(r.score ?? 0))} pts</td>
      <td>${Number.isFinite(Number(r.races)) ? esc(String(r.races)) : "—"}</td>
    `;
    tb.appendChild(tr);
  });
}

// -------- Supabase loaders (robustes) --------

async function trySelect(viewName, selectStr, filters = [], order = null, limit = 5000){
  let q = supabase.from(viewName).select(selectStr);
  for (const f of filters){
    if (f.op === "eq") q = q.eq(f.col, f.val);
    if (f.op === "in") q = q.in(f.col, f.val);
  }
  if (order) q = q.order(order.col, { ascending: order.asc });
  if (limit) q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function normalizeRow(r){
  return {
    rider_id: r.rider_id ?? r.id ?? null,
    name: r.name ?? `${(r.last_name||"")} ${(r.first_name||"")}`.trim(),
    sex: r.sex ?? null,
    ebike: !!r.ebike,
    nationality: r.nationality ?? r.nat ?? null,
    team: r.team ?? null,
    score: Number(r.score ?? 0),
    races: Number(r.races ?? 0),
    birth_year: r.birth_year ?? r.birthYear ?? null,

    // discipline key (selon vue)
    disc: r.disc ?? r.discipline ?? null,
  };
}

/**
 * Stratégie:
 * - Global: v_public_ranking (si dispo) SINON v_public_ranking_by_disc (toutes disc) agrégée côté vue déjà.
 * - Disc spécifique: v_public_ranking_by_disc (disc=...) si dispo, sinon v_public_ranking filtrable si elle contient disc.
 * - XC-Global: v_public_ranking_xc_global si dispo, sinon by_disc in (XCC,XCO,XCR,XCM) et on somme côté JS.
 */
async function loadForMode(){
  const mode = DISCIPLINES.find(d => d.key === ACTIVE) || DISCIPLINES[0];
  if (pillMode) pillMode.textContent = mode.label;

  // 1) XC-Global via vue dédiée si possible
  if (ACTIVE === "XC-GLOBAL"){
    try{
      const rows = await trySelect(
        "v_public_ranking_xc_global",
        "rider_id,name,sex,ebike,nationality,team,score,races,birth_year",
        [],
        { col: "score", asc: false },
        5000
      );
      BASE_ROWS = rows.map(normalizeRow);
      if (pillRows) pillRows.textContent = String(BASE_ROWS.length);
      return;
    } catch(_) {
      // fallback below
    }
  }

  // 2) Disc spécifique via by_disc
  if (ACTIVE !== "GLOBAL" && ACTIVE !== "XC-GLOBAL"){
    try{
      const rows = await trySelect(
        "v_public_ranking_by_disc",
        "disc,ebike,rider_id,name,sex,nationality,team,score,races,birth_year",
        [{ op:"eq", col:"disc", val: ACTIVE }],
        { col: "score", asc: false },
        5000
      );
      BASE_ROWS = rows.map(normalizeRow);
      if (pillRows) pillRows.textContent = String(BASE_ROWS.length);
      return;
    } catch(_) {
      // fallback below
    }
  }

  // 3) Global via v_public_ranking
  if (ACTIVE === "GLOBAL"){
    const rows = await trySelect(
      "v_public_ranking",
      "*",
      [],
      { col: "score", asc: false },
      5000
    );
    BASE_ROWS = rows.map(normalizeRow);
    if (pillRows) pillRows.textContent = String(BASE_ROWS.length);
    return;
  }

  // 4) Fallback XC-Global (somme côté JS depuis by_disc)
  if (ACTIVE === "XC-GLOBAL"){
    const rows = await trySelect(
      "v_public_ranking_by_disc",
      "disc,ebike,rider_id,name,sex,nationality,team,score,races,birth_year",
      [{ op:"in", col:"disc", val:["XCC","XCO","XCR","XCM"] }],
      null,
      5000
    );
    // somme par rider_id + ebike
    const map = new Map();
    for (const rr of rows.map(normalizeRow)){
      const key = `${rr.rider_id || rr.name}::${rr.ebike ? 1 : 0}`;
      const cur = map.get(key) || { ...rr, score:0, races:0, disc:"XC-GLOBAL" };
      cur.score += Number(rr.score || 0);
      cur.races += Number(rr.races || 0);
      // garder meilleure info
      cur.name = cur.name || rr.name;
      cur.sex = cur.sex || rr.sex;
      cur.nationality = cur.nationality || rr.nationality;
      cur.team = cur.team || rr.team;
      cur.birth_year = cur.birth_year || rr.birth_year;
      map.set(key, cur);
    }
    BASE_ROWS = Array.from(map.values()).sort((a,b)=>b.score-a.score);
    if (pillRows) pillRows.textContent = String(BASE_ROWS.length);
    return;
  }

  // 5) Dernier fallback: on tente v_public_ranking avec filtre discipline si la colonne existe
  // (si ta vue ne contient pas disc, ça échouera -> console)
  const rows = await trySelect(
    "v_public_ranking",
    "*",
    [],
    { col: "score", asc: false },
    5000
  );
  const normalized = rows.map(normalizeRow);
  BASE_ROWS = normalized.filter(r => String(r.disc || "").trim() === ACTIVE);
  if (pillRows) pillRows.textContent = String(BASE_ROWS.length);
}

// -------- Filters + render --------

function fillNatOptions(rows){
  const nats = Array.from(new Set(rows.map(r => (r.nationality || "").trim()).filter(Boolean)))
    .sort((a,b)=>a.localeCompare(b));
  setOptions($("nat"), nats);
}

function applyFilters(rows){
  const q = normalize($("q").value || "");
  const nat = ($("nat").value || "").trim();
  const ageCat = ($("agecat").value || "").trim();
  const ageMin = num($("ageMin").value);
  const ageMax = num($("ageMax").value);
  const minPts = num($("minPts").value) ?? 0;

  return rows.filter(r => {
    if (q){
      const txt = normalize(`${r.name||""} ${r.team||""} ${r.nationality||""}`);
      if (!txt.includes(q)) return false;
    }
    if (nat && (r.nationality || "") !== nat) return false;

    const age = ageFromBirthYear(r.birth_year);
    if (ageMin != null){
      if (age == null) return false;
      if (age < ageMin) return false;
    }
    if (ageMax != null){
      if (age == null) return false;
      if (age > ageMax) return false;
    }

    if (ageCat){
      if (ageCategory(r.birth_year) !== ageCat) return false;
    }

    if ((Number(r.score) || 0) < minPts) return false;

    return true;
  });
}

function sortRows(rows){
  const s = $("sortBy").value || "points_desc";
  const a = rows.slice();
  a.sort((x,y) => {
    if (s === "points_desc") return (y.score||0) - (x.score||0);
    if (s === "points_asc") return (x.score||0) - (y.score||0);
    if (s === "name_asc") return String(x.name||"").toLowerCase().localeCompare(String(y.name||"").toLowerCase());
    return 0;
  });
  return a;
}

function renderAll(){
  clearTables();

  // options nat selon dataset du mode
  fillNatOptions(BASE_ROWS);

  let rows = applyFilters(BASE_ROWS);
  rows = sortRows(rows);

  // counts
  if (pillCount) pillCount.textContent = String(new Set(rows.map(r => r.rider_id || r.name)).size);
  $("countShown").textContent = String(rows.length);

  const { mm, mf, em, ef } = splitRows(rows);

  $("countMM").textContent = String(mm.length);
  $("countMF").textContent = String(mf.length);
  $("countEM").textContent = String(em.length);
  $("countEF").textContent = String(ef.length);

  renderTable("tbodyMM", "emptyMM", mm);
  renderTable("tbodyMF", "emptyMF", mf);
  renderTable("tbodyEM", "emptyEM", em);
  renderTable("tbodyEF", "emptyEF", ef);
}

function bind(){
  $("btnReset").addEventListener("click", async () => {
    $("q").value = "";
    $("nat").value = "";
    $("agecat").value = "";
    $("ageMin").value = "";
    $("ageMax").value = "";
    $("minPts").value = "";
    $("sortBy").value = "points_desc";
    renderAll();
  });

  ["q","nat","agecat","ageMin","ageMax","minPts","sortBy"].forEach(id => {
    $(id).addEventListener("input", renderAll);
    $(id).addEventListener("change", renderAll);
  });
}

(async function init(){
  buildTabs();
  bind();
  await loadForMode();
  renderAll();
})();
