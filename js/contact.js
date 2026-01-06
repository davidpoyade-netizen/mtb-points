import { supabase } from "./supabaseClient.js";

const form = document.getElementById("contactForm");
const msg = document.getElementById("formMsg");

if (!form || !msg) {
  console.warn("[contact] contactForm/formMsg introuvables");
} else {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Envoi…";
    msg.style.color = "#0f172a";

    // Récupère les champs par id (plus robuste)
    const nameEl = document.getElementById("name");
    const emailEl = document.getElementById("email");
    const subjectEl = document.getElementById("subject");
    const messageEl = document.getElementById("message");

    const payload = {
      name: nameEl?.value?.trim() || "",
      email: emailEl?.value?.trim() || "",
      subject: subjectEl?.value?.trim() || "",
      message: messageEl?.value?.trim() || ""
    };

    // mini validation
    if (!payload.email || !payload.message) {
      msg.textContent = "❌ Email et message obligatoires.";
      msg.style.color = "#dc2626";
      return;
    }

    const { error } = await supabase.from("contact_messages").insert(payload);

    if (error) {
      console.error("[contact] insert error", error);
      msg.textContent = "❌ Erreur d’envoi : " + (error.message || "inconnue");
      msg.style.color = "#dc2626";
    } else {
      msg.textContent = "✅ Message envoyé. Merci !";
      msg.style.color = "#16a34a";
      form.reset();
    }
  });
}
