// js/meeting-create.js
console.log("[meeting-create] chargé");

(function(){
  function val(id){
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function makeIdFromName(name){
    const base = String(name||"")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/(^-|-$)/g,"");
    return `${base}-${Date.now()}`;
  }
// dans le click:
const meeting = {
  id: makeIdFromName(name),
  name,
  date: val("mDate") || null,
  location: val("mLocation") || null,
  comment: val("mComment") || null,
  raceIds: []
};
addMeeting(meeting);

  const btn = document.getElementById("saveMeetingBtn");
  if (!btn) {
    console.error("[meeting-create] bouton #saveMeetingBtn introuvable");
    return;
  }

  btn.addEventListener("click", () => {
    console.log("[meeting-create] click");

    const name = val("mName");
    if (!name) { alert("⚠️ Le nom de l’événement est obligatoire."); return; }

    if (typeof addMeeting !== "function") {
      alert("Erreur: addMeeting() introuvable. Vérifie js/storage.js et l’ordre des scripts.");
      console.error("[meeting-create] addMeeting undefined");
      return;
    }

    const meeting = {
      id: makeIdFromName(name),
      name,
      date: val("mDate") || null,
      location: val("mLocation") || null,
      comment: val("mComment") || null,
      raceIds: []
    };

    addMeeting(meeting);
    alert("✅ Événement enregistré !");
    window.location.href = `meeting.html?id=${encodeURIComponent(meeting.id)}`;
  });
})();

