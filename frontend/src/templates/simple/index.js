import SimpleSettings from "./SimpleSettings.jsx";
import WorkDetailsInput from "./WorkDetailsInput.jsx";

export default {
  label: "Vienkāršs uzdevums",
  namePlaceholder: "piem. Mājasdarbs",
  Settings: SimpleSettings,
  settingsOnCreate: true,
  checkOnly: true,
  DetailsInput: WorkDetailsInput,
  needsDetails: (task) => !!task.params.requireDetails,
  summary: (task) =>
    task.completedToday ? "Paveikts"
      : task.params.requireDetails ? "Atzīmē, ko izdarīji" : "Atzīmē, kad esi beidzis",
};
