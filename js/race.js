// js/race.js — Supabase ONLY (no localStorage)
(function () {
  const $ = (id) => document.getElementById(id);
  const getParam = (name) => new URLSearchParams(location.search).get(name);

  const setText = (id, v) => {
    const el = $(id);
    if (!el) return;
    el.textContent = (v === null || v === undefined || v === "") ? "—" : String(v);
  };

  const setHTML = (id, html) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = html ?? "";
  };

  function setStatus(ok, text) {
    setText("statusText", text || "");
    const dot = $("statusDot");
    if (dot) dot.style.background = ok ? "#16a34a" : "#dc2626";
  }

  async function getSupabase() {
    const mod = await import("./supabaseClient.js");
    return mod?.supabase || null;
  }

  async function isAuthed(supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      return !!data?.session;
    } catch {
      return false;
    }
  }

  function extractPoints(row) {
    const pts = row?.gpx?.points || row?.analysis_json?.points || null;
    return Array.isArray(pts) ? pts : null;
  }

  function render(row) {
    setText("raceName", row?.name || "Épreuve");
    setText("raceDate", row?.date || "—");
    setText("raceTime", row?.time || "—");
    setText("raceDisc", row?.disc || "—");
    setText("raceLevel", row?.level || "—");

    setText("raceDistance", row?.distance_km == null ? "—" : `${Number(row.distance_km).toFixed(2)} km`);
    setText("raceDplus", row?.dplus_m == null ? "—" : `${Math.round(Number(row.dplus_m))} m`);

    setText("scorePhysVal", row?.score_phys == null ? "—" : Math.round(Number(row.score_phys)));
    setText("scoreTechVal", row?.score_tech == null ? "—" : Math.round(Number(row.score_tech)));
    setText("scoreGlobalVal", row?.score_global == null ? "—" : Math.round(Number(row.score_global)));

    const meetingId = row?.meeting_id || null;
    const btn = $("btnOpenMeeting");
    if (btn && meetingId) {
      btn.href = `meeting.html?id=${encodeURIComponent(meetingId)}`;
      btn.style.display = "inline-flex";
    }

    const pts = extractPoints(row);
    if (!pts || pts.length < 2) {
      setText("profileInfo", "Profil/carte indisponibles : points GPX non stockés.");
      return;
    }

    // Carte Leaflet
    const mapEl = $("map");
    if (mapEl && window.L) {
      const latlngs = pts
        .map(p => [Number(p.lat), Number(p.lon ?? p.lng)])
        .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo));

      if (latlngs.length >= 2) {
        const map = L.map(mapEl, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap"
        }).addTo(map);
        const poly = L.polyline(latlngs, { weight: 4 }).addTo(map);
        map.fitBounds(poly.getBounds(), { padding: [18, 18] });
      }
    }

    // Profil
    const canvas = $("profileCanvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const eles = pts.map(p => Number(p.ele)).filter(e => Number.isFinite(e));
      if (eles.length < 5) return;

      const minE = Math.min(...eles);
      const maxE = Math.max(...eles);
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const pad = 18;
      const w = W - pad * 2;
      const h = H - pad * 2;
      const span = Math.max(1, maxE - minE);

      ctx.beginPath();
      for (let i = 0; i < eles.length; i++) {
        const x = pad + (i / (eles.length - 1)) * w;
        const y = pad + (1 - (eles[i] - minE) / span) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#16623d";
      ctx.lineWidth = 2;
      ctx.stroke();

      setText("profileInfo", `Altitude: ${Math.round(minE)}–${Math.round(maxE)} m`);
    }
  }

  async function main() {
    const id = getParam("id");
    if (!id) {
      setStatus(false, "ID manquant");
      setHTML("raceName", "Épreuve introuvable");
      return;
    }

    const supabase = await getSupabase();
    if (!supabase) {
      setStatus(false, "Supabase indisponible (import)");
      setHTML("raceName", "Erreur configuration Supabase");
      return;
    }

    const authed = await isAuthed(supabase);

    // NB: les épreuves créées sont is_published=false par défaut.
    let q = supabase.from("races").select("*").eq("id", id);
    if (!authed) q = q.eq("is_published", true);

    const { data, error } = await q.maybeSingle();

    if (error || !data) {
      setStatus(false, authed ? "Introuvable / RLS" : "Non publiée (ou introuvable)");
      setHTML("raceName", "Épreuve introuvable");
      setText("dataSource", authed ? "Supabase (connecté)" : "Supabase (public)");
      return;
    }

    setStatus(true, authed ? "OK (preview)" : "OK");
    setText("dataSource", authed ? "Supabase (connecté)" : "Supabase (public)");
    render(data);
  }

  main();
})();
