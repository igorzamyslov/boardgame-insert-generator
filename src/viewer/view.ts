// src/viewer/view.ts
// What the 3D view remembers: the projection a person chose (per browser) and where the camera
// stood in the project being worked on (for this visit), so Top and 3D can be switched without losing the view.
// Pure, apart from the storage calls, so it is tested without a renderer.
import { STORAGE_PREFIX, defaultStorage } from "../share/store";
import type { Vec3 } from "./fit";

export type Projection = "perspective" | "orthographic";

/** The projection a view opens in until a person chooses the other. */
export const DEFAULT_PROJECTION: Projection = "perspective";

const PROJECTION_KEY = `${STORAGE_PREFIX}view-projection`;

/** The projection this browser last chose, or the default; storage that is blocked or damaged gives the default. */
export function loadProjection(storage: Storage | null = defaultStorage()): Projection {
  try {
    const raw = storage?.getItem(PROJECTION_KEY);
    return raw === "orthographic" || raw === "perspective" ? raw : DEFAULT_PROJECTION;
  } catch {
    return DEFAULT_PROJECTION;
  }
}

/** Keeps the choice for this browser; with no storage it holds for this visit only. */
export function saveProjection(
  projection: Projection,
  storage: Storage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(PROJECTION_KEY, projection);
  } catch {
    // full or blocked: the choice holds until the page is closed
  }
}

/**
 * Where the camera stands, as shares of the fit so it still means the same view after the box or
 * the spread changes: the direction it looks from, how far it is as a share of the fit's distance,
 * and the orthographic zoom. The camera always turns about the middle of the box, so no target.
 */
export interface ViewState {
  /** The unit vector from the middle of the box toward the camera. */
  direction: Vec3;
  /** The camera's distance from the middle, as a share of the distance that fits the model (1: the fit). */
  share: number;
  /** The orthographic camera's zoom (1 is the fit); a perspective camera zooms by its distance. */
  zoom: number;
  projection: Projection;
  /** The radius of the sphere about the box's middle that holds the box (not the parts), mm. */
  boxRadius: number;
  /** How far apart the parts were spread, 0..1. */
  explode: number;
}

/**
 * How far the box's size may change, as a share of what it was, before the remembered view no
 * longer frames it and the camera starts again from its opening place. Within it the view is kept
 * and scaled to the new size: the turn and the zoom stay.
 */
export const KEEP_VIEW_WITHIN = 0.25;

/** Whether a view that framed a box of radius `was` still frames one of radius `now`. */
export function keepsView(was: number, now: number): boolean {
  return was > 0 && now > 0 && Math.abs(now / was - 1) <= KEEP_VIEW_WITHIN;
}

/** The camera of the project being worked on this visit: one slot, not storage; another project replaces it. */
let remembered: { projectId: string; view: ViewState } | undefined;

export const viewMemory = {
  /** The view kept for `projectId`; none when the slot holds another project's (a new project starts fresh). */
  get: (projectId: string | undefined): ViewState | undefined =>
    projectId !== undefined && remembered?.projectId === projectId ? remembered.view : undefined,
  set: (projectId: string | undefined, view: ViewState): void => {
    if (projectId !== undefined) {
      remembered = { projectId, view };
    }
  },
  clear: (): void => {
    remembered = undefined;
  },
};
