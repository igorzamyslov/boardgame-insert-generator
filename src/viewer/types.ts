// src/viewer/types.ts
import type { Mesh } from "../geometry/types";
import type { TraySpec } from "../model/types";
import type { ViewBasis } from "./axes";

export interface SceneTray {
  spec: TraySpec;
  mesh: Mesh;
  /** A plain hex colour (the shade of the tray's component, as in the top view); absent: the neutral. */
  color?: string;
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
   * top view lights them the same way). The selected tray keeps its stronger glow.
   */
  setLit(keys: readonly string[]): void;
  onPick(cb: (key: string | null) => void): void;
  /**
   * Reports the camera's orientation now and on every turn, for the axis indicator; `null` stops
   * reporting. Orientation only: the indicator is drawn over the canvas, never in the scene.
   */
  onView(cb: ((view: ViewBasis) => void) | null): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export type SceneFactory = (canvas: HTMLCanvasElement) => SceneHandle;
