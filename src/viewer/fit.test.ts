// src/viewer/fit.test.ts
import { describe, expect, it } from "vitest";
import { makeTray } from "../app/test-helpers";
import type { TraySpec } from "../model/types";
import { anchorOf } from "./transform";
import {
  CAMERA_FOV,
  FIT_AIR,
  fitDistance,
  modelCorners,
  modelRadius,
  ndcOf,
  outlineTarget,
  radiusAbout,
} from "./fit";
import type { FitPart, Vec3 } from "./fit";
import type { BoxOutline } from "./types";

/** A long box, as the wide seed is: 400 across, 285 deep, 70 high, trays on two layers. */
const OUTLINE: BoxOutline = { min: [-0.5, -0.5, 0], size: [400, 285, 70] };
const TRAYS: TraySpec[] = [
  makeTray({ key: "a:p0:0", x: 0, y: 0, z: 0, w: 190, d: 280, h: 30, level: 0 }),
  makeTray({ key: "b:p0:0", x: 200, y: 0, z: 0, w: 195, d: 135, h: 30, level: 0, stack: 1 }),
  makeTray({ key: "c:p0:0", x: 200, y: 145, z: 0, w: 195, d: 135, h: 30, level: 0, stack: 2 }),
  makeTray({ key: "d:p0:0", x: 200, y: 0, z: 30, w: 195, d: 135, h: 30, level: 1, stack: 1 }),
  makeTray({ key: "e:p0:0", x: 0, y: 0, z: 30, w: 190, d: 280, h: 30, level: 1, stack: 0 }),
];
const parts = (trays: readonly TraySpec[]): FitPart[] => {
  const byKey = new Map(trays.map((t) => [t.key, t]));
  return trays.map((spec) => ({ spec, anchor: anchorOf(spec, byKey) }));
};

describe("fitDistance", () => {
  const rad = (deg: number): number => (deg * Math.PI) / 180;

  it("puts a sphere in a frame as wide as it is tall at R over sin of half the field of view, with air", () => {
    expect(fitDistance(100, 1)).toBeCloseTo((100 * FIT_AIR) / Math.sin(rad(CAMERA_FOV / 2)), 9);
  });

  it("is the same for any frame wider than it is tall: the vertical angle is the narrower", () => {
    expect(fitDistance(100, 1.4)).toBeCloseTo(fitDistance(100, 1), 9);
    expect(fitDistance(100, 3)).toBeCloseTo(fitDistance(100, 1), 9);
  });

  it("stands farther back for a frame taller than it is wide: the horizontal angle is the narrower", () => {
    const tall = fitDistance(100, 0.5);
    expect(tall).toBeGreaterThan(fitDistance(100, 1));
    const horizontal = 2 * Math.atan(Math.tan(rad(CAMERA_FOV / 2)) * 0.5);
    expect(tall).toBeCloseTo((100 * FIT_AIR) / Math.sin(horizontal / 2), 9);
  });

  it("grows with the radius", () => {
    expect(fitDistance(200, 1.4)).toBeCloseTo(2 * fitDistance(100, 1.4), 9);
  });
});

