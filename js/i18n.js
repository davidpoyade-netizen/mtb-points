const LANG_KEY = "vtt_lang_v1";

const I18N = {
  fr: {
    "nav.home": "Accueil",
    "nav.events": "Épreuves",
    "nav.ranking": "Classement",
    "nav.about": "À propos",

    "about.title": "À propos – VTT Points",
    "about.h1": "À propos",
    "about.what": "C’est quoi VTT Points ?",
    "about.p1": "VTT Points est une plateforme de classement inspirée d’ITRA, adaptée au VTT : les organisateurs publient leurs épreuves, importent les résultats, et les coureurs cumulent des points sur une fenêtre glissante.",
    "about.features": "Fonctionnalités",
    "about.f1": "Épreuves + fiche complète (distance, D+, barrières horaires, ravitos, etc.)",
    "about.f2": "Classements par sexe et catégories d’âge",
    "about.f3": "Support des disciplines (XC, Enduro, DH, Gravel…)",
    "about.f4": "Sous-catégorie Assistance électrique (E-Bike)",

    "course.gpx": "Trace GPX (optionnel)",
    "course.profile": "Profil de la course",
    "course.analyze": "Analyser la trace",
    "course.gpxStats": "Résumé GPX",
    "course.ebike": "Sous-catégorie : Assistance électrique (E-Bike)"
  },
  en: {
    "nav.home": "Home",
    "nav.events": "Events",
    "nav.ranking": "Ranking",
    "nav.about": "About",

    "about.title": "About – VTT Points",
    "about.h1": "About",
    "about.what": "What is VTT Points?",
    "about.p1": "VTT Points is an ITRA-inspired ranking platform adapted to MTB: organizers publish events, import results, and riders accumulate points over a rolling window.",
    "about.features": "Features",
    "about.f1": "Events + full race sheet (distance, elevation, cutoffs, aid stations, etc.)",
    "about.f2": "Rankings by sex and age categories",
    "about.f3": "Discipline support (XC, Enduro, DH, Gravel…)",
    "about.f4": "E-Bike subcategory",

    "course.gpx": "GPX track (optional)",
    "course.profile": "Course profile",
    "course.analyze": "Analyze track",
    "course.gpxStats": "GPX summary",
    "course.ebike": "Subcategory: E-Bike assistance"
  }
};

function getLang() {
  return localStorage.getItem(LANG_KEY) || "fr";
}
function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}
function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) ? I18N[lang][key] : (I18N.fr[key] || key);
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const txt = t(key);
    if (el.tagName.toLowerCase() === "title") document.title = txt;
    else el.textContent = txt;
  });

  // boutons langue si présents
  const fr = document.getElementById("btnFR");
  const en = document.getElementById("btnEN");
  if (fr && en) {
    const lang = getLang();
    fr.classList.toggle("active", lang === "fr");
    en.classList.toggle("active", lang === "en");
  }
}

function bindLangButtons() {
  const fr = document.getElementById("btnFR");
  const en = document.getElementById("btnEN");
  if (fr) fr.addEventListener("click", () => { setLang("fr"); applyI18n(); });
  if (en) en.addEventListener("click", () => { setLang("en"); applyI18n(); });
}
