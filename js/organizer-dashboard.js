import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

const whoami = $("whoami");
const msg = $("msg");
const list = $("list");
const empty = $("empty");
const count = $("count");
const q = $("q");

const nameEl = $("name");
const dateEl = $("date");
const locationEl = $("location");
const commentEl = $("comment");
const publishedEl = $("published");

const createBtn = $("createBtn");
const reloadBtn = $("reloadBtn");
const btnLogout = $("btnLogout");

function showMsg(text, kind="warn"){
  if (!msg) return;
  msg.className = `msg ${kind}`;
  msg.textContent = text || "";
  msg.style.display = text ? "block" : "none";
}

function normalize(s){
  return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function slugId(name){
  const base = String(name||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .trim()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"")
    .slice(0,60);
  return `${base || "meeting"}-${Date.now()}`;
}

async function requireOrganizerOrRedirect(){
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue) throw ue;

  const user = u?.user;
  if (!user) {
    if (whoami) whoami.innerHTML = `<span class="dot err"></span> Non connecté`;
    location.href = "login.html";
    throw new Error("Non connecté");
  }

  const { data: p, error: pe } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (pe) throw pe;

  const role = p?.role || "rider";
  if (whoami) whoami.innerHTML = `<span class="dot ok"></span> ${esc(user.email)} • ${esc(role)}`;

  if (btnLogout) btnLogout.style.display = "inline-flex";

  if (!(role === "organizer" || role === "admin")) {
    showMsg("Accès réservé aux organisateurs.", "err");
    setTimeout(() => location.href = "login.html", 800);
    throw new Error("Accès refusé");
  }

  return { user, role };
}

if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try { await supabase.auth.signOut(); } catch(_){}
    location.href = "login.html";
  });
}

let meetings = [];

async function loadMeetings(){
  const { user } = await requireOrganizerOrRedirect();
  showMsg("Chargement…", "warn");

  const { data, error } = await supabase
    .from("meetings")
    .select("id,name,date,location,comment,is_published,race_ids,created_at")
    .eq("organizer_id", user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  meetings = data || [];
  showMsg("", "warn");
  applyFilter();
}

function render(items){
  if (count) count.textContent = String(items.length);

  if (!items.length) {
    if (list) list.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  if (!list) return;

  list.innerHTML = items.map(m => {
    const n = Array.isArray(m.race_ids) ? m.race_ids.length : 0;
    const pub = m.is_published ? "✅ Publié" : "🕒 Brouillon";
    return `
      <div class="item">
        <div class="topline">
          <div>
            <div class="title">${esc(m.name)}</div>
            <div class="meta">📅 ${esc(m.date || "—")} • 📍 ${esc(m.location || "—")} • ${pub}</div>
          </div>
          <span class="badge">🏁 ${n} épreuve${n>1?"s":""}</span>
        </div>

        ${m.comment ? `<div class="meta" style="margin-top:10px;color:#334155;border-top:1px dashed #e5e7eb;padding-top:10px">${esc(m.comment)}</div>` : ``}

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <a class="btn" href="organizer-meeting.html?id=${encodeURIComponent(m.id)}">Ouvrir</a>
          <a class="btn primary" href="course-create.html?meetingId=${encodeURIComponent(m.id)}">+ Ajouter une épreuve</a>
        </div>
      </div>
    `;
  }).join("");
}

function applyFilter(){
  const qq = normalize(q?.value || "");
  let items = meetings.slice();
  if (qq) items = items.filter(m => normalize([m.name, m.location, m.comment].join(" ")).includes(qq));
  render(items);
}

if (q) q.addEventListener("input", applyFilter);

if (createBtn) {
  createBtn.addEventListener("click", async () => {
    try{
      const { user } = await requireOrganizerOrRedirect();
      const name = (nameEl?.value || "").trim();
      if (!name) throw new Error("Nom obligatoire.");

      const payload = {
        id: slugId(name),
        organizer_id: user.id,
        name,
        date: dateEl?.value || null,
        location: (locationEl?.value || "").trim() || null,
        comment: (commentEl?.value || "").trim() || null,
        race_ids: [],
        is_published: !!publishedEl?.checked
      };

      showMsg("Création…", "warn");
      const { error } = await supabase.from("meetings").insert(payload);
      if (error) throw error;

      showMsg("Événement créé ✅", "ok");
      if (nameEl) nameEl.value = "";
      if (dateEl) dateEl.value = "";
      if (locationEl) locationEl.value = "";
      if (commentEl) commentEl.value = "";
      if (publishedEl) publishedEl.checked = false;

      await loadMeetings();
    } catch(e){
      showMsg(`Erreur: ${e?.message || e}`, "err");
    }
  });
}

if (reloadBtn) {
  reloadBtn.addEventListener("click", () => loadMeetings().catch(e => showMsg(`Erreur: ${e?.message || e}`, "err")));
}

// Boot
loadMeetings().catch(e => showMsg(`Erreur: ${e?.message || e}`, "err"));
