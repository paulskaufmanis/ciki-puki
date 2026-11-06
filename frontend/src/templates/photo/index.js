import PhotoEvidence from "./PhotoEvidence.jsx";

export default {
  label: "Foto pierādījums",
  namePlaceholder: "piem. Iztukšot trauku mazgājamo mašīnu",
  Runner: PhotoEvidence,
  photoEvidence: true,
  summary: (task) => (task.completedToday ? "Paveikts" : "Uzņem foto, kad esi beidzis"),
};
