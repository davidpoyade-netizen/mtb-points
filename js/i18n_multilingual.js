// js/i18n.js - MTB Points Multilingual (5 langues)
// Français, Anglais, Espagnol, Italien, Allemand

const LANG_KEY = "mtb_lang_v2";

const I18N = {
  fr: {
    // Navigation
    "nav.home": "Accueil",
    "nav.events": "Événements",
    "nav.races": "Épreuves",
    "nav.ranking": "Classement",
    "nav.challenge": "Challenge",
    "nav.rules": "Règlement",
    "nav.methodology": "Méthodologie",
    "nav.about": "À propos",
    "nav.contact": "Contact",
    "nav.login": "Connexion",
    "nav.dashboard": "Tableau de bord",

    // About page
    "about.title": "À propos – MTB Points",
    "about.h1": "À propos",
    "about.what": "Qu'est-ce que MTB Points ?",
    "about.p1": "Un système de points pour comparer les performances entre épreuves VTT, en tenant compte de la difficulté réelle des parcours.",
    
    "about.why": "Pourquoi ce projet ?",
    "about.why.text": "Je suis un vététiste licencié en club, passionné de VTT et de compétition. En cross-country, enduro et marathon, j'ai souvent constaté qu'il est difficile de comparer objectivement les performances d'une course à l'autre : les parcours et leurs difficultés varient énormément.",
    
    "about.method": "Une méthode simple à comprendre, robuste sur le terrain",
    "about.method.text": "MTB Points s'inspire du principe des points ITRA (trail) et l'adapte aux spécificités VTT : effort, pente, virages, terrain, technicité. La base provient des données structurées (GPX et cartographie), pour éviter les \"ressentis\".",
    
    "about.scores": "Scores",
    "about.score.phys": "Score Physique",
    "about.score.phys.desc": "représente l'effort physiologique global (distance, D+, pentes) depuis le GPX.",
    "about.score.tech": "Score Technique",
    "about.score.tech.desc": "socle cartographique (OSM) + bonus GPX capé (virages/sinuosité/pentes), pour rester stable.",
    
    "about.points": "Comment sont attribués les points ?",
    "about.points.text": "Chaque épreuve reçoit un score de difficulté, puis les points coureurs dépendent de la performance (temps) et sont cumulés sur une fenêtre glissante de 24 mois. Les classements sont séparés par discipline, âge, sexe et type de vélo (musculaire vs assistance électrique).",
    
    "about.features": "Fonctionnalités",
    "about.f1": "Épreuves + fiche complète (distance, D+, barrières horaires, ravitos…)",
    "about.f2": "Classements par sexe et catégories d'âge",
    "about.f3": "Support des disciplines (XC, Enduro, DH, Gravel…)",
    "about.f4": "Sous-catégorie Assistance électrique (E-Bike)",
    
    "about.landmarks": "Repères",
    "about.window": "Fenêtre",
    "about.window.val": "24 mois glissants (Top N)",
    "about.objective": "Objectif",
    "about.objective.val": "Comparaison équitable entre courses",
    "about.data": "Données",
    "about.data.val": "GPX (effort) + OSM (terrain)",
    "about.rankings": "Classements",
    "about.rankings.val": "Disciplines • Âge • Sexe • Musculaire / E-Bike",
    
    "about.important": "Important",
    "about.important.text": "les classements distinguent systématiquement la pratique musculaire et la pratique à assistance électrique, avec cumuls indépendants.",
    
    // Course/Race
    "course.gpx": "Trace GPX (obligatoire)",
    "course.profile": "Profil de la course",
    "course.analyze": "Analyser la trace",
    "course.gpxStats": "Résumé GPX",
    "course.ebike": "Sous-catégorie : Assistance électrique (E-Bike)",
    "course.distance": "Distance",
    "course.elevation": "Dénivelé positif",
    "course.discipline": "Discipline",
    "course.level": "Niveau",
    "course.participants": "Participants",
    
    // Common
    "common.loading": "Chargement…",
    "common.error": "Erreur",
    "common.success": "Succès",
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.delete": "Supprimer",
    "common.edit": "Modifier",
    "common.create": "Créer",
    "common.search": "Rechercher",
    "common.filter": "Filtrer",
    "common.all": "Tous",
    "common.none": "Aucun",
    "common.yes": "Oui",
    "common.no": "Non",
    
    // Contact
    "contact.title": "Contact",
    "contact.name": "Nom",
    "contact.email": "Email",
    "contact.subject": "Sujet",
    "contact.message": "Message",
    "contact.send": "Envoyer le message",
    "contact.success": "Message envoyé. Merci !",
  },

  en: {
    // Navigation
    "nav.home": "Home",
    "nav.events": "Events",
    "nav.races": "Races",
    "nav.ranking": "Ranking",
    "nav.challenge": "Challenge",
    "nav.rules": "Rules",
    "nav.methodology": "Methodology",
    "nav.about": "About",
    "nav.contact": "Contact",
    "nav.login": "Login",
    "nav.dashboard": "Dashboard",

    // About page
    "about.title": "About – MTB Points",
    "about.h1": "About",
    "about.what": "What is MTB Points?",
    "about.p1": "A points system to compare performances between MTB events, taking into account the real difficulty of the courses.",
    
    "about.why": "Why this project?",
    "about.why.text": "I'm a licensed mountain biker passionate about MTB and competition. In cross-country, enduro and marathon, I've often noticed how difficult it is to objectively compare performances from one race to another: courses and their difficulties vary enormously.",
    
    "about.method": "A simple to understand, robust method",
    "about.method.text": "MTB Points is inspired by the ITRA points principle (trail) and adapts it to MTB specificities: effort, slope, turns, terrain, technicality. The foundation comes from structured data (GPX and mapping), to avoid subjective feelings.",
    
    "about.scores": "Scores",
    "about.score.phys": "Physical Score",
    "about.score.phys.desc": "represents overall physiological effort (distance, elevation gain, slopes) from GPX.",
    "about.score.tech": "Technical Score",
    "about.score.tech.desc": "cartographic base (OSM) + capped GPX bonus (turns/sinuosity/slopes), to remain stable.",
    
    "about.points": "How are points awarded?",
    "about.points.text": "Each race receives a difficulty score, then rider points depend on performance (time) and are accumulated over a rolling 24-month window. Rankings are separated by discipline, age, sex, and bike type (regular vs electric assist).",
    
    "about.features": "Features",
    "about.f1": "Races + complete details (distance, elevation, time cutoffs, aid stations…)",
    "about.f2": "Rankings by sex and age categories",
    "about.f3": "Discipline support (XC, Enduro, DH, Gravel…)",
    "about.f4": "Electric Assist subcategory (E-Bike)",
    
    "about.landmarks": "Key Points",
    "about.window": "Window",
    "about.window.val": "24-month rolling (Top N)",
    "about.objective": "Objective",
    "about.objective.val": "Fair comparison between races",
    "about.data": "Data",
    "about.data.val": "GPX (effort) + OSM (terrain)",
    "about.rankings": "Rankings",
    "about.rankings.val": "Disciplines • Age • Sex • Regular / E-Bike",
    
    "about.important": "Important",
    "about.important.text": "rankings systematically distinguish between regular practice and electric assist practice, with independent accumulations.",
    
    // Course/Race
    "course.gpx": "GPX track (required)",
    "course.profile": "Course profile",
    "course.analyze": "Analyze track",
    "course.gpxStats": "GPX summary",
    "course.ebike": "Subcategory: Electric Assist (E-Bike)",
    "course.distance": "Distance",
    "course.elevation": "Elevation gain",
    "course.discipline": "Discipline",
    "course.level": "Level",
    "course.participants": "Participants",
    
    // Common
    "common.loading": "Loading…",
    "common.error": "Error",
    "common.success": "Success",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.create": "Create",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.all": "All",
    "common.none": "None",
    "common.yes": "Yes",
    "common.no": "No",
    
    // Contact
    "contact.title": "Contact",
    "contact.name": "Name",
    "contact.email": "Email",
    "contact.subject": "Subject",
    "contact.message": "Message",
    "contact.send": "Send message",
    "contact.success": "Message sent. Thank you!",
  },

  es: {
    // Navigation
    "nav.home": "Inicio",
    "nav.events": "Eventos",
    "nav.races": "Pruebas",
    "nav.ranking": "Clasificación",
    "nav.challenge": "Desafío",
    "nav.rules": "Reglamento",
    "nav.methodology": "Metodología",
    "nav.about": "Acerca de",
    "nav.contact": "Contacto",
    "nav.login": "Iniciar sesión",
    "nav.dashboard": "Panel",

    // About page
    "about.title": "Acerca de – MTB Points",
    "about.h1": "Acerca de",
    "about.what": "¿Qué es MTB Points?",
    "about.p1": "Un sistema de puntos para comparar rendimientos entre pruebas de MTB, teniendo en cuenta la dificultad real de los recorridos.",
    
    "about.why": "¿Por qué este proyecto?",
    "about.why.text": "Soy un ciclista de montaña licenciado apasionado por el MTB y la competición. En cross-country, enduro y maratón, he notado a menudo lo difícil que es comparar objetivamente los rendimientos de una carrera a otra: los recorridos y sus dificultades varían enormemente.",
    
    "about.method": "Un método simple de entender, robusto en el terreno",
    "about.method.text": "MTB Points se inspira en el principio de puntos ITRA (trail) y lo adapta a las especificidades del MTB: esfuerzo, pendiente, curvas, terreno, tecnicidad. La base proviene de datos estructurados (GPX y cartografía), para evitar las \"sensaciones\".",
    
    "about.scores": "Puntuaciones",
    "about.score.phys": "Puntuación Física",
    "about.score.phys.desc": "representa el esfuerzo fisiológico global (distancia, desnivel positivo, pendientes) del GPX.",
    "about.score.tech": "Puntuación Técnica",
    "about.score.tech.desc": "base cartográfica (OSM) + bonificación GPX limitada (curvas/sinuosidad/pendientes), para mantener estabilidad.",
    
    "about.points": "¿Cómo se asignan los puntos?",
    "about.points.text": "Cada prueba recibe una puntuación de dificultad, luego los puntos de los corredores dependen del rendimiento (tiempo) y se acumulan en una ventana móvil de 24 meses. Las clasificaciones están separadas por disciplina, edad, sexo y tipo de bicicleta (muscular vs asistencia eléctrica).",
    
    "about.features": "Características",
    "about.f1": "Pruebas + ficha completa (distancia, desnivel, límites horarios, avituallamientos…)",
    "about.f2": "Clasificaciones por sexo y categorías de edad",
    "about.f3": "Soporte de disciplinas (XC, Enduro, DH, Gravel…)",
    "about.f4": "Subcategoría Asistencia eléctrica (E-Bike)",
    
    "about.landmarks": "Puntos de referencia",
    "about.window": "Ventana",
    "about.window.val": "24 meses móviles (Top N)",
    "about.objective": "Objetivo",
    "about.objective.val": "Comparación equitativa entre carreras",
    "about.data": "Datos",
    "about.data.val": "GPX (esfuerzo) + OSM (terreno)",
    "about.rankings": "Clasificaciones",
    "about.rankings.val": "Disciplinas • Edad • Sexo • Muscular / E-Bike",
    
    "about.important": "Importante",
    "about.important.text": "las clasificaciones distinguen sistemáticamente la práctica muscular y la práctica con asistencia eléctrica, con acumulaciones independientes.",
    
    // Course/Race
    "course.gpx": "Track GPX (obligatorio)",
    "course.profile": "Perfil de la carrera",
    "course.analyze": "Analizar track",
    "course.gpxStats": "Resumen GPX",
    "course.ebike": "Subcategoría: Asistencia eléctrica (E-Bike)",
    "course.distance": "Distancia",
    "course.elevation": "Desnivel positivo",
    "course.discipline": "Disciplina",
    "course.level": "Nivel",
    "course.participants": "Participantes",
    
    // Common
    "common.loading": "Cargando…",
    "common.error": "Error",
    "common.success": "Éxito",
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.create": "Crear",
    "common.search": "Buscar",
    "common.filter": "Filtrar",
    "common.all": "Todos",
    "common.none": "Ninguno",
    "common.yes": "Sí",
    "common.no": "No",
    
    // Contact
    "contact.title": "Contacto",
    "contact.name": "Nombre",
    "contact.email": "Email",
    "contact.subject": "Asunto",
    "contact.message": "Mensaje",
    "contact.send": "Enviar mensaje",
    "contact.success": "Mensaje enviado. ¡Gracias!",
  },

  it: {
    // Navigation
    "nav.home": "Home",
    "nav.events": "Eventi",
    "nav.races": "Gare",
    "nav.ranking": "Classifica",
    "nav.challenge": "Sfida",
    "nav.rules": "Regolamento",
    "nav.methodology": "Metodologia",
    "nav.about": "Info",
    "nav.contact": "Contatto",
    "nav.login": "Accedi",
    "nav.dashboard": "Dashboard",

    // About page
    "about.title": "Info – MTB Points",
    "about.h1": "Info",
    "about.what": "Cos'è MTB Points?",
    "about.p1": "Un sistema di punti per confrontare le prestazioni tra gare MTB, tenendo conto della difficoltà reale dei percorsi.",
    
    "about.why": "Perché questo progetto?",
    "about.why.text": "Sono un mountain biker tesserato appassionato di MTB e competizione. Nel cross-country, enduro e maratona, ho spesso notato quanto sia difficile confrontare oggettivamente le prestazioni da una gara all'altra: i percorsi e le loro difficoltà variano enormemente.",
    
    "about.method": "Un metodo semplice da capire, robusto sul campo",
    "about.method.text": "MTB Points si ispira al principio dei punti ITRA (trail) e lo adatta alle specificità MTB: sforzo, pendenza, curve, terreno, tecnicità. La base deriva da dati strutturati (GPX e cartografia), per evitare le \"sensazioni\".",
    
    "about.scores": "Punteggi",
    "about.score.phys": "Punteggio Fisico",
    "about.score.phys.desc": "rappresenta lo sforzo fisiologico globale (distanza, dislivello positivo, pendenze) dal GPX.",
    "about.score.tech": "Punteggio Tecnico",
    "about.score.tech.desc": "base cartografica (OSM) + bonus GPX limitato (curve/sinuosità/pendenze), per rimanere stabile.",
    
    "about.points": "Come vengono assegnati i punti?",
    "about.points.text": "Ogni gara riceve un punteggio di difficoltà, poi i punti dei corridori dipendono dalla prestazione (tempo) e vengono accumulati in una finestra mobile di 24 mesi. Le classifiche sono separate per disciplina, età, sesso e tipo di bici (muscolare vs assistenza elettrica).",
    
    "about.features": "Funzionalità",
    "about.f1": "Gare + scheda completa (distanza, dislivello, limiti orari, ristori…)",
    "about.f2": "Classifiche per sesso e categorie di età",
    "about.f3": "Supporto discipline (XC, Enduro, DH, Gravel…)",
    "about.f4": "Sottocategoria Assistenza elettrica (E-Bike)",
    
    "about.landmarks": "Riferimenti",
    "about.window": "Finestra",
    "about.window.val": "24 mesi mobili (Top N)",
    "about.objective": "Obiettivo",
    "about.objective.val": "Confronto equo tra gare",
    "about.data": "Dati",
    "about.data.val": "GPX (sforzo) + OSM (terreno)",
    "about.rankings": "Classifiche",
    "about.rankings.val": "Discipline • Età • Sesso • Muscolare / E-Bike",
    
    "about.important": "Importante",
    "about.important.text": "le classifiche distinguono sistematicamente la pratica muscolare e la pratica con assistenza elettrica, con accumuli indipendenti.",
    
    // Course/Race
    "course.gpx": "Traccia GPX (obbligatoria)",
    "course.profile": "Profilo della gara",
    "course.analyze": "Analizza traccia",
    "course.gpxStats": "Riepilogo GPX",
    "course.ebike": "Sottocategoria: Assistenza elettrica (E-Bike)",
    "course.distance": "Distanza",
    "course.elevation": "Dislivello positivo",
    "course.discipline": "Disciplina",
    "course.level": "Livello",
    "course.participants": "Partecipanti",
    
    // Common
    "common.loading": "Caricamento…",
    "common.error": "Errore",
    "common.success": "Successo",
    "common.save": "Salva",
    "common.cancel": "Annulla",
    "common.delete": "Elimina",
    "common.edit": "Modifica",
    "common.create": "Crea",
    "common.search": "Cerca",
    "common.filter": "Filtra",
    "common.all": "Tutti",
    "common.none": "Nessuno",
    "common.yes": "Sì",
    "common.no": "No",
    
    // Contact
    "contact.title": "Contatto",
    "contact.name": "Nome",
    "contact.email": "Email",
    "contact.subject": "Oggetto",
    "contact.message": "Messaggio",
    "contact.send": "Invia messaggio",
    "contact.success": "Messaggio inviato. Grazie!",
  },

  de: {
    // Navigation
    "nav.home": "Startseite",
    "nav.events": "Veranstaltungen",
    "nav.races": "Rennen",
    "nav.ranking": "Rangliste",
    "nav.challenge": "Challenge",
    "nav.rules": "Reglement",
    "nav.methodology": "Methodik",
    "nav.about": "Über uns",
    "nav.contact": "Kontakt",
    "nav.login": "Anmelden",
    "nav.dashboard": "Dashboard",

    // About page
    "about.title": "Über uns – MTB Points",
    "about.h1": "Über uns",
    "about.what": "Was ist MTB Points?",
    "about.p1": "Ein Punktesystem zum Vergleich von Leistungen zwischen MTB-Veranstaltungen unter Berücksichtigung der tatsächlichen Schwierigkeit der Strecken.",
    
    "about.why": "Warum dieses Projekt?",
    "about.why.text": "Ich bin ein lizenzierter Mountainbiker mit Leidenschaft für MTB und Wettkampf. Beim Cross-Country, Enduro und Marathon habe ich oft festgestellt, wie schwierig es ist, Leistungen von einem Rennen zum anderen objektiv zu vergleichen: Strecken und ihre Schwierigkeiten variieren enorm.",
    
    "about.method": "Eine einfach zu verstehende, robuste Methode",
    "about.method.text": "MTB Points orientiert sich am ITRA-Punkteprinzip (Trail) und passt es an MTB-Spezifika an: Anstrengung, Steigung, Kurven, Gelände, Technik. Die Grundlage stammt aus strukturierten Daten (GPX und Kartierung), um \"Gefühle\" zu vermeiden.",
    
    "about.scores": "Bewertungen",
    "about.score.phys": "Physische Bewertung",
    "about.score.phys.desc": "repräsentiert die gesamte physiologische Anstrengung (Distanz, Höhenmeter, Steigungen) aus dem GPX.",
    "about.score.tech": "Technische Bewertung",
    "about.score.tech.desc": "kartografische Basis (OSM) + begrenzter GPX-Bonus (Kurven/Kurvigkeit/Steigungen), um stabil zu bleiben.",
    
    "about.points": "Wie werden Punkte vergeben?",
    "about.points.text": "Jedes Rennen erhält eine Schwierigkeitsbewertung, dann hängen die Fahrerpunkte von der Leistung (Zeit) ab und werden über ein gleitendes 24-Monats-Fenster akkumuliert. Die Ranglisten sind nach Disziplin, Alter, Geschlecht und Fahrradtyp (muskulär vs. elektrische Unterstützung) getrennt.",
    
    "about.features": "Funktionen",
    "about.f1": "Rennen + vollständiges Datenblatt (Distanz, Höhenmeter, Zeitlimits, Verpflegungsstationen…)",
    "about.f2": "Ranglisten nach Geschlecht und Alterskategorien",
    "about.f3": "Disziplin-Unterstützung (XC, Enduro, DH, Gravel…)",
    "about.f4": "Unterkategorie Elektrische Unterstützung (E-Bike)",
    
    "about.landmarks": "Referenzpunkte",
    "about.window": "Fenster",
    "about.window.val": "24 Monate gleitend (Top N)",
    "about.objective": "Ziel",
    "about.objective.val": "Fairer Vergleich zwischen Rennen",
    "about.data": "Daten",
    "about.data.val": "GPX (Anstrengung) + OSM (Gelände)",
    "about.rankings": "Ranglisten",
    "about.rankings.val": "Disziplinen • Alter • Geschlecht • Muskulär / E-Bike",
    
    "about.important": "Wichtig",
    "about.important.text": "Die Ranglisten unterscheiden systematisch zwischen muskulärer Praxis und Praxis mit elektrischer Unterstützung, mit unabhängigen Akkumulationen.",
    
    // Course/Race
    "course.gpx": "GPX-Track (erforderlich)",
    "course.profile": "Rennprofil",
    "course.analyze": "Track analysieren",
    "course.gpxStats": "GPX-Zusammenfassung",
    "course.ebike": "Unterkategorie: Elektrische Unterstützung (E-Bike)",
    "course.distance": "Distanz",
    "course.elevation": "Höhenmeter",
    "course.discipline": "Disziplin",
    "course.level": "Niveau",
    "course.participants": "Teilnehmer",
    
    // Common
    "common.loading": "Laden…",
    "common.error": "Fehler",
    "common.success": "Erfolg",
    "common.save": "Speichern",
    "common.cancel": "Abbrechen",
    "common.delete": "Löschen",
    "common.edit": "Bearbeiten",
    "common.create": "Erstellen",
    "common.search": "Suchen",
    "common.filter": "Filtern",
    "common.all": "Alle",
    "common.none": "Keine",
    "common.yes": "Ja",
    "common.no": "Nein",
    
    // Contact
    "contact.title": "Kontakt",
    "contact.name": "Name",
    "contact.email": "E-Mail",
    "contact.subject": "Betreff",
    "contact.message": "Nachricht",
    "contact.send": "Nachricht senden",
    "contact.success": "Nachricht gesendet. Danke!",
  }
};

