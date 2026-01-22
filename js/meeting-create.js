import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("meetingForm");
  const statusEl = document.getElementById("status");

  if (!form) {
    console.error("❌ meetingForm introuvable");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "Enregistrement en cours…";

    const name = document.getElementById("name")?.value?.trim();
    const location = document.getElementById("location")?.value?.trim();
    const country = document.getElementById("country")?.value?.trim();
    const start_date = document.getElementById("start_date")?.value;
    const end_date = document.getElementById("end_date")?.value;

    if (!name || !location || !country || !start_date || !end_date) {
      statusEl.textContent = "❌ Tous les champs sont obligatoires";
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      statusEl.textContent = "❌ Utilisateur non connecté";
      return;
    }

    const { error } = await supabase.from("meetings").insert([
      {
        name,
        location,
        country,
        start_date,
        end_date,
        organizer_id: user.id,
      },
    ]);

    if (error) {
      console.error("❌ Erreur Supabase :", error);
      statusEl.textContent = "❌ Erreur : " + error.message;
    } else {
      statusEl.textContent = "✅ Événement créé avec succès";
      form.reset();
    }
  });
});
