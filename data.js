// Dataset V1 local (sera remplacé par une DB/API plus tard)

window.VTT_DATA = {
  events: [
    {
      id: "frejus-base-nature",
      date: "2026-04-12",
      name: "Base Nature VTT – Fréjus",
      disc: "XC",

      // Champs fiche épreuve (organisateur)
      distanceKm: 39.9,
      dplusM: null, // obligatoire plus tard pour score, mais peut être vide en V1
      category: null, // ex: "À partir de Junior (2008 et avant)"
      startPlace: "Base nature de Fréjus",
      finishPlace: "Base nature de Fréjus",
      startTime: null, // "10:15"
      tech5: null, // 1..5
      aidStations: null,
      mechStations: null,
      cutoffTime: null, // "06:00"
      participantsCount: null, // ex: 350
      comment: ""
    },

    {
      id: "roquebrune-maures-32k",
      date: "2026-03-10",
      name: "Roquebrune-sur-Argens – Massif des Maures",
      disc: "XC",
      distanceKm: 32,
      dplusM: 1140,
      category: "À partir de Junior (2008 et avant)",
      startPlace: "Place Perrin, Roquebrune-sur-Argens",
      finishPlace: "Place Perrin, Roquebrune-sur-Argens",
      startTime: "10:15",
      tech5: 5,
      aidStations: 4,
      mechStations: 1,
      cutoffTime: null,
      participantsCount: 250,
      comment: "Terrain très technique. Parking conseillé en périphérie."
    },

    {
      id: "enduro-rocaille",
      date: "2026-05-18",
      name: "Enduro Rocaille",
      disc: "Enduro",
      distanceKm: 25,
      dplusM: 600,
      category: "À partir de Junior (2008 et avant)",
      startPlace: "Station des Alpes",
      finishPlace: "Station des Alpes",
      startTime: "09:30",
      tech5: 4,
      aidStations: 2,
      mechStations: 1,
      cutoffTime: "05:30",
      participantsCount: 180,
      comment: "Spéciales techniques, passages rocheux."
    }
  ],

  riders: [
    {
      id: "dupont-julien",
      name: "Julien DUPONT",
      nat: "FR",
      team: "VTT Limoges",
      sex: "H",
      birthYear: 1988,
      score: 312,
      races: 6,
      photo: "assets/riders/placeholder.jpg"
    },
    {
      id: "martin-paul",
      name: "Paul MARTIN",
      nat: "FR",
      team: "Team X",
      sex: "H",
      birthYear: 1996,
      score: 287,
      races: 5,
      photo: "assets/riders/placeholder.jpg"
    },
    {
      id: "moreau-clara",
      name: "Clara MOREAU",
      nat: "BE",
      team: "Brussels MTB",
      sex: "F",
      birthYear: 2002,
      score: 265,
      races: 4,
      photo: "assets/riders/placeholder.jpg"
    },
    {
      id: "durand-luc",
      name: "Luc DURAND",
      nat: "CH",
      team: "Alps Riders",
      sex: "H",
      birthYear: 1979,
      score: 241,
      races: 4,
      photo: "assets/riders/placeholder.jpg"
    },
    {
      id: "riviere-emma",
      name: "Emma RIVIÈRE",
      nat: "FR",
      team: "OC MTB",
      sex: "F",
      birthYear: 1991,
      score: 228,
      races: 3,
      photo: "assets/riders/placeholder.jpg"
    }
  ]
};