// Langue disponibles
const AVAILABLE_LANGS = ["fr", "en", "es", "it", "de"];
const LANG_NAMES = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  de: "Deutsch"
};

function getLang() {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored && AVAILABLE_LANGS.includes(stored)) return stored;
  
  // Détection automatique depuis le navigateur
  const browserLang = navigator.language.substring(0, 2);
  if (AVAILABLE_LANGS.includes(browserLang)) return browserLang;
  
  return "fr"; // Par défaut français
}

function setLang(lang) {
  if (!AVAILABLE_LANGS.includes(lang)) lang = "fr";
  localStorage.setItem(LANG_KEY, lang);
}

function t(key, lang = null) {
  const currentLang = lang || getLang();
  const translations = I18N[currentLang] || I18N.fr;
  return translations[key] || I18N.fr[key] || key;
}

function applyI18n() {
  const lang = getLang();
  
  // Appliquer les traductions sur les éléments avec data-i18n
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const txt = t(key);
    
    if (el.tagName.toLowerCase() === "title") {
      document.title = txt;
    } else if (el.hasAttribute("placeholder")) {
      el.placeholder = txt;
    } else {
      el.textContent = txt;
    }
  });

  // Mettre à jour les boutons de langue actifs
  AVAILABLE_LANGS.forEach(l => {
    const btn = document.getElementById(`btn${l.toUpperCase()}`);
    if (btn) {
      btn.classList.toggle("active", l === lang);
    }
  });
}

function bindLangButtons() {
  AVAILABLE_LANGS.forEach(lang => {
    const btn = document.getElementById(`btn${lang.toUpperCase()}`);
    if (btn) {
      btn.addEventListener("click", () => {
        setLang(lang);
        applyI18n();
      });
    }
  });
}

// Export pour utilisation dans d'autres scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getLang, setLang, t, applyI18n, bindLangButtons, AVAILABLE_LANGS, LANG_NAMES };
}
