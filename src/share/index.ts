// Public surface of share/ (roadmap §4.5).
export { decodeHash, MAX_INFLATED_BYTES } from "./link";
export { createProjectStore, StoreWriteError, STORAGE_PREFIX } from "./store";
export type { ProjectListEntry, ProjectStore } from "./store";
export { exportJsonFile, importJsonText, jsonFileName } from "./file";
export { RAIL_WIDTH, clampRailWidth, createPrefsStore, printerProblems } from "./prefs";
export type { PrefsStore } from "./prefs";
export { createHiddenNotesStore, isHidden, noteKey } from "./hiddenNotes";
export type { HiddenNotesStore } from "./hiddenNotes";
