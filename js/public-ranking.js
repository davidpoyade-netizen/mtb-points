<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Classement public — MTB Points</title>

  <!-- CSS THEME NATURE (OBLIGATOIRE) -->
  <link rel="stylesheet" href="css/style.css" />
</head>

<body>
<header class="header">
  <h1>MTB Points — Classement public</h1>
  <nav class="nav">
    <a href="index.html">Accueil</a>
    <a href="public-ranking.html" class="active">Classement</a>
    <a href="meetings.html">Événements</a>
    <a href="reglement.html">Règlement</a>
  </nav>
</header>

<main class="wrap">

  <!-- Onglets disciplines -->
  <section class="card">
    <h2>Classements</h2>
    <div class="tabs" id="tabs"></div>
  </section>

  <!-- MUSCULAIRE -->
  <section class="twoCols">
    <div class="panel">
      <div class="panelHead"><h3>🚵 Musculaire — Hommes</h3></div>
      <div class="panelBody">
        <table>
          <thead>
            <tr><th>#</th><th>Rider</th><th>Nation</th><th>Points</th></tr>
          </thead>
          <tbody id="tbody_m_m"></tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panelHead"><h3>🚵 Musculaire — Femmes</h3></div>
      <div class="panelBody">
        <table>
          <thead>
            <tr><th>#</th><th>Rider</th><th>Nation</th><th>Points</th></tr>
          </thead>
          <tbody id="tbody_m_f"></tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- ELECTRIQUE -->
  <section class="twoCols" style="margin-top:16px">
    <div class="panel">
      <div class="panelHead"><h3>⚡ Assistance électrique — Hommes</h3></div>
      <div class="panelBody">
        <table>
          <thead>
            <tr><th>#</th><th>Rider</th><th>Nation</th><th>Points</th></tr>
          </thead>
          <tbody id="tbody_e_m"></tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panelHead"><h3>⚡ Assistance électrique — Femmes</h3></div>
      <div class="panelBody">
        <table>
          <thead>
            <tr><th>#</th><th>Rider</th><th>Nation</th><th>Points</th></tr>
          </thead>
          <tbody id="tbody_e_f"></tbody>
        </table>
      </div>
    </div>
  </section>

</main>

<script type="module" src="js/public-ranking.js"></script>
</body>
</html>
