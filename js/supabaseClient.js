<script type="module">
  import { supabase } from "./js/supabaseClient.js";

  const form = document.getElementById("contactForm");
  const msg = document.getElementById("formMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "Envoi…";

    const payload = {
      name: name.value,
      email: email.value,
      subject: subject.value,
      message: message.value
    };

    const { error } = await supabase
      .from("contact_messages")
      .insert(payload);

    if (error) {
      msg.textContent = "❌ Erreur d’envoi";
      msg.style.color = "#dc2626";
    } else {
      msg.textContent = "✅ Message envoyé. Merci !";
      msg.style.color = "#16a34a";
      form.reset();
    }
  });
</script>
