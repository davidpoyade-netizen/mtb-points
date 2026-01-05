function uciAgeCategory(birthYear, seasonYear = new Date().getFullYear()) {
  if (!birthYear) return "—";
  const age = seasonYear - birthYear;

  if (age >= 17 && age <= 18) return "Junior";
  if (age >= 19 && age <= 22) return "U23";
  if (age >= 23 && age <= 29) return "Elite";

  if (age >= 30) {
    const m = Math.floor((age - 30) / 5) + 1; // 30-34 => Master 1, etc.
    return `Master ${m}`;
  }
  return "Jeune";
}

function sexLabel(sex) {
  if (sex === "H") return "Homme";
  if (sex === "F") return "Femme";
  return "—";
}
