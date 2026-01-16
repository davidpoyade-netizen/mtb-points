# MTB POINTS - Technical Documentation

**Version:** 1.0  
**Date:** January 2026  
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [User Roles and Access Control](#user-roles-and-access-control)
4. [Page Inventory and Functions](#page-inventory-and-functions)
5. [Scoring System](#scoring-system)
6. [GPX File Integration](#gpx-file-integration)
7. [Multi-Category and E-Bike Support](#multi-category-and-e-bike-support)
8. [Data Management](#data-management)
9. [Internationalization](#internationalization)
10. [User Interface and Experience](#user-interface-and-experience)
11. [Security and Authentication](#security-and-authentication)
12. [Deployment and Hosting](#deployment-and-hosting)
13. [Testing and Quality Assurance](#testing-and-quality-assurance)
14. [Future Enhancements](#future-enhancements)
15. [Technical Specifications](#technical-specifications)
16. [Appendices](#appendices)

---

## Executive Summary

MTB Points is a comprehensive mountain biking event management and ranking system designed to provide fair and transparent performance comparison across different races and competitions.

### Key Features

- **Scientific scoring system** based on GPX analysis and OpenStreetMap data
- **Support for multiple disciplines** (XC, Enduro, DH, Gravel, Marathon)
- **Separate classifications** for muscular and e-bike categories
- **24-month rolling window** ranking system
- **Multi-role user system** (Admin, Organizer, Rider)
- **Event and race management** with GPX integration
- **Automated results import** from CSV/Excel files
- **Interactive maps and elevation profiles**
- **Multilingual support** (French/English)

### Purpose

The platform addresses the challenge of comparing mountain biking performances across races with varying difficulty levels. By analyzing GPS data and terrain characteristics, MTB Points provides an objective scoring methodology that accounts for distance, elevation, technical difficulty, and race-specific factors.

---

## System Architecture

### Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Supabase (PostgreSQL, Authentication, Storage) |
| **Mapping** | Leaflet.js, OpenStreetMap |
| **GPX Processing** | Custom JavaScript parser with elevation profiling |
| **Data Import** | PapaParse (CSV), SheetJS (Excel) |
| **Storage** | LocalStorage + Supabase PostgreSQL |
| **Hosting** | GitHub Pages (Static Site) |

### Application Structure

The application follows a modular architecture with clear separation of concerns:

#### Core Modules

- **js/data.js** - Data models and validation logic
- **js/storage.js** - LocalStorage abstraction layer
- **js/supabaseClient.js** - Backend API integration
- **js/gpx.js** - GPX file parsing and analysis
- **js/i18n.js** - Internationalization (FR/EN)

#### Page-Specific Modules

- **js/event-detail.js** - Event page logic
- **js/course-create.js** - Race creation workflow
- **js/import-results.js** - Results import processing
- **js/contact.js** - Contact form handling

#### Styling

- **css/style.css** - Main stylesheet with design system
- **css/theme-nature.css** - Nature theme color scheme

### Architecture Patterns

- **Client-side rendering** with vanilla JavaScript
- **RESTful API** communication via Supabase client
- **Progressive enhancement** for core functionality
- **Responsive design** with mobile-first approach
- **Hybrid storage** (LocalStorage + cloud database)

---

## User Roles and Access Control

### Role Hierarchy

| Role | Permissions | Login Page |
|------|------------|------------|
| **Admin** | Full system access, user management, content moderation, role assignment | login-admin.html |
| **Organizer** | Create/edit events, create/edit races, import results, manage own content | login.html |
| **Rider** | View rankings, view own profile, submit contact forms | login-rider.html |
| **Public** | View public rankings, events, races, methodology | No login required |

### Role Details

#### Admin Role
- **Full Access:** All system functions
- **User Management:** Assign roles, manage profiles
- **Content Moderation:** Edit/delete any content
- **Message Management:** View/respond to contact submissions
- **Dashboard:** System-wide analytics and controls

#### Organizer Role
- **Event Creation:** Full event lifecycle management
- **Race Management:** Create races with GPX analysis
- **Results Import:** Upload and process race results
- **Own Content:** Edit/delete own events and races
- **Limited Visibility:** Can only modify own content

#### Rider Role
- **Profile Management:** Update personal information
- **View Rankings:** Access all public rankings
- **Performance Tracking:** View own results and points
- **Contact Forms:** Submit inquiries
- **Read-Only:** Cannot create or modify events/races

#### Public Access
- **View Rankings:** All public leaderboards
- **Browse Events:** Upcoming and past events
- **Race Information:** Detailed race specifications
- **Methodology:** Scoring system documentation
- **No Authentication Required**

---

## Page Inventory and Functions

### Public Pages (No Authentication Required)

| Page | Purpose |
|------|---------|
| **index.html** | Homepage with overview and navigation |
| **about.html** | System explanation, methodology overview, project goals |
| **contact.html** | Contact form for inquiries and support |
| **challengemtbpoints.html** | Challenge ranking system display |
| **course.html** | Individual race detail page (legacy/alternative) |
| **meetings.html** | Public list of all events with filtering and search |
| **events.html** | Race listing filtered by event |
| **event.html** | Detailed race information with GPX visualization and scoring |

### Authentication Pages

| Page | Role | Features |
|------|------|----------|
| **login-admin.html** | Admin | Admin-only login, redirects to dashboard.html |
| **login.html** | Organizer | Sign in/up for event organizers |
| **login-rider.html** | Rider | Athlete registration and login |

### Authenticated Pages - Organizer Role

| Page | Function |
|------|----------|
| **meeting-create.html** | Create new events with dates, location, geolocation support |
| **course-create.html** | Create races with GPX upload, multi-lap support, e-bike configuration |
| **import-results.html** | Import race results from CSV/Excel with automatic category assignment |
| **dashboard.html** | Organizer dashboard with event management overview |
| **meeting.html** | Event detail page with edit capabilities for owner |

### Authenticated Pages - Admin Role

| Page | Function |
|------|----------|
| **admin.html** | User role management, profile administration, moderation tools |
| **admin-messages.html** | Contact message management with read/unread status and filtering |

### Page Relationships

```
index.html (Home)
├── meetings.html (Events List)
│   ├── meeting.html?id=X (Event Detail)
│   │   ├── events.html?meetingId=X (Races in Event)
│   │   │   └── event.html?id=Y (Race Detail)
│   │   └── course-create.html?meetingId=X (Create Race)
│   └── meeting-create.html (Create Event)
├── challengemtbpoints.html (Challenge Rankings)
├── about.html (About)
├── contact.html (Contact Form)
└── login.html / login-admin.html / login-rider.html (Authentication)
    └── dashboard.html (Organizer/Admin Dashboard)
        └── admin.html / admin-messages.html (Admin Tools)
```

---

## Scoring System

### Overview

The MTB Points scoring system calculates race difficulty using objective, data-driven metrics derived from GPS tracks and geographic information. This approach eliminates subjective assessments and provides fair, comparable ratings across different events.

### Score Components

#### 1. Physical Score (ScorePhys)

Represents physiological effort based on:

- **Distance** (kilometers) - Total race length
- **Elevation Gain** (D+ in meters) - Cumulative positive elevation
- **Gradient Variations** - Calculated from GPX trackpoint elevation changes
- **Sustained Climbs** - Length and steepness of continuous ascents

**Calculation Factors:**
- Longer distances increase score
- Higher D+ increases score
- Steeper average gradients increase score
- Formula accounts for non-linear relationship between distance/elevation and difficulty

#### 2. Technical Score (ScoreTech)

Represents technical difficulty based on:

- **OpenStreetMap Terrain Classification**
  - Path surface type (paved, gravel, singletrack, technical)
  - Official trail difficulty ratings when available
  
- **GPX-Derived Metrics (Capped)**
  - Turn frequency and sharpness
  - Course sinuosity (path deviation from straight line)
  - Steep gradient sections (bonus points)
  
- **Terrain Features**
  - Forest paths vs. open terrain
  - Rock gardens and technical sections
  - Man-made obstacles

**Important:** GPX-derived bonuses are capped to prevent gaming the system through artificial course complexity.

#### 3. Global Score

**Formula:** GlobalScore = f(PhysScore, TechScore)

- Typically: PhysScore + TechScore, normalized to 0-100 scale
- Weighted based on discipline (e.g., DH emphasizes TechScore)
- This Global Score becomes the race difficulty rating

**Score Interpretation:**

| Score Range | Difficulty Level | Example |
|-------------|------------------|---------|
| 0-20 | Beginner | Short XC on smooth trails |
| 21-40 | Intermediate | Standard marathon with moderate climbing |
| 41-60 | Advanced | Technical enduro with significant D+ |
| 61-80 | Expert | Challenging ultra marathon or extreme enduro |
| 81-100 | Elite | World-class events (UTMB-level difficulty) |

### Rider Points Calculation

Once a race has its Global Score, rider points are awarded based on:

1. **Race Difficulty** - The Global Score
2. **Finishing Position** - Higher points for better placements
3. **Field Strength** - Adjusted based on competitor quality
4. **Completion Status**
   - **FINISH** - Full points based on position
   - **DNF** (Did Not Finish) - Partial points for attempt
   - **DNS** (Did Not Start) - No points

### Ranking System

**Key Characteristics:**

- **24-month rolling window** for point accumulation
- **Best N results** counted (e.g., best 10 races in 24 months)
- **Separate classifications** by:
  - Discipline (XC, Enduro, DH, Gravel, Marathon)
  - Gender (Male/Female)
  - Age category (Youth, Junior, Elite, Masters, etc.)
  - Bike type (Muscular vs. E-bike)

**Point Decay:**
- Results older than 24 months automatically removed
- Encourages consistent participation
- Prevents "lifetime achievement" rankings

### Disciplines and Scoring Variations

Different disciplines may apply weighting adjustments:

| Discipline | PhysScore Weight | TechScore Weight | Notes |
|-----------|------------------|------------------|-------|
| **XCO** (Cross-Country Olympic) | 55% | 45% | Balanced |
| **XCM** (Marathon) | 65% | 35% | Endurance-focused |
| **Enduro** | 40% | 60% | Technical-focused |
| **DH** (Downhill) | 30% | 70% | Highly technical |
| **Gravel** | 60% | 40% | Endurance with variety |

---

## GPX File Integration

### GPX Processing Workflow

#### Upload Process

1. **Race organizer uploads GPX file** during race creation (course-create.html)
2. **JavaScript parser (js/gpx.js)** extracts trackpoints with coordinates and elevation
3. **Analysis engine calculates:**
   - Total distance (Haversine formula between points)
   - Cumulative elevation gain (D+)
   - Gradient profile (% grade per segment)
   - Turn analysis (direction changes)
   - Sinuosity metrics
4. **Technical score computed** using OSM data overlay
5. **GPX stored** in race record for future reference and visualization

#### Technical Implementation

**File Format:** Standard GPX 1.0/1.1 XML format

```xml
<?xml version="1.0"?>
<gpx version="1.1" creator="Example">
  <trk>
    <trkseg>
      <trkpt lat="45.123456" lon="6.789012">
        <ele>1250.5</ele>
        <time>2024-06-15T09:00:00Z</time>
      </trkpt>
      <!-- More trackpoints -->
    </trkseg>
  </trk>
</gpx>
```

**Parser Features:**
- Handles multiple track segments
- Elevation smoothing to reduce GPS noise
- Distance calculation using geodesic formulas
- Memory-efficient processing of large files

### Analysis Metrics

#### Distance Calculation

- **Method:** Haversine formula for great-circle distance
- **Accuracy:** Within 0.5% of true path distance
- **Units:** Meters, converted to kilometers for display

#### Elevation Processing

- **Raw Data:** GPX `<ele>` tags in meters
- **Smoothing:** Moving average filter (3-point window)
- **D+ Calculation:** Sum of positive elevation changes > threshold (1m)
- **D- Calculation:** Sum of negative elevation changes
- **Max/Min Elevation:** Extremes from smoothed data

#### Gradient Analysis

- **Calculation:** (ΔElevation / ΔDistance) × 100
- **Segments:** Analyzed per 50-100m intervals
- **Categories:**
  - Flat: -3% to +3%
  - Rolling: ±3% to ±8%
  - Moderate: ±8% to ±15%
  - Steep: ±15% to ±25%
  - Extreme: > ±25%

#### Turn and Sinuosity Metrics

- **Turn Detection:** Direction changes > 45° within 20m
- **Sinuosity Ratio:** Actual path length / straight-line distance
- **Capped Contribution:** Maximum bonus to prevent gaming

### Visualization Features

#### Interactive Map (Leaflet.js)

- **Base Layer:** OpenStreetMap tiles
- **Route Overlay:** GPX track rendered as polyline
- **Color Coding:** Gradient-based coloring (green=easy, red=steep)
- **Markers:** Start/finish points, aid stations (if specified)
- **Interactivity:** Zoom, pan, click for segment details

#### Elevation Profile Chart

- **X-axis:** Distance from start (km)
- **Y-axis:** Elevation (meters)
- **Features:**
  - Gradient-shaded background
  - Hover tooltips with precise elevation/distance
  - Steep section highlights
  - Canvas-based rendering for performance

#### Key Metrics Display

Visual KPI panels showing:
- Total distance
- Total D+ and D-
- Maximum/minimum elevation
- Average gradient
- Technical score breakdown

### Export Functionality

#### PDF Generation

The event.html page includes PDF export via browser print:

- **Page Layout:** Optimized A4 format
- **Included Content:**
  - Race name and details
  - Score breakdown
  - Static map snapshot
  - Elevation profile
  - Key statistics table
- **Print Styling:** Dedicated @media print CSS rules
- **File Size:** Typically 200-500 KB

**Usage:** Click "📄 Télécharger PDF" button, browser print dialog opens

---

## Multi-Category and E-Bike Support

### Category Structure

#### Age Categories (UCI Standard)

Age calculated based on birth year and race year (age-on-year system):

**Age = Race Year - Birth Year**

| Category | Age Range | Code |
|----------|-----------|------|
| **Youth** | Under 17 | U17 |
| **Junior** | 17-18 | JUN |
| **Espoir** | 19-22 | ESP |
| **Elite/Senior** | 23-39 | ELI/SEN |
| **Masters 1** | 40-49 | M1 |
| **Masters 2** | 50-59 | M2 |
| **Masters 3** | 60-69 | M3 |
| **Masters 4** | 70+ | M4 |

**Implementation:**
- Automatic category assignment during results import
- Based on birth_year field in CSV/Excel
- Formula: `category = calculateCategory(raceYear - birthYear, sex)`
- Stored in results table for historical accuracy

#### Gender Classification

- **M** (Male / Hommes)
- **F** (Female / Femmes)

**Separate rankings** for each gender within each discipline and age category.

### E-Bike Implementation

#### Design Philosophy

**Principle:** Muscular and e-bike riding are different sports requiring separate classifications.

**Rationale:**
- E-bikes fundamentally change race dynamics (speed, endurance requirements)
- Mixing categories would be unfair to muscular riders
- Separate rankings allow e-bike specific competition

#### Configuration Options

**Option 1: Single Race, Both Bike Types**

- Race marked as "E-bike Open"
- Separate start times optional (e.g., e-bikes start 10 min after muscular)
- Results import file includes bike_type column (MUSCLE/EBIKE)
- Post-processing creates two rankings:
  - Ranking 1: Muscular riders only
  - Ranking 2: E-bike riders only

**Option 2: Separate Races**

- Two distinct race entries for same course
- "XC Marathon - Muscular"
- "XC Marathon - E-bike"
- Completely independent point systems

#### Race Creation Workflow (course-create.html)

**E-bike Toggle:**
```
☐ Ouvert au vélo à assistance électrique (VAE)
```

When enabled:
- Additional "E-bike Start Time" field appears
- Results import will look for bike_type column
- Single GPX track applies to both categories

**Historical Note:** Previous versions duplicated races (Muscular → E-bike copy). Current version uses single race with classification flag for cleaner data management.

### Multi-Lap Races

#### Use Cases

- **Cross-Country (XCO):** Elite men may ride 5-7 laps, elite women 4-5 laps
- **Short Track (XCC):** Varies by category
- **Age/Gender Differentiation:** Younger/older categories may ride fewer laps

#### Configuration (course-create.html)

**Enable Multi-Laps Checkbox:**
```
☑ Activer les tours par catégorie
```

**Configuration Table:**

| Category | Laps (M) | Start Time (M) | Laps (F) | Start Time (F) |
|----------|----------|----------------|----------|----------------|
| Elite | 5 | 14:00 | 4 | 13:30 |
| Espoir | 4 | 12:30 | 3 | 12:00 |
| Junior | 3 | 11:00 | 3 | 10:30 |
| Masters 1 | 4 | 15:00 | 3 | 14:30 |

**Data Storage:**
```javascript
{
  enableMultiLaps: true,
  lapConfig: {
    "Elite": { lapsM: 5, startM: "14:00", lapsF: 4, startF: "13:30" },
    "Espoir": { lapsM: 4, startM: "12:30", lapsF: 3, startF: "12:00" },
    // ...
  }
}
```

**Scoring Adjustments:**
- Total distance = Base lap distance × Number of laps
- D+ multiplied accordingly
- Physical Score scales with lap count
- Technical Score remains constant (course difficulty unchanged)

---

## Data Management

### Storage Architecture

#### Hybrid Storage Approach

The application uses a two-tier storage system for flexibility and performance:

**Tier 1: LocalStorage (Client-Side)**

Used for:
- Draft event and race data during creation
- GPX file storage for offline access and quick visualization
- User preferences (language, UI state)
- Temporary data before Supabase synchronization
- Form state preservation (prevent data loss on refresh)

**Key Naming Convention:**
```javascript
mtb.meetings.v1    // Events list
mtb.races.v1       // Races list
mtb.gpx.<raceId>   // GPX data for specific race
mtb.lang           // Language preference
mtb.draft.meeting  // Draft meeting during creation
```

**Tier 2: Supabase PostgreSQL (Server-Side)**

Primary data store for:
- User accounts and profiles
- Published events and races
- Race results and rankings
- Contact messages
- Audit logs

**Advantages:**
- **LocalStorage:** Fast, offline-capable, no server dependency
- **Supabase:** Persistent, shared, queryable, secure
- **Hybrid:** Best of both worlds, graceful degradation

### Database Schema

#### Key Tables

**profiles**
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('admin', 'organizer', 'rider')),
  full_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**meetings** (Events)
```sql
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  end_date DATE,
  location TEXT,
  geo_lat NUMERIC,
  geo_lng NUMERIC,
  url TEXT,
  comment TEXT,
  organizer_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**races** (Courses/Events)
```sql
CREATE TABLE races (
  id TEXT PRIMARY KEY,
  meeting_id TEXT REFERENCES meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME,
  discipline TEXT,
  level TEXT CHECK (level IN ('Locale', 'Régionale', 'Nationale', 'Internationale')),
  ebike_open BOOLEAN DEFAULT FALSE,
  ebike_start_time TIME,
  sex_allowed TEXT CHECK (sex_allowed IN ('all', 'M', 'F')),
  distance_km NUMERIC,
  dplus_m INTEGER,
  phys_score NUMERIC,
  tech_score NUMERIC,
  global_score NUMERIC,
  gpx_data JSONB,  -- Stored GPX trackpoints
  lap_config JSONB,  -- Multi-lap configuration
  cutoff TEXT,
  feeds INTEGER,
  mechanic_support INTEGER,
  bike_wash TEXT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**results**
```sql
CREATE TABLE results (
  id SERIAL PRIMARY KEY,
  race_id TEXT REFERENCES races(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES profiles(id),
  rank INTEGER,
  name TEXT NOT NULL,
  sex TEXT CHECK (sex IN ('M', 'F')),
  birth_year INTEGER,
  age_category TEXT,
  bike_type TEXT CHECK (bike_type IN ('MUSCLE', 'EBIKE')),
  time INTERVAL,
  status TEXT CHECK (status IN ('FINISH', 'DNF', 'DNS')),
  points NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**contact_messages**
```sql
CREATE TABLE contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Row-Level Security (RLS) Policies

**profiles table:**
- Admins: Full access
- Users: Read own profile, update own profile
- Public: No access

**meetings table:**
- Admins: Full access
- Organizers: Create, read, update own meetings
- Public: Read published meetings

**races table:**
- Admins: Full access
- Organizers: Create/update races in own meetings
- Public: Read published races

**results table:**
- Admins: Full access
- Organizers: Insert results for own races
- Riders: Read own results
- Public: Read all results (anonymized if needed)

**contact_messages table:**
- Admins: Full access
- Authenticated: Create messages
- Public: Create messages (if allowed)

### Results Import System

#### Supported Formats

**CSV (Comma-Separated Values)**
- Standard UTF-8 encoding
- Header row required
- Delimiter: comma, semicolon, or tab (auto-detected)
- Parser: PapaParse library

**Excel (.xlsx, .xls)**
- Microsoft Excel format
- First sheet processed by default
- Header row in row 1
- Parser: SheetJS (xlsx) library

#### Column Mapping

**Automatic Detection:**
The system attempts to auto-map columns based on header names:

| Expected Column | Accepted Headers |
|----------------|------------------|
| Rank | rank, position, place, classement |
| Name | name, nom, rider, athlete |
| Sex | sex, sexe, gender, genre, m/f, h/f |
| Birth Year | birth_year, birthyear, année, year, naissance |
| Time | time, temps, duration, chrono |
| Status | status, statut, result |
| Bike Type | bike, velo, type, ebike, vae |

**Manual Override:**
User can select correct column from dropdowns if auto-detection fails.

#### Processing Pipeline

**Step 1: File Upload**
```javascript
input.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const ext = file.name.split('.').pop().toLowerCase();
  
  if (ext === 'csv') {
    // Parse with PapaParse
  } else if (['xlsx', 'xls'].includes(ext)) {
    // Parse with SheetJS
  }
});
```

**Step 2: Data Validation**
```javascript
rows.forEach(row => {
  // Validate required fields
  if (!row.name) errors.push('Missing name');
  if (!['M', 'F'].includes(row.sex)) errors.push('Invalid sex');
  if (!row.birth_year) errors.push('Missing birth year');
  
  // Validate time format
  if (!isValidTimeFormat(row.time)) errors.push('Invalid time');
  
  // Validate status
  if (!['FINISH', 'DNF', 'DNS'].includes(row.status)) {
    errors.push('Invalid status');
  }
});
```

**Step 3: Category Calculation**
```javascript
function calculateCategory(birthYear, raceYear, sex) {
  const age = raceYear - birthYear;
  
  if (age < 17) return 'U17';
  if (age <= 18) return 'JUN';
  if (age <= 22) return 'ESP';
  if (age <= 39) return sex === 'M' ? 'SEN' : 'ELI';
  if (age <= 49) return 'M1';
  if (age <= 59) return 'M2';
  if (age <= 69) return 'M3';
  return 'M4';
}
```

**Step 4: Preview Table**
Displays processed data with calculated categories for user verification.

**Step 5: Dry-Run vs. Live Import**
- **Dry-Run:** Validates data, shows what would be imported, no database changes
- **Live Import:** Inserts results into Supabase, calculates points

**Step 6: Point Calculation**
```javascript
function calculatePoints(rank, globalScore, totalFinishers) {
  const basePoints = globalScore * 10;  // Scale to larger range
  const positionMultiplier = 1 - ((rank - 1) / totalFinishers);
  return Math.round(basePoints * positionMultiplier);
}
```

#### Error Handling

**Common Issues:**
- Missing required columns → Show mapping interface
- Invalid date formats → Attempt multiple parse strategies
- Duplicate entries → Flag and ask user to resolve
- Encoding problems → Try UTF-8, ISO-8859-1, Windows-1252

**User Feedback:**
- Progress bar during import
- Real-time validation messages
- Summary statistics (X imported, Y errors)
- Download error report CSV

---

## Internationalization (i18n)

### Language Support

**Currently Supported:**
- French (FR) - Primary language
- English (EN) - Secondary language

**Default Language:** French (matches primary user base)

### Implementation

#### Translation File (js/i18n.js)

```javascript
const translations = {
  fr: {
    about: {
      what: "Qu'est-ce que MTB-points ?",
      p1: "Un système de points pour comparer...",
      features: "Fonctionnalités",
      f1: "Épreuves + fiche complète...",
      // ...
    },
    // More sections
  },
  en: {
    about: {
      what: "What is MTB-points?",
      p1: "A points system to compare...",
      features: "Features",
      f1: "Events + complete information...",
      // ...
    },
    // More sections
  }
};
```

#### HTML Markup

Elements to be translated use `data-i18n` attribute:

```html
<h2 data-i18n="about.what">Qu'est-ce que MTB-points ?</h2>
<p data-i18n="about.p1">
  Un système de points pour comparer...
</p>
```

#### Translation Function

```javascript
function applyI18n() {
  const lang = localStorage.getItem('mtb.lang') || 'fr';
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = getNestedProperty(translations[lang], key);
    
    if (text) {
      el.textContent = text;
    }
  });
}
```

#### Language Switching

```html
<div class="lang">
  <button class="btn" id="btnFR" type="button">FR</button>
  <button class="btn" id="btnEN" type="button">EN</button>
</div>
```

```javascript
function bindLangButtons() {
  document.getElementById('btnFR').addEventListener('click', () => {
    localStorage.setItem('mtb.lang', 'fr');
    applyI18n();
  });
  
  document.getElementById('btnEN').addEventListener('click', () => {
    localStorage.setItem('mtb.lang', 'en');
    applyI18n();
  });
}
```

#### Auto-Initialization

```html
<script src="js/i18n.js"></script>
<script>
  if (typeof bindLangButtons === "function") bindLangButtons();
  if (typeof applyI18n === "function") applyI18n();
</script>
```

### Future Language Expansion

**Planned Languages:**
- Italian (IT) - Popular MTB region
- Spanish (ES) - Large MTB community
- German (DE) - Strong MTB culture

**Implementation Steps:**
1. Add translation objects to i18n.js
2. Ensure all UI text has data-i18n attributes
3. Test with native speakers
4. Add language selector in settings

---

## User Interface and Experience

### Design System

#### Theme: Nature

**Philosophy:** Reflect the outdoor, natural environment of mountain biking through colors and aesthetics.

**Color Palette:**

| Element | Color | Hex Code | Usage |
|---------|-------|----------|-------|
| Primary Green | Forest | #2F6F3E | Buttons, accents, brand |
| Primary Dark | Deep Green | #255A31 | Hover states, emphasis |
| Blue | Link Blue | #2563EB | Links, interactive elements |
| Blue Dark | Active Blue | #1D4ED8 | Active states |
| Background | Light Gray | #F4F4F4 | Page background |
| Card | White | #FFFFFF | Content containers |
| Text | Slate | #0F172A | Primary text |
| Muted | Gray | #667085 | Secondary text |
| Border | Light Border | #E5E7EB | Dividers, outlines |

**Typography:**
```css
font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 
             "Helvetica Neue", Arial, sans-serif;
```
- System fonts for performance and native feel
- Scalable sizes (responsive)
- Font weights: 400 (regular), 700 (bold), 900-1100 (emphasis)

#### Component Library

**Pills/Chips**
```html
<span class="pill">
  <span class="dot ok"></span> 
  Status Text
</span>
```
- Used for status indicators, tags, filters
- Rounded edges (border-radius: 999px)
- Dot indicators for state (ok, error, warning)

**Cards**
```html
<div class="card">
  <section class="hero">
    <!-- Gradient hero section -->
  </section>
  <!-- Content -->
</div>
```
- White background with subtle shadow
- Rounded corners (18-22px border-radius)
- Gradient hero sections with radial overlays

**KPI Panels**
```html
<div class="kpi">
  <div class="kpiLabel">Distance</div>
  <div class="kpiValue">42.5<span class="muted"> km</span></div>
  <div class="kpiSub">+1,250m D+</div>
</div>
```
- Display key metrics
- Large value with small label and subtitle
- Grid layout for multiple KPIs

**Buttons**
```html
<button class="btn primary">Primary Action</button>
<button class="btn">Secondary Action</button>
<button class="btn ghost">Tertiary Action</button>
```
- Consistent padding and border-radius
- Hover effects (lift + shadow)
- Color variants: primary, secondary, ghost, danger

**Forms**
```html
<label for="input">Field Label</label>
<input id="input" class="inp" type="text" placeholder="..." />
```
- Clear labels above inputs
- Consistent spacing (margin-top: 6px)
- Rounded inputs (12px border-radius)
- Focus states with outline

### Responsive Design

#### Breakpoints

| Breakpoint | Width | Target Devices |
|------------|-------|----------------|
| Mobile | < 720px | Smartphones |
| Tablet | 720px - 900px | Small tablets |
| Laptop | 900px - 1100px | Laptops, large tablets |
| Desktop | > 1100px | Desktop monitors |

#### Mobile-First Approach

Base styles target mobile, enhanced for larger screens:

```css
/* Mobile base */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

/* Tablet and up */
@media (min-width: 720px) {
  .grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* Desktop */
@media (min-width: 1100px) {
  .grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
}
```

#### Touch-Friendly Interactions

- Minimum button size: 44×44px (Apple/Material guidelines)
- Adequate spacing between clickable elements
- Large tap targets for critical actions
- Swipe-friendly lists on mobile

#### Adaptive Layouts

**Navigation:**
- Desktop: Horizontal navigation bar
- Mobile: Wraps to multi-row or hamburger menu (if implemented)

**Tables:**
- Desktop: Full table display
- Mobile: Horizontal scroll or card-based layout

**Maps:**
- Desktop: Large interactive map
- Mobile: Full-width, touch-optimized controls

---

## Security and Authentication

### Authentication Flow

#### Supabase Auth Integration

**Sign Up Process:**
1. User enters email and password
2. Supabase creates auth.users entry
3. Trigger creates corresponding profiles entry with default role
4. Confirmation email sent (if enabled)
5. User confirms email
6. User can sign in

**Sign In Process:**
1. User enters credentials on role-specific login page
2. Supabase validates credentials
3. JWT token issued (stored in localStorage/cookies)
4. Session established
5. Role verification from profiles table
6. Redirect to appropriate dashboard

**Session Management:**
- JWT tokens auto-refresh
- Session persists across page reloads
- Logout clears all tokens
- onAuthStateChange listeners update UI

#### Role Verification

```javascript
async function requireAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  
  if (profile.role !== "admin") {
    await supabase.auth.signOut();
    throw new Error("Access denied");
  }
  
  return { user, profile };
}
```

Similar guards exist for `requireOrganizer()` and `requireRider()`.

### Row-Level Security (RLS)

#### Concept

Supabase PostgreSQL RLS policies enforce data access rules at the database level, independent of application code.

**Benefits:**
- Cannot be bypassed via API
- Consistent across all clients
- Simpler application code
- Defense in depth

#### Example Policies

**meetings table:**

```sql
-- Public can read published meetings
CREATE POLICY "Public read access" ON meetings
  FOR SELECT
  USING (true);

-- Organizers can insert meetings
CREATE POLICY "Organizers can insert" ON meetings
  FOR INSERT
  WITH CHECK (auth.uid() IN (
    SELECT id FROM profiles WHERE role IN ('organizer', 'admin')
  ));

-- Users can update own meetings
CREATE POLICY "Users update own meetings" ON meetings
  FOR UPDATE
  USING (organizer_id = auth.uid());

-- Admins can delete any meeting
CREATE POLICY "Admins delete all" ON meetings
  FOR DELETE
  USING (auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  ));
```

**results table:**

```sql
-- Anyone can read results
CREATE POLICY "Public read results" ON results
  FOR SELECT
  USING (true);

-- Only organizers/admins can insert results
CREATE POLICY "Organizers insert results" ON results
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM races r
      JOIN meetings m ON r.meeting_id = m.id
      WHERE r.id = race_id
        AND (m.organizer_id = auth.uid() OR auth.uid() IN (
          SELECT id FROM profiles WHERE role = 'admin'
        ))
    )
  );
```

### Data Protection

**Personal Information:**
- Email addresses only visible to admin and self
- Birth years stored for age calculation, not full birthdate
- Contact messages accessible only by admin
- No public display of phone numbers or addresses

**GDPR Compliance Considerations:**
- Right to access: Users can view own data
- Right to deletion: Admin can delete user accounts
- Data minimization: Only essential data collected
- Consent: Contact form includes consent checkbox

**Best Practices:**
- Never log passwords or sensitive data
- Use HTTPS for all connections
- Sanitize all user input
- Escape output to prevent XSS
- Validate file uploads

---

## Deployment and Hosting

### GitHub Pages Configuration

#### Repository Structure

```
repo/
├── index.html
├── about.html
├── contact.html
├── (other HTML files)
├── css/
│   ├── style.css
│   └── theme-nature.css
├── js/
│   ├── data.js
│   ├── storage.js
│   ├── supabaseClient.js
│   └── (other JS files)
├── img/
│   └── (image assets)
├── README.md
└── .nojekyll  # Important for GitHub Pages
```

#### .nojekyll File

Create empty `.nojekyll` file in root to prevent Jekyll processing:

```bash
touch .nojekyll
```

This ensures files starting with underscore aren't ignored.

#### GitHub Pages Settings

1. Go to repository Settings
2. Navigate to "Pages" section
3. Source: Deploy from branch
4. Branch: `main` or `gh-pages`
5. Folder: `/ (root)` or `/docs` (if files in docs/)
6. Save

**Custom Domain (Optional):**
- Add CNAME file with domain name
- Configure DNS A/CNAME records
- Enable HTTPS in GitHub Pages settings

### Build Process

#### Static Site - No Build Required

Advantages:
- No Node.js/webpack/build tools needed
- Instant deployment (push = deploy)
- Simple hosting requirements
- Fast CDN distribution

#### Deployment Workflow

**Manual Deployment:**
```bash
git add .
git commit -m "Update: description"
git push origin main
```

Changes live within 1-5 minutes.

**Automated Deployment (GitHub Actions):**

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

### Backend Services (Supabase)

#### Infrastructure

**Hosting:** Supabase Cloud (AWS-backed)

**Components:**
- PostgreSQL database (managed)
- Authentication service
- RESTful API (auto-generated)
- Real-time subscriptions (WebSocket)
- Storage for files (if used)

#### Configuration

**Environment Variables (js/supabaseClient.js):**

```javascript
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'your-anon-public-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
```

**Security Note:** The anon key is public-safe. RLS policies enforce security.

#### Database Backups

**Automatic Backups:**
- Daily automatic backups (Supabase Pro plan)
- Point-in-time recovery available
- Retention: 7-30 days depending on plan

**Manual Backups:**
```bash
# Using pg_dump via Supabase connection string
pg_dump "postgresql://postgres:[password]@[host]:5432/postgres" > backup.sql
```

#### Monitoring

**Supabase Dashboard Provides:**
- API request metrics
- Database performance
- Auth user statistics
- Error logs
- Storage usage

---

## Testing and Quality Assurance

### Testing Strategy

#### Manual Testing Checklist

**User Flows - Admin:**
- [ ] Login with admin credentials
- [ ] View/manage user accounts
- [ ] Change user roles
- [ ] View/respond to contact messages
- [ ] Access all admin-only pages
- [ ] Logout

**User Flows - Organizer:**
- [ ] Sign up and confirm email
- [ ] Login
- [ ] Create new event with geolocation
- [ ] Create race with GPX upload
- [ ] Edit own events
- [ ] Import results from CSV
- [ ] Import results from Excel
- [ ] View event analytics
- [ ] Cannot access admin pages
- [ ] Logout

**User Flows - Rider:**
- [ ] Sign up and login
- [ ] View public rankings
- [ ] Search for own results
- [ ] Update profile
- [ ] Submit contact form
- [ ] Cannot create events
- [ ] Logout

**Public Access:**
- [ ] View homepage
- [ ] Browse events without login
- [ ] View race details with map
- [ ] View rankings
- [ ] Read methodology
- [ ] Submit contact form
- [ ] Switch language (FR/EN)

#### Data Validation Testing

**Event Creation:**
- [ ] Name required
- [ ] Date required
- [ ] End date >= start date
- [ ] Location optional but recommended
- [ ] Geolocation works
- [ ] URL validation

**Race Creation:**
- [ ] Name required
- [ ] Date within event range
- [ ] GPX upload and parsing
- [ ] Analysis completes successfully
- [ ] Multi-lap configuration
- [ ] E-bike settings

**Results Import:**
- [ ] CSV parsing (various formats)
- [ ] Excel parsing (.xlsx, .xls)
- [ ] Column mapping
- [ ] Age category calculation
- [ ] Time format parsing (hh:mm:ss, mm:ss)
- [ ] Status validation (FINISH/DNF/DNS)
- [ ] Bike type validation
- [ ] Dry-run vs live import

#### Cross-Browser Testing

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest, macOS and iOS)
- [ ] Edge (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Android)

**Key Features to Test:**
- Authentication flows
- GPX file upload
- Map rendering (Leaflet)
- Elevation chart (Canvas)
- CSV/Excel file import
- Form submissions
- LocalStorage persistence

#### Responsive Testing

Test at screen widths:
- [ ] 375px (iPhone SE)
- [ ] 768px (iPad portrait)
- [ ] 1024px (iPad landscape)
- [ ] 1440px (laptop)
- [ ] 1920px (desktop)

**Focus Areas:**
- Navigation behavior
- Form layouts
- Table responsiveness
- Map scaling
- Button accessibility

### Performance Testing

#### Page Load Metrics

Target metrics (on 3G connection):

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| Total Page Load | < 5s |

**Tools:**
- Chrome DevTools Lighthouse
- WebPageTest.org
- GTmetrix

#### GPX Processing Performance

**Test Cases:**

| Track Size | Points | Target Processing Time |
|-----------|--------|----------------------|
| Small XC | < 1,000 | < 1s |
| Medium Marathon | 1,000-5,000 | < 3s |
| Large Ultra | 5,000-10,000 | < 5s |
| Very Large | > 10,000 | < 10s |

**Optimization Techniques:**
- Web Workers for heavy computation
- Throttle point processing if > 10k points
- Progressive rendering

---

## Future Enhancements and Roadmap

### Short-Term (3-6 months)

#### Audit Log System
**Purpose:** Track all admin actions and content modifications for accountability

**Features:**
- Log user actions (create, update, delete)
- Timestamp and user attribution
- Searchable and filterable
- Export to CSV

**Implementation:**
```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  action TEXT,  -- 'create', 'update', 'delete'
  table_name TEXT,
  record_id TEXT,
  changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Automated Rider Profile Creation
**Current:** Manual rider management
**Proposed:** Auto-create rider profiles during results import

**Benefits:**
- Eliminate duplicate entries
- Maintain consistent rider IDs
- Link results across races
- Build rider history automatically

**Implementation:**
- Check if rider exists by name/birthyear
- If not, create profile with defaults
- Link result to rider_id
- Allow rider to claim profile later

#### Enhanced Search and Filters
**Rankings Page:**
- Filter by discipline
- Filter by region/location
- Filter by date range
- Search by rider name
- Filter by age category
- Filter by bike type

**Events Page:**
- Search by location
- Filter by discipline
- Date range picker
- Organizer filter

#### Notification System
**Email Notifications:**
- New results posted for followed events
- Ranking position changes
- Event reminders
- Admin messages

**In-App Notifications:**
- Bell icon with notification count
- Notification center page

### Medium-Term (6-12 months)

#### Mobile Applications
**Platforms:** iOS and Android

**Features:**
- Native authentication
- Push notifications
- Offline access to favorites
- Camera for GPX QR codes
- Barcode scanning for race bibs

**Technology Options:**
- React Native (shared codebase)
- Flutter (cross-platform)
- Native Swift/Kotlin (optimal performance)

#### Live Race Tracking
**Integration Points:**
- GPS tracking devices
- Timing chips
- Manual checkpoints

**Features:**
- Real-time rider positions on map
- Estimated finish times
- Leaderboard updates
- Spectator notifications

#### Rider Dashboard with Analytics
**Personal Stats:**
- Performance trends over time
- Category comparisons
- Training insights
- Strongest/weakest terrains

**Visualizations:**
- Charts: points progression, race frequency
- Heatmaps: geographic race coverage
- Comparative: vs. category average

#### Social Features
**Following:**
- Follow other riders
- Follow events/organizers
- Activity feed

**Comments:**
- Comment on race results
- Share race experiences
- Photo uploads

**Challenges:**
- Create custom challenges
- Virtual competitions
- Achievement badges

### Long-Term (12+ months)

#### International Expansion
**Additional Languages:**
- Italian
- Spanish
- German
- Portuguese

**Regional Adaptations:**
- Local event discovery
- Regional ranking systems
- Currency localization

#### Federation Partnerships
**Official Recognition:**
- Partner with national MTB federations
- Official ranking status
- Integration with existing systems
- License verification

**Benefits:**
- Increased legitimacy
- Larger user base
- Access to official race data
- Standardization

#### Machine Learning Features
**Performance Predictions:**
- Predict finish time based on training data
- Suggest suitable race difficulty levels
- Identify improvement areas

**Course Recommendations:**
- Suggest races based on rider profile
- Match rider strengths to course characteristics

**Anomaly Detection:**
- Flag suspicious results
- Detect data entry errors

#### Timing System Integration
**Compatible Systems:**
- MyLaps
- ChronoTrack
- RaceSplitter
- Manual timing apps

**Direct Import:**
- API connections to timing providers
- Automatic results sync
- Real-time leaderboard updates

---

## Technical Specifications

### Browser Requirements

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 90+ | Recommended |
| Firefox | 88+ | Full support |
| Safari | 14+ | macOS and iOS |
| Edge | 90+ | Chromium-based |

### Required JavaScript Features

**ECMAScript Support:**
- ES6+ (2015 and later)
- Async/await
- Promises
- Modules (import/export)
- Arrow functions
- Template literals
- Destructuring

**Browser APIs:**
- LocalStorage
- Fetch API
- File API (FileReader)
- Geolocation API (optional)
- Canvas API (for charts)
- History API (for navigation)

**Third-Party Libraries:**
- Leaflet.js 1.9.4
- PapaParse 5.4.1
- SheetJS (xlsx) 0.18.5

### Performance Benchmarks

| Operation | Target Time | Acceptable Time |
|-----------|-------------|-----------------|
| Initial page load | < 2s | < 3s |
| Time to interactive | < 3s | < 5s |
| GPX parse (5k points) | < 2s | < 4s |
| Results import (100 riders) | < 3s | < 5s |
| Map render | < 1s | < 2s |
| Search results | < 500ms | < 1s |

**Network Performance:**
- Optimize for 3G: 750 Kbps down, 250 Kbps up
- Image compression: WebP with JPEG fallback
- Lazy loading for below-fold content
- CDN caching for static assets

### Accessibility Standards

**Target:** WCAG 2.1 Level AA

**Key Requirements:**
- Keyboard navigation throughout
- Screen reader compatibility
- Sufficient color contrast (4.5:1 minimum)
- Alt text for all images
- ARIA labels for interactive elements
- Focus indicators visible
- Form labels properly associated

### Database Specifications

**PostgreSQL Version:** 14+ (Supabase default)

**Capacity Planning:**

| Table | Estimated Rows/Year | Storage |
|-------|-------------------|---------|
| profiles | 10,000 | ~2 MB |
| meetings | 500 | ~1 MB |
| races | 2,000 | ~50 MB (with GPX) |
| results | 100,000 | ~20 MB |
| contact_messages | 1,000 | ~1 MB |

**Total Estimated:** ~74 MB/year of core data

**Indexes:**
- Primary keys (automatic)
- Foreign keys (automatic)
- Date fields for sorting
- Full-text search on names (if needed)

---

## Appendices

### Appendix A: File Structure

#### Complete File Listing

```
mtbpoints-app/
│
├── index.html                    # Homepage
├── about.html                    # About/methodology
├── contact.html                  # Contact form
├── challengemtbpoints.html       # Challenge rankings
├── course.html                   # Race detail (alternative)
├── dashboard.html               # Organizer dashboard
├── event.html                    # Race detail (primary)
├── events.html                   # Races list by event
├── login.html                    # Organizer login
├── login-admin.html              # Admin login
├── login-rider.html              # Rider login
├── meeting.html                  # Event detail
├── meeting-create.html           # Create event
├── course-create.html            # Create race
├── import-results.html           # Import results
├── admin.html                    # Admin dashboard
├── admin-messages.html           # Contact messages admin
│
├── css/
│   ├── style.css                 # Main stylesheet
│   └── theme-nature.css          # Nature theme colors
│
├── js/
│   ├── data.js                   # Data models
│   ├── storage.js                # LocalStorage helpers
│   ├── supabaseClient.js         # Supabase setup
│   ├── gpx.js                    # GPX parsing
│   ├── i18n.js                   # Translations
│   ├── event-detail.js           # Event page logic
│   ├── course-create.js          # Race creation
│   ├── import-results.js         # Results import
│   └── contact.js                # Contact form
│
├── img/
│   ├── mtbpoints-coins.png       # Logo
│   └── (other images)
│
├── .nojekyll                     # GitHub Pages config
├── README.md                     # Project documentation
└── db_cluster-14-01-2026...gz   # Database backup
```

### Appendix B: Glossary

| Term | Definition |
|------|------------|
| **D+** | Cumulative positive elevation gain (Dénivelé positif) |
| **D-** | Cumulative negative elevation (descent) |
| **DNF** | Did Not Finish |
| **DNS** | Did Not Start |
| **DH** | Downhill (discipline) |
| **Enduro** | Multi-stage race format with timed descents |
| **E-bike** | Electric-assist mountain bike (VAE in French) |
| **GPX** | GPS Exchange Format (XML file) |
| **KPI** | Key Performance Indicator |
| **OSM** | OpenStreetMap |
| **RLS** | Row-Level Security (PostgreSQL) |
| **UCI** | Union Cycliste Internationale (cycling governing body) |
| **XC/XCO** | Cross-Country Olympic |
| **XCC** | Cross-Country Short Track |
| **XCM** | Cross-Country Marathon |

### Appendix C: API Reference

#### Supabase Client Usage

**Authentication:**
```javascript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: { role: 'rider' }
  }
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// Get current user
const { data: { user } } = await supabase.auth.getUser();

// Sign out
await supabase.auth.signOut();
```

**Database Queries:**
```javascript
// Select
const { data, error } = await supabase
  .from('meetings')
  .select('*')
  .order('date', { ascending: false })
  .limit(10);

// Insert
const { data, error } = await supabase
  .from('meetings')
  .insert([
    { name: 'Event Name', date: '2026-06-15', location: 'City' }
  ]);

// Update
const { data, error } = await supabase
  .from('meetings')
  .update({ name: 'New Name' })
  .eq('id', 'meeting-id');

// Delete
const { data, error } = await supabase
  .from('meetings')
  .delete()
  .eq('id', 'meeting-id');
```

### Appendix D: Changelog

**Version 1.0 (January 2026)**
- Initial production release
- Multi-role authentication system
- Event and race management
- GPX integration with scoring
- Results import (CSV/Excel)
- Multi-lap and e-bike support
- Internationalization (FR/EN)
- Admin dashboard
- Contact form system

**Future Versions:**
- See Future Enhancements section

---

## Contact and Support

For technical support, feature requests, or general inquiries:

- **Contact Form:** Use the contact page on the platform
- **GitHub Issues:** (if public repository)
- **Email:** (to be configured)

---

**Document Version:** 1.0  
**Last Updated:** January 15, 2026  
**Maintained By:** MTB Points Development Team
