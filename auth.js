const AUTH_KEY = "vtt_auth_v1";

function authSet({ name, role }) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ name, role }));
}

function authGet() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function authClear() {
  localStorage.removeItem(AUTH_KEY);
}

// Protection simple d’une page
function requireRole(requiredRole) {
  const user = authGet();
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (requiredRole && user.role !== requiredRole) {
    window.location.href = "public-ranking.html";
  }
}
