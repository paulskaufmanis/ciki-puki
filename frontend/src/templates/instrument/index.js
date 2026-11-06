import InstrumentPractice, { durationLabel, fmt } from "./InstrumentPractice.jsx";
import InstrumentSettings from "./InstrumentSettings.jsx";

export default {
  label: "Instrumenta spēle",
  namePlaceholder: "piem. Ģitāras spēle",
  Runner: InstrumentPractice,
  Settings: InstrumentSettings,
  recordsAudio: true,
  summary: (task) =>
    task.completedToday ? "Paveikts"
      : task.progressSeconds > 0 ? `Atlikuši ${fmt(Math.max(0, task.targetSeconds - task.progressSeconds))}`
        : durationLabel(task.targetSeconds),
};
