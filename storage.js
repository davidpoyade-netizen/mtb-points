// js/storage.js

// ===============================
// Events (épreuves)
// ===============================
const LS_EVENTS_KEY = "vtt_events_v1";

function loadStoredEvents() {
  const raw = localStorage.getItem(LS_EVENTS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("[storage] loadStoredEvents error", e);
    return [];
  }
}

function saveStoredEvents(events) {
  localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(events || []));
}

function addStoredEvent(ev) {
  const all = loadStoredEvents();
  all.unshift(ev);
  saveStoredEvents(all);
}

function updateStoredEvent(ev) {
  const all = loadStoredEvents();
  const i = all.findIndex(x => x.id === ev.id);
  if (i >= 0) {
    all[i] = ev;
    saveStoredEvents(all);
  }
}

function findStoredEvent(id) {
  const all = loadStoredEvents();
  return all.find(e => e.id === id) || null;
}

function makeIdFromName(name) {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

  return `${base}-${Date.now()}`;
}


// ===============================
// Meetings (événements multi-courses)
// ===============================
const MEETINGS_KEY = "vtt_meetings";

function loadMeetings() {
  try {
    const arr = JSON.parse(localStorage.getItem(MEETINGS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("[storage] loadMeetings error", e);
    return [];
  }
}

function saveMeetings(arr) {
  localStorage.setItem(MEETINGS_KEY, JSON.stringify(arr || []));
}

function addMeeting(m) {
  const arr = loadMeetings();
  arr.unshift(m); // plus récent en premier
  saveMeetings(arr);
}

function updateMeeting(meeting) {
  const arr = loadMeetings();
  const i = arr.findIndex(x => x.id === meeting.id);
  if (i >= 0) arr[i] = meeting;
  saveMeetings(arr);
}

function findMeeting(id) {
  const arr = loadMeetings();
  return arr.find(m => m.id === id) || null;
}

function deleteMeeting(id) {
  const arr = loadMeetings().filter(m => m.id !== id);
  saveMeetings(arr);
}
