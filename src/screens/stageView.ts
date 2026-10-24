// src/screens/stageView.ts
// The stage's View selection ("Top" or "3D", the status row's segment), for the plan and the 3D
// frame beside it (Task 7). The Layer selection is `state.viewLayer`. Like `hoveredComponent`, a
// module signal the app resets when it goes. Also the view a project opens in (Settings, Display),
// kept per browser.
import { signal } from "@preact/signals";
import { STORAGE_PREFIX, defaultStorage } from "../share/store";
import type { StageView } from "./StageTop";

export const stageView = signal<StageView>("plan");

const OPEN_VIEW_KEY = `${STORAGE_PREFIX}view-open`;

/** The view this browser last chose to open plans in; "plan" (Top) when none, or when storage is blocked or damaged. */
export function loadOpenView(storage: Storage | null = defaultStorage()): StageView {
  try {
    const raw = storage?.getItem(OPEN_VIEW_KEY);
    return raw === "3d" || raw === "plan" ? raw : "plan";
  } catch {
    return "plan";
  }
}

/** Keeps the choice for this browser; with no storage it holds for this visit only. */
export function saveOpenView(view: StageView, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(OPEN_VIEW_KEY, view);
  } catch {
    // full or blocked: the choice holds until the page is closed
  }
}

/** The view a project opens in: this browser's choice, read when the page opens. A signal, so Settings shows it. */
export const openViewPref = signal<StageView>(loadOpenView());

/** Chooses the view plans open in for this browser. The view on screen stays as it is. */
export function chooseOpenView(view: StageView): void {
  openViewPref.value = view;
  saveOpenView(view);
}

/** The view a project opens in: the choice, except that a browser without WebGL opens on Top. */
export function openingView(webgl: boolean): StageView {
  return webgl ? openViewPref.value : "plan";
}
