async function loadHeader() {
  const container = document.getElementById("app-header");
  if (!container) return;

  try {
    const res = await fetch("header.html");
    if (!res.ok) throw new Error("header.html introuvable");
    const html = await res.text();
    container.innerHTML = html;

    // Highlight du lien actif
    const path = location.pathname.split("/").pop();
    container.querySelectorAll(".nav a").forEach((a) => {
      const href = a.getAttribute("href");
      if (href === path) a.classList.add("active");
    });
  } catch (e) {
    console.error("[header] error:", e);
  }
}

document.addEventListener("DOMContentLoaded", loadHeader);
