// js/event-detail.js
// Fiche épreuve : affichage complet + profil coloré + carte colorée par segments

function $(id){ return document.getElementById(id); }
function setText(id, t){
  const el = $(id);
  if (!el) return;
  el.textContent = (t == null || t === "") ? "—" : String(t);
}
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

function formatKm(x){
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return `${String(n.toFixed(2)).replace(".", ",")} km`;
}
function formatM(x){
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)} m`;
}

function getIdFromUrl(){
  const p = new URLSearchParams(location.search);
  return p.get("id");
}

function computeDminus(points){
  if (!Array.isArray(points) || points.length < 2) return null;
  let dminus = 0, hasEle = false, allZero = true;
  for (let i=1;i<points.length;i++){
    const a = points[i-1], b = points[i];
    if (a.ele == null || b.ele == null) continue;
    hasEle = true;
    if (a.ele !== 0 || b.ele !== 0) allZero = false;
    const d = b.ele - a.ele;
    if (d < 0) dminus += (-d);
  }
  if (!hasEle || allZero) return null;
  return Math.round(dminus);
}

function computeGlobalScore(gpx){
  const phys = Number(gpx?.phys?.score);
  const tech = Number(gpx?.tech?.techScore);
  if (!Number.isFinite(phys) || !Number.isFinite(tech)) return null;
  return Math.round(0.55 * phys + 0.45 * tech);
}

function difficultyFromGlobalScore(score){
  const s = Number(score);
  if (!Number.isFinite(s)) return { label:"—", color:"#94a3b8", hint:"" };
  if (s < 25) return { label:"Vert (facile)", color:"#22c55e", hint:"Parcours plutôt roulant / accessible." };
  if (s < 50) return { label:"Bleu (modéré)", color:"#3b82f6", hint:"Difficulté modérée, passages techniques possibles." };
  if (s < 75) return { label:"Rouge (difficile)", color:"#ef4444", hint:"Difficulté élevée, nécessite un bon niveau." };
  return { label:"Noir (très difficile)", color:"#111827", hint:"Très exigeant, passages déterminants techniques et/ou physiques." };
}

function buildAutoSummary(gpx, globalScore, diffLabel){
  const se = gpx?.surfaceEstimate;
  const techScore = gpx?.tech?.techScore;
  const p75 = gpx?.tech?.techCoeffP75;
  const phys = gpx?.phys?.score;

  let surfacePart = "Type de voie indisponible";
  if (se) {
    const entries = [
      { k:"Route", v: se.roadPct },
      { k:"Piste large", v: se.trackPct },
      { k:"Single", v: se.singlePct }
    ].sort((a,b)=>b.v-a.v);
    surfacePart = `Parcours plutôt ${entries[0].k.toLowerCase()} (${entries[0].v}%)`;
  }

  const techPart = (Number.isFinite(Number(techScore)) && Number.isFinite(Number(p75)))
    ? `technique ${techScore}/100 (P75=${p75})`
    : "technique —";

  const physPart = Number.isFinite(Number(phys)) ? `physique ${phys}/100` : "physique —";
  const globalPart = Number.isFinite(Number(globalScore)) ? `global ${globalScore}/100` : "global —";

  const diffShort = (diffLabel || "—").split(" ")[0];
  return `${surfacePart}, ${techPart}, ${physPart} → ${globalPart} (${diffShort}).`;
}

/* ---------------- Colors (score -> ski colors) ---------------- */
function colorFromScore(score){
  const s = Number(score);
  if (!Number.isFinite(s)) return "#94a3b8";
  if (s < 25) return "#22c55e";
  if (s < 50) return "#3b82f6";
  if (s < 75) return "#ef4444";
  return "#111827";
}

/* ---------------- Profile + Tooltip ---------------- */

function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

function colorFromScore(score){
  const s = Number(score);
  if (!Number.isFinite(s)) return "#94a3b8"; // gris
  if (s < 25) return "#22c55e"; // vert
  if (s < 50) return "#3b82f6"; // bleu
  if (s < 75) return "#ef4444"; // rouge
  return "#111827";             // noir
}

function renderElevationProfile(canvas, infoEl, pts, hasElevation, segments){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Responsive width
  const wrapWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.width;
  canvas.width = Math.max(320, Math.floor(wrapWidth - 24));
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0,0,W,H);

  if (!Array.isArray(pts) || pts.length < 2){
    if (infoEl) infoEl.textContent = "Pas assez de points GPX pour le profil.";
    return;
  }
  if (!hasElevation){
    if (infoEl) infoEl.textContent = "Altitude indisponible → profil non calculable.";
    ctx.strokeStyle = "#94a3b8";
    ctx.beginPath(); ctx.moveTo(0, H-20); ctx.lineTo(W, H-20); ctx.stroke();
    return;
  }

  // --- distance cumulative (haversine) ---
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const hav = (a, b) => {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const x =
      Math.sin(dLat/2)**2 +
      Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  };

  const dist = [0];
  for (let i=1;i<pts.length;i++) dist[i] = dist[i-1] + hav(pts[i-1], pts[i]);
  const totalM = dist[dist.length-1] || 1;
  const totalKm = totalM / 1000;

  // --- min/max elevation ---
  const elev = pts.map(p => p.ele);
  let minE = Math.min(...elev);
  let maxE = Math.max(...elev);
  if (!isFinite(minE) || !isFinite(maxE) || (maxE-minE) < 1){
    if (infoEl) infoEl.textContent = "Altitude non exploitable → profil non calculable.";
    return;
  }

  // --- layout ---
  const padL=34, padR=10, padT=10, padB=28;
  const innerW=W-padL-padR, innerH=H-padT-padB;
  const baseY = H - padB;

  function xy(i){
    const x = padL + (dist[i]/totalM)*innerW;
    const y = padT + (1 - (pts[i].ele - minE)/(maxE-minE))*innerH;
    return {x,y};
  }

  // --- axes labels (alt) ---
  ctx.fillStyle = "#111";
  ctx.font = "12px Arial";
  ctx.fillText(`${Math.round(maxE)} m`, 6, padT+12);
  ctx.fillText(`${Math.round(minE)} m`, 6, baseY);

  // --- bottom axis baseline ---
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, baseY);
  ctx.lineTo(W-padR, baseY);
  ctx.stroke();

  // --- X ticks every 5 km ---
  const stepKm = 5;
  const maxTick = Math.floor(totalKm / stepKm) * stepKm;

  ctx.strokeStyle = "#cbd5e1";
  ctx.fillStyle = "#334155";
  ctx.font = "11px Arial";

  for (let k=0; k<=maxTick; k+=stepKm){
    const x = padL + (k/totalKm)*innerW;
    // tick
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY+5);
    ctx.stroke();
    // label
    const label = `${k} km`;
    ctx.fillText(label, x-12, baseY+18);
  }

  // --- segments coloring (fill under curve + draw line) ---
  const segs = Array.isArray(segments) ? segments : [];

  // fallback if no segments: draw one filled area (blue)
  if (!segs.length){
    // fill area
    ctx.fillStyle = "rgba(37,99,235,0.15)";
    ctx.beginPath();
    let p0 = xy(0);
    ctx.moveTo(p0.x, baseY);
    ctx.lineTo(p0.x, p0.y);
    for (let i=1;i<pts.length;i++){
      const p = xy(i);
      ctx.lineTo(p.x, p.y);
    }
    const pn = xy(pts.length-1);
    ctx.lineTo(pn.x, baseY);
    ctx.closePath();
    ctx.fill();

    // line
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i=1;i<pts.length;i++){
      const p = xy(i);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    if (infoEl) infoEl.textContent = `Profil • ${totalKm.toFixed(1).replace(".", ",")} km • Alt ${Math.round(minE)}–${Math.round(maxE)} m`;
    return;
  }

  // draw each segment: first fill polygon to baseline, then line on top
  for (const seg of segs){
    const a = clamp(seg.from ?? 0, 0, pts.length-1);
    const b = clamp(seg.to ?? 0, 0, pts.length-1);
    if (b <= a) continue;

    const col = colorFromScore(seg.globalSegScore);
    // fill with alpha
    ctx.fillStyle = col + "22"; // add transparency (works for hex like #RRGGBB)
    // some browsers don't like hex+alpha. safer:
    // ctx.fillStyle = hexToRgba(col, 0.18);

    ctx.beginPath();
    const pA = xy(a);
    ctx.moveTo(pA.x, baseY);
    ctx.lineTo(pA.x, pA.y);
    for (let i=a+1;i<=b;i++){
      const p = xy(i);
      ctx.lineTo(p.x, p.y);
    }
    const pB = xy(b);
    ctx.lineTo(pB.x, baseY);
    ctx.closePath();
    // if your browser ignores #RRGGBB22, comment the fillStyle above and use this helper (see note)
    ctx.fill();
  }

  // line on top per segment (for crispness)
  ctx.lineWidth = 2.5;
  for (const seg of segs){
    const a = clamp(seg.from ?? 0, 0, pts.length-1);
    const b = clamp(seg.to ?? 0, 0, pts.length-1);
    if (b <= a) continue;

    ctx.strokeStyle = colorFromScore(seg.globalSegScore);
    ctx.beginPath();
    const pA = xy(a);
    ctx.moveTo(pA.x, pA.y);
    for (let i=a+1;i<=b;i++){
      const p = xy(i);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  if (infoEl) {
    infoEl.textContent =
      `Profil coloré (aire remplie) • ${totalKm.toFixed(1).replace(".", ",")} km • Alt ${Math.round(minE)}–${Math.round(maxE)} m • repères tous les 5 km`;
  }
}

/* NOTE : Si le fillStyle "#RRGGBB22" ne marche pas chez toi,
   remplace la ligne ctx.fillStyle = col + "22" par :

function hexToRgba(hex, a){
  const h = hex.replace("#","").trim();
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
...
ctx.fillStyle = hexToRgba(col, 0.18);
*/

/* ---------------- Map colored segments (Leaflet) ---------------- */
function renderColoredMap(mapDiv, pts, segments){
  if (!mapDiv) return;

  if (!window.L){
    mapDiv.innerHTML = `<div style="padding:12px;color:#667085;">Leaflet non chargé (connexion/CDN).</div>`;
    return;
  }
  if (!Array.isArray(pts) || pts.length < 2){
    mapDiv.innerHTML = `<div style="padding:12px;color:#667085;">Pas assez de points GPX pour la carte.</div>`;
    return;
  }

  mapDiv.innerHTML = "";
  const map = L.map(mapDiv, { scrollWheelZoom:false });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom:19,
    attribution:'&copy; OpenStreetMap'
  }).addTo(map);

  const segs = Array.isArray(segments) ? segments : [];

  // helper: segment score -> color
  function segScoreToColor(seg){
    let s = Number(seg.globalSegScore);
    if (!Number.isFinite(s)) s = Number(seg.techSegScore);
    if (!Number.isFinite(s)) {
      const tc = Number(seg.techCoeff);
      if (Number.isFinite(tc)) s = 100 * clamp((tc - 0.80) / 0.80, 0, 1);
    }
    if (!Number.isFinite(s)) s = 0;
    return colorFromScore(s);
  }

  // If we have segments, draw colored polylines segment by segment
  if (segs.length){
    for (const seg of segs){
      const a = clamp(Number(seg.from), 0, pts.length-1);
      const b = clamp(Number(seg.to), 0, pts.length-1);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;

      const latlngs = [];
      for (let i=a;i<=b;i++){
        latlngs.push([pts[i].lat, pts[i].lon]);
      }

      const line = L.polyline(latlngs, {
        weight: 5,
        opacity: 0.95,
        color: segScoreToColor(seg)
      }).addTo(map);

      // optional: tooltip on segment
      const gs = Number(seg.globalSegScore);
      const label = Number.isFinite(gs) ? `Score segment: ${Math.round(gs)}/100` : `Segment`;
      line.bindTooltip(label, { sticky:true });
    }
  } else {
    // fallback: one line
    const latlngs = pts.map(p => [p.lat, p.lon]);
    L.polyline(latlngs, { weight:5, opacity:0.9 }).addTo(map);
  }

  // Fit bounds: use whole track bounds
  const allLatLng = pts.map(p => [p.lat, p.lon]);
  const bounds = L.latLngBounds(allLatLng);
  map.fitBounds(bounds, { padding:[20,20] });

  // start/end markers
  L.marker(allLatLng[0]).addTo(map).bindPopup("Départ");
  L.marker(allLatLng[allLatLng.length-1]).addTo(map).bindPopup("Arrivée");
}

/* ---------------- Main ---------------- */
(function main(){
  const id = getIdFromUrl();
  if (!id){
    document.body.innerHTML = "<p style='padding:20px;'>Fichier introuvable : id manquant.</p>";
    return;
  }
  if (typeof findStoredEvent !== "function"){
    document.body.innerHTML = "<p style='padding:20px;'>Erreur: findStoredEvent() introuvable (storage.js).</p>";
    return;
  }

  const ev = findStoredEvent(id);
  if (!ev){
    document.body.innerHTML = "<p style='padding:20px;'>Fichier introuvable : épreuve non trouvée.</p>";
    return;
  }

  const gpx = ev.gpx || null;
  const pts = gpx?.points || [];
  const segments = gpx?.tech?.segments || [];

  // Bloc 1
  setText("name", ev.name);
  setText("date", ev.date || "—");
  setText("disc", ev.disc || "—");
  setText("level", ev.level || "—");

  setText("distance", formatKm(ev.distanceKm ?? gpx?.distanceKm));
  setText("dplus", formatM(ev.dplusM ?? gpx?.dplusM));
  const dminus = computeDminus(pts);
  setText("dminus", dminus == null ? "—" : `${dminus} m`);
  setText("elevInfo", gpx?.hasElevation ? "Altitude OK" : "Altitude absente / non exploitable");

  // Bloc 2 scores
  const techScore = gpx?.tech?.techScore;
  const techP75 = gpx?.tech?.techCoeffP75;
  const physScore = gpx?.phys?.score;

  setText("scoreTech", Number.isFinite(Number(techScore)) ? `${techScore}/100` : "—");
  setText("techP75", Number.isFinite(Number(techP75)) ? `${techP75}` : "—");
  setText("techInfo", Array.isArray(segments) && segments.length ? `Segments : ${segments.length}` : "Segments : —");

  setText("scorePhys", Number.isFinite(Number(physScore)) ? `${physScore}/100` : "—");
  setText("physInfo", gpx?.phys ? `IPB≈${gpx.phys.ipbOverall} • Effort=${gpx.phys.effort}` : "—");

  const global = computeGlobalScore(gpx);
  setText("scoreGlobal", global == null ? "—" : `${global}/100`);

  const diff = difficultyFromGlobalScore(global);
  setText("diffLabel", diff.label);
  setText("diffHint", diff.hint);
  const dot = $("diffDot");
  if (dot) dot.style.background = diff.color;

  setText("autoSummary", buildAutoSummary(gpx, global, diff.label));

function applyScoreColor(el, score){
  if (!el) return;
  const s = Number(score);
  const bg = colorFromScore(s);
  el.style.background = bg;
  el.style.color = (s >= 75) ? "#ffffff" : "#ffffff"; // tout en blanc (lisible)
  el.style.border = "1px solid rgba(0,0,0,0.08)";
}
const phys = current.gpx?.phys?.score;          // 0..100
const tech = current.gpx?.tech?.techScore;      // 0..100
const glob = current.gpx?.global?.score;        // 0..100 (ou calcule 0.55/0.45)

const physEl = document.getElementById("scorePhys");
const techEl = document.getElementById("scoreTech");
const globEl = document.getElementById("scoreGlobal");

if (physEl) physEl.textContent = phys ?? "—";
if (techEl) techEl.textContent = tech ?? "—";
if (globEl) globEl.textContent = glob ?? "—";

applyScoreColor(physEl, phys);
applyScoreColor(techEl, tech);
applyScoreColor(globEl, glob);


  // Surface estimate
  const se = gpx?.surfaceEstimate;
  if (se){
    setText("surfaceText", `Route ≈ ${se.roadPct}% • Piste large ≈ ${se.trackPct}% • Single ≈ ${se.singlePct}%`);
    const r=$("barRoad"), t=$("barTrack"), s=$("barSingle");
    if (r) r.style.width = `${se.roadPct}%`;
    if (t) t.style.width = `${se.trackPct}%`;
    if (s) s.style.width = `${se.singlePct}%`;
  } else {
    setText("surfaceText", "—");
  }

  // Bloc 3 profil coloré + carte colorée
  renderElevationProfile(
    $("profileCanvas"),
    $("profileTooltip"),
    $("profileInfo"),
    pts,
    !!gpx?.hasElevation,
    segments
  );

  renderColoredMap($("map"), pts, segments);

  // Bloc 4 infos pratiques
  setText("startPlace", ev.startPlace || "—");
  setText("finishPlace", ev.finishPlace || "—");
  setText("startTime", ev.startTime || "—");
  setText("aidStations", (ev.aidStations != null ? ev.aidStations : "—"));
  setText("mechStations", (ev.mechStations != null ? ev.mechStations : "—"));
  setText("bikeWash", ev.bikeWash ? "Oui" : "Non");
  setText("cutoffTime", ev.cutoffTime || "—");

  const ages = Array.isArray(ev.ageCategories) ? ev.ageCategories : [];
  setText("ageCategories", ages.length ? ages.join(" • ") : "—");
  setText("ageHint", ages.length ? "Catégories cochées à la création." : "—");

  setText("comment", ev.comment || "—");

  // Bloc 5 meeting
  const meetingBlock = $("meetingBlock");
  const meetingId = ev.meetingId || ev.eventGroupId || null;

  if (meetingBlock){
    if (meetingId && typeof findMeeting === "function"){
      const m = findMeeting(meetingId);
      if (m){
        meetingBlock.innerHTML = `
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-weight:900;font-size:18px;">${m.name}</div>
              <div class="muted">${m.date || ""} ${m.location ? "• " + m.location : ""}</div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <a class="linkBtn" href="meeting.html?id=${encodeURIComponent(m.id)}">Voir l’événement</a>
              <a class="linkBtn secondary" href="course.html?meetingId=${encodeURIComponent(m.id)}">+ Créer une autre épreuve</a>
            </div>
          </div>
        `;
      } else {
        meetingBlock.innerHTML = `<div class="muted">Événement introuvable (id=${meetingId}).</div>`;
      }
    } else {
      meetingBlock.innerHTML = `<div class="muted">Cette épreuve n’est rattachée à aucun événement.</div>`;
    }
  }
})();


