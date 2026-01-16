// js/race-ranking.js
// Classement public d'une épreuve (race-ranking.html)
// Source: Supabase v_public_results + races (best-effort)

import { supabase } from "./supabaseClient.js";

(function(){
  const $ = (id) => document.getElementById(id);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };

  function normSex(v){
    const s = String(v ?? "").trim().toUpperCase();
    if (s === "M" || s === "H" || s === "MALE") return "M";
    if (s === "F" || s === "W" || s === "FEMALE") return "F";
    return null;
  }

  function normStatus(v){
    const s = String(v ?? "").trim().toUpperCase();
    if (!s) return null;
    if (s === "FINISH" || s === "FINISHED" || s === "OK") return "FINISH";
    if (s === "DNF" || s === "ABANDON") return "DNF";
    if (s === "DNS" || s === "ABSENT") return "DNS";
    return s;
  }

  function normBikeBool(row){
    // per-result ebike preferred, else race_ebike if view carries it
    const v = (row.ebike ?? row.race_ebike ?? row.raceEbike ?? row.is_ebike ?? null);
    if (v === true || v === false) return v;
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "1" || s === "true" || s === "yes") return true;
    if (s === "0" || s === "false" || s === "no") return false;
    return null;
  }

  function riderName(row){
    const rn = (row.rider_name ?? row.name ?? "").toString().trim();
    if (rn) return rn;
    const fn = (row.first_name ?? "").toString().trim();
    const ln = (row.last_name ?? "").toString().trim();
    const full = `${fn} ${ln}`.trim();
    return full || "Rider";
  }

  function timeText(row){
    const td = (row.time_display ?? row.time ?? "").toString().trim();
    if (td) return td;
    const ts = num(row.time_seconds);
    if (ts == null) return "";
    const h = Math.floor(ts/3600);
    const m = Math.floor((ts%3600)/60);
    const s = Math.floor(ts%60);
    const pad = (x)=>String(x).padStart(2,"0");
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function setEmpty(tbId, emptyId, isEmpty){
    const tb = $(tbId);
    const e = $(emptyId);
    if (tb) tb.style.display = isEmpty ? "none" : "table";
    if (e) e.style.display = isEmpty ? "block" : "none";
  }

  function renderTable(tbId, emptyId, rows){
    const tbody = $(tbId)?.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows.length){
      setEmpty(tbId, emptyId, true);
      return;
    }
    setEmpty(tbId, emptyId, false);
    tbody.innerHTML = rows.slice(0,200).map(r => `
      <tr>
        <td class="mono">${esc(String(r.rank ?? ""))}</td>
        <td>${esc(r.name)}</td>
        <td class="mono">${esc(r.age_category || "")}</td>
        <td class="mono">${esc(r.time)}</td>
      </tr>
    `).join("");
  }

  // ✅ CORRECTION : Récupérer l'ID depuis l'URL (raceId ou id)
  const params = new URLSearchParams(window.location.search);
  const raceId = params.get("id") || params.get("raceId") || "";
  
  if (!raceId){
    $("raceTitle").textContent = "Épreuve introuvable";
    $("raceMeta").innerHTML = "❌ Paramètre <span class='mono'>id</span> manquant dans l'URL.";
    $("raceIdLine").textContent = "Utilisez : race-ranking.html?id=xxx";
    return;
  }

  $("raceIdLine").innerHTML = `Race ID: <span class="mono">${esc(raceId)}</span>`;
  
  // ✅ Boutons de navigation
  const importUrl = `import-results.html?raceId=${encodeURIComponent(raceId)}`;
  const btnImport = $("btnImport");
  if (btnImport) btnImport.href = importUrl;

  const modeSel = $("mode");
  const statusSel = $("status");
  const catSel = $("ageCat");
  const catWrap = $("catWrap");

  let allRows = [];
  let raceInfo = null;

  async function loadRaceInfo(){
    // Best-effort (peut échouer selon RLS)
    try{
      const { data, error } = await supabase
        .from("races")
        .select("id,name,date,discipline,level,meeting_id")
        .eq("id", raceId)
        .maybeSingle();
      if (error) throw error;
      raceInfo = data || null;
    }catch(err){
      console.warn("[race-ranking] loadRaceInfo failed:", err);
      raceInfo = null;
    }
  }

  async function loadResults(){
    // Source unique: v_public_results (doit être accessible en anon)
    const { data, error } = await supabase
      .from("v_public_results")
      .select("*")
      .eq("race_id", raceId)
      .order("rank", { ascending: true })
      .limit(5000);
    if (error) throw error;
    allRows = (data || []).map(r => ({
      raw: r,
      rank: num(r.rank) ?? null,
      name: riderName(r),
      sex: normSex(r.sex),
      age_category: (r.age_category ?? r.age_category_name ?? r.category ?? "").toString().trim() || null,
      status: normStatus(r.status),
      ebike: normBikeBool(r),
      time: timeText(r),
    }));
  }

  function fillCats(rows){
    const cats = Array.from(new Set(rows.map(x=> (x.age_category||"").trim()).filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b));
    catSel.innerHTML = "";
    for (const c of cats){
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      catSel.appendChild(o);
    }
    if (!cats.length){
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "(aucune catégorie détectée)";
      catSel.appendChild(o);
    }
  }

  function filterRows(){
    const statusMode = statusSel.value || "FINISH";
    const mode = modeSel.value || "global";
    const cat = catSel.value || "";

    let rows = allRows.slice();
    if (statusMode !== "ALL") rows = rows.filter(r => r.status === "FINISH");
    // keep only rows that can rank
    rows = rows.filter(r => r.rank != null);
    if (mode === "category" && cat) rows = rows.filter(r => (r.age_category || "") === cat);
    return rows;
  }

  function render(){
    const mode = modeSel.value || "global";
    if (catWrap) catWrap.style.display = (mode === "category") ? "block" : "none";

    const rows = filterRows();
    $("pillRows").textContent = String(rows.length);

    const mMen = rows.filter(r => r.sex === "M" && r.ebike === false);
    const mWomen = rows.filter(r => r.sex === "F" && r.ebike === false);
    const eMen = rows.filter(r => r.sex === "M" && r.ebike === true);
    const eWomen = rows.filter(r => r.sex === "F" && r.ebike === true);

    renderTable("tb1","box1",mMen);
    renderTable("tb2","box2",mWomen);
    renderTable("tb3","box3",eMen);
    renderTable("tb4","box4",eWomen);
  }

  function setHeader(){
    if (raceInfo){
      $("raceTitle").textContent = raceInfo.name || "Épreuve";
      const bits = [];
      if (raceInfo.date) bits.push(`📅 ${raceInfo.date}`);
      if (raceInfo.discipline) bits.push(`🏷️ ${raceInfo.discipline}`);
      if (raceInfo.level) bits.push(`📊 ${raceInfo.level}`);
      $("raceMeta").textContent = bits.join(" • ") || "—";
      
      // ✅ Bouton retour vers meeting ou race
      const back = $("btnBack");
      if (back){
        if (raceInfo.meeting_id) {
          back.href = `meeting.html?id=${encodeURIComponent(raceInfo.meeting_id)}`;
          back.innerHTML = "⬅️ Retour à l'événement";
        } else {
          back.href = `race.html?id=${encodeURIComponent(raceId)}`;
          back.innerHTML = "⬅️ Retour à l'épreuve";
        }
      }
    } else {
      $("raceTitle").textContent = "Classement de l'épreuve";
      $("raceMeta").textContent = "Source: Supabase (v_public_results)";
      
      // Bouton retour par défaut
      const back = $("btnBack");
      if (back){
        back.href = `race.html?id=${encodeURIComponent(raceId)}`;
        back.innerHTML = "⬅️ Retour à l'épreuve";
      }
    }
  }

  async function init(){
    try{
      await loadRaceInfo();
      await loadResults();
      setHeader();
      fillCats(allRows);
      render();
    }catch(e){
      console.warn("[race-ranking] load failed", e);
      $("raceMeta").innerHTML = `⚠️ Classement indisponible (RLS/config). <span class="muted">${esc(e?.message||"")}</span>`;
      $("pillRows").textContent = "0";
      renderTable("tb1","box1",[]);
      renderTable("tb2","box2",[]);
      renderTable("tb3","box3",[]);
      renderTable("tb4","box4",[]);
    }
  }

  [modeSel,statusSel,catSel].forEach(el => el?.addEventListener("change", render));
  init();
})();
