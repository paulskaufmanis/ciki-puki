export default {
  label: "Vienkāršs uzdevums",
  namePlaceholder: "piem. Mājasdarbs",
  checkOnly: true,
  summary: (task) =>
    task.completedToday ? "Paveikts"
      : "Atzīmē, kad esi beidzis",
};
