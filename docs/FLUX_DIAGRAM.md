```mermaid
flowchart TD
    Start([🚀 Organisateur se connecte]) --> Dashboard[📊 organizer-dashboard.html<br/>TABLEAU DE BORD]
    
    Dashboard -->|Créer événement| Dashboard
    Dashboard -->|Clic sur événement| Meeting[📅 meeting.html?id=xxx<br/>DÉTAIL ÉVÉNEMENT]
    
    Meeting -->|Liste épreuves| Meeting
    Meeting -->|+ Créer épreuve| Create[📝 course-create.html?meetingId=xxx<br/>CRÉATION ÉPREUVE]
    
    Create -->|Import GPX| Analyze[⚡ Analyse automatique<br/>Distance • D+ • Scores]
    Analyze -->|Enregistrer| Race[👁️ race.html?id=xxx<br/>FICHE ÉPREUVE]
    
    Meeting -->|Voir épreuve| Race
    
    Race -->|Importer résultats| Import[📊 import-results.html?raceId=xxx<br/>IMPORT RÉSULTATS]
    
    Import -->|Upload CSV/XLSX| Process[🔄 Traitement<br/>Mapping colonnes]
    Process -->|Validation| Save[💾 Enregistrement<br/>Base de données]
    
    Save --> Ranking[🏆 race-ranking.html?id=xxx<br/>CLASSEMENT PUBLIC]
    Race -->|Voir classement| Ranking
    Meeting -->|Voir classement| Ranking
    
    Ranking -->|4 tableaux| Display[📊 Affichage<br/>H/F × Musculaire/VAE]
    
    style Dashboard fill:#e8f5e9
    style Meeting fill:#fff3e0
    style Create fill:#e3f2fd
    style Race fill:#f3e5f5
    style Import fill:#fce4ec
    style Ranking fill:#c8e6c9
    
    style Analyze fill:#ffecb3
    style Process fill:#ffecb3
    style Save fill:#ffecb3
    style Display fill:#c5e1a5
```

## Légende des couleurs

- 🟢 **Vert clair** : Tableau de bord (point d'entrée)
- 🟠 **Orange** : Gestion événement
- 🔵 **Bleu** : Création épreuve
- 🟣 **Violet** : Détail épreuve
- 🔴 **Rose** : Import résultats
- 🟢 **Vert foncé** : Classement public

## Navigation rapide

| Page | URL | Rôle |
|------|-----|------|
| Tableau de bord | `organizer-dashboard.html` | Point d'entrée organisateur |
| Événement | `meeting.html?id=xxx` | Hub central d'un événement |
| Création épreuve | `course-create.html?meetingId=xxx` | Formulaire + GPX |
| Fiche épreuve | `race.html?id=xxx` | Détails complets |
| Import résultats | `import-results.html?raceId=xxx` | Upload CSV/XLSX |
| Classement | `race-ranking.html?id=xxx` | Vue publique |