describe("ndcOf", () => {
  // the camera at (0, 0, 10) looking down the -z axis (three's convention: the view moves the world 10 along -z)
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1];
  const f = 1 / Math.tan((CAMERA_FOV * Math.PI) / 360);
  const near = 1;
  const far = 100;
  // a perspective projection of aspect 2, column-major
  const projection = [
    f / 2,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ];

  it("puts the point on the line of sight in the middle of the frame", () => {
    const [x, y] = ndcOf(view, projection, [0, 0, 0]);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it("puts a point at the edge of the field of view on the frame's edge, wider across than up", () => {
    const edge = 10 * Math.tan((CAMERA_FOV * Math.PI) / 360);
    const [, up] = ndcOf(view, projection, [0, edge, 0]);
    expect(up).toBeCloseTo(1, 9);
    const [across] = ndcOf(view, projection, [2 * edge, 0, 0]);
    expect(across).toBeCloseTo(1, 9);
    expect(ndcOf(view, projection, [0, 1.5 * edge, 0])[1]).toBeGreaterThan(1);
  });
});

describe("modelRadius", () => {
  it("is the box's own half-diagonal while the parts are together", () => {
    const half = Math.hypot(400, 285, 70) / 2;
    expect(modelRadius(OUTLINE, parts(TRAYS), 0)).toBeCloseTo(half, 6);
  });

  it("grows as the parts spread apart, which lifts the upper layer and pushes the rest out", () => {
    const rest = modelRadius(OUTLINE, parts(TRAYS), 0);
    const half = modelRadius(OUTLINE, parts(TRAYS), 0.5);
    const full = modelRadius(OUTLINE, parts(TRAYS), 1);
    expect(half).toBeGreaterThan(rest);
    expect(full).toBeGreaterThan(half);
  });

  it("holds every corner of every part at the explode it was asked for", () => {
    const target = outlineTarget(OUTLINE);
    for (const explode of [0, 0.25, 1]) {
      const r = modelRadius(OUTLINE, parts(TRAYS), explode);
      for (const p of modelCorners(OUTLINE, parts(TRAYS), explode)) {
        expect(radiusAbout([p], target)).toBeLessThanOrEqual(r + 1e-9);
      }
    }
  });
});

/** A point's place in a frame of `aspect` seen from `camera` looking at `target` with z up: (x, y) in -1..1 when inside. */
function project(p: Vec3, camera: Vec3, target: Vec3, aspect: number): [number, number, number] {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a: Vec3): Vec3 => {
    const n = Math.hypot(...a);
    return [a[0] / n, a[1] / n, a[2] / n];
  };
  const forward = unit(sub(target, camera));
  const upish: Vec3 = Math.abs(forward[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
  const right = unit(cross(forward, upish));
  const up = cross(right, forward);
  const rel = sub(p, camera);
  const depth = dot(rel, forward);
  const tan = Math.tan((CAMERA_FOV * Math.PI) / 360);
  return [dot(rel, right) / (depth * tan * aspect), dot(rel, up) / (depth * tan), depth];
}

describe("a long box fits the frame after any turn", () => {
  const target = outlineTarget(OUTLINE);
  // the plan's frame is the box's W:L (400:285); the phone's and a narrow stage's are others
  const FRAMES = [400 / 285, 1, 0.6, 2.5];

  it.each(FRAMES)("in a frame of aspect %f, at every turn and every spread", (aspect) => {
    const all = parts(TRAYS);
    for (const explode of [0, 0.5, 1]) {
      const radius = modelRadius(OUTLINE, all, explode);
      const dist = fitDistance(radius, aspect);
      const points = modelCorners(OUTLINE, all, explode);
      for (let az = 0; az < 360; az += 15) {
        for (let el = -85; el <= 85; el += 10) {
          const a = (az * Math.PI) / 180;
          const e = (el * Math.PI) / 180;
          const camera: Vec3 = [
            target[0] + dist * Math.cos(e) * Math.sin(a),
            target[1] - dist * Math.cos(e) * Math.cos(a),
            target[2] + dist * Math.sin(e),
          ];
          for (const p of points) {
            const [x, y, depth] = project(p, camera, target, aspect);
            expect(depth, "in front of the camera").toBeGreaterThan(0);
            expect(Math.abs(x), `x at ${az}°/${el}° spread ${explode}`).toBeLessThanOrEqual(1);
            expect(Math.abs(y), `y at ${az}°/${el}° spread ${explode}`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("did not before: the old camera, 1.6 times the longest side away, cut this box turned and spread", () => {
    const aspect = 400 / 285;
    const all = parts(TRAYS);
    const dist = Math.max(400, 285, 70) * 1.6;
    const points = modelCorners(OUTLINE, all, 1);
    let cut = 0;
    for (let az = 0; az < 360; az += 15) {
      const a = (az * Math.PI) / 180;
      const camera: Vec3 = [
        target[0] + dist * Math.sin(a) * 0.74,
        target[1] - dist * Math.cos(a) * 0.74,
        target[2] + dist * 0.67,
      ];
      for (const p of points) {
        const [x, y] = project(p, camera, target, aspect);
        if (Math.abs(x) > 1 || Math.abs(y) > 1) {
          cut += 1;
        }
      }
    }
    expect(cut).toBeGreaterThan(0);
  });
});
