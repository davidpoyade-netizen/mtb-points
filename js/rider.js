const riders = window.VTT_DATA.riders;

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const id = qs("id");
const rider = riders.find(r => r.id === id);

const set = (id, text) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};

const photoEl = document.getElementById("photo");
const historyEl = document.getElementById("history");

if (!rider) {
  set("name", "Cycliste introuvable");
  photoEl.style.display = "none";
} else {
  set("name", rider.name);
  set("nat", rider.nat);
  set("team", rider.team);
  set("sex", sexLabel(rider.sex));
  set("birthYear", rider.birthYear ? `Né(e) en ${rider.birthYear}` : "—");
  set("ageCat", uciAgeCategory(rider.birthYear));

  set("score", rider.score);
  set("races", rider.races);

  photoEl.src = rider.photo || "assets/riders/placeholder.jpg";

  // Historique démo
  const demoHistory = [
    { date: "2026-03-10", event: "Roquebrune-sur-Argens – Massif des Maures", score: 133, place: 2 },
    { date: "2026-04-12", event: "Base Nature VTT – Fréjus", score: 120, place: 5 },
  ];

  historyEl.innerHTML = demoHistory.map(h => `
    <tr>
      <td>${h.date}</td>
      <td>${h.event}</td>
      <td>${h.score}</td>
      <td>${h.place}</td>
    </tr>
  `).join("");
}
