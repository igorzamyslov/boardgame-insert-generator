// src/viewer/scene.refit.test.ts
// @vitest-environment jsdom
// The camera's refit with the real three.js (only the WebGL renderer is a stand-in): spreading the
// parts apart moves the camera out along its line of sight, and a zoom the person made is kept as
// the same share of the fit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import { fitDistance, modelCorners, modelRadius, ndcOf, outlineTarget } from "./fit";
import type { FitPart } from "./fit";
import type { BoxOutline } from "./types";

const made = vi.hoisted(() => ({ cameras: [] as unknown[], controls: [] as unknown[] }));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
  }
  class PerspectiveCamera extends actual.PerspectiveCamera {
    constructor(...args: ConstructorParameters<typeof actual.PerspectiveCamera>) {
      super(...args);
      made.cameras.push(this);
    }
  }
  return { ...actual, WebGLRenderer, PerspectiveCamera };
});

vi.mock("three/addons/controls/OrbitControls.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three/addons/controls/OrbitControls.js")>();
  class OrbitControls extends actual.OrbitControls {
    constructor(...args: ConstructorParameters<typeof actual.OrbitControls>) {
      super(...args);
      made.controls.push(this);
    }
  }
  return { ...actual, OrbitControls };
});

import { createScene } from "./scene";

afterEach(() => {
  made.cameras.length = 0;
  made.controls.length = 0;
  vi.restoreAllMocks();
});

const OUTLINE: BoxOutline = { min: [0, 0, 0], size: [300, 200, 60] };
const TRAYS = [
  makeTray({ key: "a:p0:0", x: 0, y: 0, z: 0, w: 140, d: 200, h: 30, level: 0 }),
  makeTray({ key: "b:p0:0", x: 150, y: 0, z: 0, w: 150, d: 100, h: 30, level: 0, stack: 1 }),
  makeTray({ key: "c:p0:0", x: 150, y: 0, z: 30, w: 150, d: 100, h: 30, level: 1, stack: 1 }),
];
const mesh = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
};

function setup() {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const canvas = document.createElement("canvas");
  const scene = createScene(canvas);
  scene.resize(800, 500);
  scene.setBox(OUTLINE);
  scene.setTrays(TRAYS.map((spec) => ({ spec, mesh })));
  const camera = made.cameras[0] as import("three").PerspectiveCamera;
  const target = outlineTarget(OUTLINE);
  const distance = (): number =>
    Math.hypot(
      camera.position.x - target[0],
      camera.position.y - target[1],
      camera.position.z - target[2],
    );
  const direction = (): number[] => {
    const d = distance();
    return [
      (camera.position.x - target[0]) / d,
      (camera.position.y - target[1]) / d,
      (camera.position.z - target[2]) / d,
    ];
  };
  return { scene, camera, target, distance, direction };
}

const parts = (): FitPart[] => TRAYS.map((spec) => ({ spec, anchor: spec }));

describe("the camera's refit", () => {
  it("opens at the distance the model needs, in the frame's aspect", () => {
    const { distance } = setup();
    expect(distance()).toBeCloseTo(fitDistance(modelRadius(OUTLINE, parts(), 0), 800 / 500), 6);
  });

  it("moves out as the parts spread apart, along the same line of sight", () => {
    const { scene, distance, direction } = setup();
    const before = direction();
    const d0 = distance();
    scene.setExplode(1);
    expect(distance()).toBeGreaterThan(d0);
    expect(distance()).toBeCloseTo(fitDistance(modelRadius(OUTLINE, parts(), 1), 800 / 500), 6);
    direction().forEach((v, i) => expect(v).toBeCloseTo(before[i] ?? 0, 9));
    // and back in when they come together
    scene.setExplode(0);
    expect(distance()).toBeCloseTo(d0, 6);
  });

  it("keeps a zoom the person made as the same share of the fit across a spread change", () => {
    const { scene, camera, target, distance } = setup();
    const fit0 = distance();
    // the person zooms in to 40% of the fitted distance
    camera.position.set(
      target[0] + (camera.position.x - target[0]) * 0.4,
      target[1] + (camera.position.y - target[1]) * 0.4,
      target[2] + (camera.position.z - target[2]) * 0.4,
    );
    expect(distance() / fit0).toBeCloseTo(0.4, 9);
    scene.setExplode(1);
    const fit1 = fitDistance(modelRadius(OUTLINE, parts(), 1), 800 / 500);
    expect(distance() / fit1).toBeCloseTo(0.4, 6);
    // a resize to a taller frame refits too, with the zoom still the same share
    scene.resize(400, 600);
    const fit2 = fitDistance(modelRadius(OUTLINE, parts(), 1), 400 / 600);
    expect(distance() / fit2).toBeCloseTo(0.4, 6);
  });

  it("does not let the camera pan off the middle of the box: the fit holds for a sphere about it", () => {
    setup();
    const controls = made.controls[0] as { enablePan: boolean };
    expect(controls.enablePan).toBe(false);
  });
});

describe("a tall box in a tall, narrow frame stays inside it, turned any way", () => {
  // the owner's box (101 x 195 x 37 mm) in a frame about as wide as the box is: 101 over 195
  const TALL: BoxOutline = { min: [0, 0, 0], size: [101, 195, 37] };
  const TALL_TRAYS = [
    makeTray({ key: "a:p0:0", x: 0, y: 0, z: 0, w: 101, d: 95, h: 18, level: 0 }),
    makeTray({ key: "b:p0:0", x: 0, y: 100, z: 0, w: 101, d: 95, h: 18, level: 0, stack: 1 }),
    makeTray({ key: "c:p0:0", x: 0, y: 0, z: 18, w: 101, d: 195, h: 18, level: 1 }),
  ];

  it.each([0, 0.5, 1])("at every orbit angle, spread apart %f, with a margin", (spread) => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const scene = createScene(document.createElement("canvas"));
    scene.resize(260, 500);
    scene.setBox(TALL);
    scene.setTrays(TALL_TRAYS.map((spec) => ({ spec, mesh })));
    scene.setExplode(spread);
    const camera = made.cameras[0] as import("three").PerspectiveCamera;
    const controls = made
      .controls[0] as import("three/addons/controls/OrbitControls.js").OrbitControls;
    const target = outlineTarget(TALL);
    const dist = camera.position.distanceTo(controls.target);
    const points = modelCorners(
      TALL,
      TALL_TRAYS.map((spec) => ({ spec, anchor: spec })),
      spread,
    );
    let worst = 0;
    for (let az = 0; az < 360; az += 20) {
      for (let el = -88; el <= 88; el += 11) {
        const a = (az * Math.PI) / 180;
        const e = (el * Math.PI) / 180;
        camera.position.set(
          target[0] + dist * Math.cos(e) * Math.sin(a),
          target[1] - dist * Math.cos(e) * Math.cos(a),
          target[2] + dist * Math.sin(e),
        );
        controls.update();
        camera.updateMatrixWorld();
        for (const p of points) {
          const [x, y] = ndcOf(
            camera.matrixWorldInverse.elements,
            camera.projectionMatrix.elements,
            p,
          );
          worst = Math.max(worst, Math.abs(x), Math.abs(y));
        }
      }
    }
    // inside the frame, with a margin of at least a tenth of its half-size on every side
    expect(worst).toBeLessThanOrEqual(0.9);
  });
});
