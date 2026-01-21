// public-ranking.js
// MTB Points — Classement public
// ✔ CSS Nature conservé
// ✔ Musculaire / Électrique séparés
// ✔ Hommes / Femmes séparés
// ✔ XC-Global = XCC + XCO + XCR + XCM

import { supabase } from "./supabaseClient.js";

const TB = {
  m_m: document.getElementById("tbody_m_m"),
  m_f: document.getElementById("tbody_m_f"),
  e_m: document.getElementById("tbody_e_m"),
  e_f: document.getElementById("tbody_e_f"),
};

const TABS = document.getElementById("tabs");

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

function esc(s){
  return String(s ?? "")
    .replace(/[&<>"']/g, m => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#39;"
    }[m]));
}

function buildTabs(){
  TABS.innerHTML = "";
  DISCIPLINES.forEach(d => {
    const b = document.createElement("button");
    b.className = `tab ${d.key === ACTIVE ? "active" : ""}`;
    b.textContent = d.label;
    b.onclick = () => {
      ACTIVE = d.key;
      buildTabs();
      load();
    };
    TABS.appendChild(b);
  });
}

function clearTables(){
  Object.values(TB).forEach(tb => tb.innerHTML = "");
}

function addRow(tbody, r, i){
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${i + 1}</td>
    <td>${esc(r.name)}</td>
    <td>${esc(r.nationality || "—")}</td>
    <td><strong>${r.score}</strong></td>
  `;
  tbody.appendChild(tr);
}

async function load(){
  clearTables();

  const { data, error } = await supabase
    .from("v_public_ranking")
    .select("name, sex, ebike, discipline, score, nationality");

  if (error){
    console.error("public-ranking:", error);
    return;
  }

  let rows = data || [];

  // Filtrage discipline
  if (ACTIVE === "XC-GLOBAL") {
    rows = rows.filter(r =>
      ["XCC", "XCO", "XCR", "XCM"].includes(r.discipline)
    );
  } else if (ACTIVE !== "GLOBAL") {
    rows = rows.filter(r => r.discipline === ACTIVE);
  }

  rows.sort((a, b) => b.score - a.score);

  rows.forEach((r, i) => {
    const key = `${r.ebike ? "e" : "m"}_${r.sex === "F" ? "f" : "m"}`;
    if (TB[key]) addRow(TB[key], r, i);
  });
}

buildTabs();
load();
