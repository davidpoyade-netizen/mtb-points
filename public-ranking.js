const riders = window.VTT_DATA.riders;

const tbody = document.getElementById("tbody");
const search = document.getElementById("search");
const sexSel = document.getElementById("sex");
const ageSel = document.getElementById("agecat");
const countLine = document.getElementById("countLine");
const whoami = document.getElementById("whoami");

const user = authGet();
whoami.textContent = user ? `${user.name} (${user.role})` : "Non connecté";

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function render() {
  const q = normalize(search.value.trim());
  const sex = sexSel.value;
  const ageFilter = ageSel.value;

  const filtered = riders
    .map(r => ({
      ...r,
      ageCat: uciAgeCategory(r.birthYear)
    }))
    .filter(r => {
      const okName = normalize(r.name).includes(q);
      const okSex = !sex || r.sex === sex;
      const okAge =
        !ageFilter ||
        (ageFilter === "Master" ? String(r.ageCat).startsWith("Master") : r.ageCat === ageFilter);
      return okName && okSex && okAge;
    })
    .slice()
    .sort((a, b) => b.score - a.score);

  tbody.innerHTML = filtered.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><a href="rider.html?id=${encodeURIComponent(r.id)}">${escapeHTML(r.name)}</a></td>
      <td>${escapeHTML(sexLabel(r.sex))}</td>
      <td>${escapeHTML(r.ageCat)}</td>
      <td>${escapeHTML(r.nat)}</td>
      <td>${escapeHTML(r.team)}</td>
      <td><strong>${r.score}</strong></td>
      <td>${r.races}</td>
    </tr>
  `).join("");

  countLine.textContent = `${filtered.length} cycliste(s)`;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

search.addEventListener("input", render);
sexSel.addEventListener("change", render);
ageSel.addEventListener("change", render);
render();
