import instrument from "./instrument/index.js";
import photo from "./photo/index.js";
import simple from "./simple/index.js";

// Task template types, keyed like TEMPLATES in backend/index.js. Each entry provides:
//   label            – name shown to the parent when creating a task
//   namePlaceholder  – hint for the task name input
//   Runner           – child view: ({ task, onDone, onBack }) => JSX (optional; without it the task is ticked off from the list)
//   Settings         – parent editor for task.params: ({ params, onChange }) => JSX (optional)
//   settingsOnCreate – true to show Settings in the parent's "Add a task" form
//   summary(task)    – short status line in the child's list
//   recordsAudio     – true if the Runner uploads a daily recording (shown in the parent's Today view)
//   photoEvidence    – true if the task is completed by uploading a photo (viewable in the parent's Today view)
//   checkOnly        – true if the task is always ticked off by hand (hides the parent's manual-tick switch)
export const TEMPLATES = { instrument, photo, simple };

export const templateOf = (task) => (Object.hasOwn(TEMPLATES, task.template) ? TEMPLATES[task.template] : null);
