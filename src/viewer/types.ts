// src/viewer/types.ts
import type { Mesh } from "../geometry/types";
import type { TraySpec } from "../model/types";
import type { Projection, ViewState } from "./view";

export interface SceneTray {
  spec: TraySpec;
  mesh: Mesh;
  /** A plain hex colour (the shade of the tray's component, as in the top view); absent: the neutral. */
  color?: string;
  /**
   * The plain hex colour each compartment of the spec is drawn in inside (shades.ts wellColorsOf), in
   * the order of `spec.compartments`; absent: the whole part is one colour.
   */
  wells?: readonly string[];
  /**
   * How far the mesh's bed face is under the spec's z, mm: the slab a part with the stepped base
   * hangs into the part below (model/lip.ts slabUnder); absent: 0.
   */
  below?: number;
}

export interface BoxOutline {
  min: [number, number, number];
  size: [number, number, number];
}

export interface SceneHandle {
  setBox(outline: BoxOutline): void;
  setTrays(trays: readonly SceneTray[]): void;
  setExplode(f: number): void;
  setMaxLevel(level: number | null): void;
  setSelected(key: string | null): void;
  /**
   * The trays to tint softly, those of the component whose rail row is pointed at or focused (the
   * top view lights them the same way). The selected tray keeps its stronger glow. `edited` (the
   * editor's 3D view): they are the item being edited, so they glow more and the rest is faded
   * further and drawn through.
   */
  setLit(keys: readonly string[], edited?: boolean): void;
  /**
   * The areas kept free on top, as ghost slabs (transform.ts reservedSlabs): translucent, never
   * picked, never exported, not part of the camera's fit or the Layer cut. Replaces the last ones;
   * none removes them.
   */
  setReserved?(slabs: readonly BoxOutline[]): void;
  /**
   * Shows the model through the perspective or the orthographic camera, from the same side at the
   * same apparent size. The scene starts in perspective.
   */
  setProjection?(projection: Projection): void;
  /** Where the camera stands now (view.ts), to put it back later with `setView`. */
  getView?(): ViewState;
  /**
   * Puts the camera back where `getView` had it, when the box is about the size it was (view.ts
   * keepsView); false, and nothing changed, when it is not, and the view stays as it is.
   */
  setView?(view: ViewState): boolean;
  /** Turns the camera back to where the view opens, at the fit, keeping the projection. */
  resetView?(): void;
  onPick(cb: (key: string | null) => void): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export type SceneFactory = (canvas: HTMLCanvasElement) => SceneHandle;
