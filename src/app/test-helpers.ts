// src/app/test-helpers.ts
// Shared test fixtures and stubs. Imported only from *.test.ts(x) files.
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import type { Mesh } from "../geometry/types";
import { GEOMETRY_VERSION } from "../geometry/version";
import type { LayoutInput, LayoutResult } from "../layout/types";
import { noForeign, parseProject } from "../model/schema";
import type { ForeignData, Project, StoredLayout, TraySpec } from "../model/types";
import type { LayoutClient } from "./clients";

export const EMPTY_FOREIGN: ForeignData = noForeign();

export function fixtureProject(): Project {
  const r = parseProject(cardsHeavy);
  if (!r.ok) {
    throw new Error(`cards-heavy fixture failed to parse: ${r.error}`);
  }
  return withoutLayout(r.project);
}

export function withoutLayout(p: Project): Project {
  const copy = { ...p };
  delete copy.layout;
  return copy;
}

export function makeTray(over: Partial<TraySpec> = {}): TraySpec {
  return {
    key: "a:p0:0",
    part: "tray",
    path: "0",
    stack: 0,
    level: 0,
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 80,
    h: 40,
    rotated: false,
    wall: 1.6,
    floor: 1.2,
    lip: false,
    solid: false,
    compartments: [
      {
        x: 1.6,
        y: 1.6,
        w: 96.8,
        d: 76.8,
        floorZ: 1.2,
        kind: "well",
        contents: "Deck A ×40",
        features: [],
      },
    ],
    ...over,
  };
}

export function makeLayout(
  inputsHash: string,
  trays: TraySpec[] = [makeTray()],
  over: Partial<StoredLayout> = {},
): StoredLayout {
  return {
    createdWith: "0.1.0",
    geometryVersion: GEOMETRY_VERSION,
    inputsHash,
    seed: 1,
    iterations: 1000,
    capped: false,
    trays,
    ...over,
  };
}

export function makeResult(
  layout: StoredLayout | null,
  over: Partial<LayoutResult> = {},
): LayoutResult {
  return {
    layout,
    bestAttempt: null,
    summary: layout
      ? {
          fillPct: 81,
          trayCount: layout.trays.length,
          stackCount: 1,
          filamentG: 123,
          filamentAtInfillG: 123,
          infillPct: 15,
          playX: 1.2,
          playY: 1.6,
          crossX: 3,
          crossY: 2,
        }
      : null,
    notices: [],
    ...over,
  };
}

/** Axis-aligned closed box mesh, CCW outward. */
export function cubeMesh(size: [number, number, number] = [10, 10, 10]): Mesh {
  const [w, d, h] = size;
  const positions = new Float32Array([
    0,
    0,
    0,
    w,
    0,
    0,
    w,
    d,
    0,
    0,
    d,
    0,
    0,
    0,
    h,
    w,
    0,
    h,
    w,
    d,
    h,
    0,
    d,
    h,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  return { positions, indices };
}

export interface RunCall {
  input: LayoutInput;
  seed: number;
  iterations: number;
  warmStart: StoredLayout | undefined;
  onProgress: (done: number, total: number, best: LayoutResult) => void;
  resolve: (r: LayoutResult) => void;
  reject: (e: Error) => void;
}

export function stubLayoutClient(): {
  client: LayoutClient;
  calls: RunCall[];
  cancelCount: () => number;
  disposed: () => boolean;
} {
  const calls: RunCall[] = [];
  let cancels = 0;
  let isDisposed = false;
  const client: LayoutClient = {
    run(input, seed, iterations, warmStart, onProgress) {
      return new Promise<LayoutResult>((resolve, reject) => {
        calls.push({ input, seed, iterations, warmStart, onProgress, resolve, reject });
      });
    },
    cancel() {
      cancels += 1;
    },
    dispose() {
      isDisposed = true;
    },
  };
  return { client, calls, cancelCount: () => cancels, disposed: () => isDisposed };
}

/** Let pending promise callbacks run (fake timers do not fake microtasks). */
export async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}
