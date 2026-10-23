// src/viewer/types.ts
import type { Mesh } from "../geometry/types";
import type { TraySpec } from "../model/types";

export interface SceneTray {
  spec: TraySpec;
  mesh: Mesh;
  /** A plain hex colour (the shade of the tray's component, as in the top view); absent: the neutral. */
  color?: string;
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
  onPick(cb: (key: string | null) => void): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export type SceneFactory = (canvas: HTMLCanvasElement) => SceneHandle;
