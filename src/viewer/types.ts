// src/viewer/types.ts
import type { Mesh } from "../geometry/types";
import type { TraySpec } from "../model/types";

export interface SceneTray {
  spec: TraySpec;
  mesh: Mesh;
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
  onPick(cb: (key: string | null) => void): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export type SceneFactory = (canvas: HTMLCanvasElement) => SceneHandle;
