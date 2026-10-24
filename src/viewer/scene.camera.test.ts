// src/viewer/scene.camera.test.ts
// @vitest-environment jsdom
// The two cameras and the remembered view, with the real three.js (only the WebGL renderer is a
// stand-in): the projection switch keeps the apparent size, the orthographic frame follows the
// model, a click picks through either camera, and a view can be read and put back.
import type { OrthographicCamera, PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTray } from "../app/test-helpers";
import { boxRadius, modelRadius, orthoHalfHeight, outlineTarget } from "./fit";
import type { FitPart } from "./fit";
import type { BoxOutline } from "./types";

const made = vi.hoisted(() => ({ controls: [] as unknown[] }));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
  }
  return { ...actual, WebGLRenderer };
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
  made.controls.length = 0;
  vi.restoreAllMocks();
});

const OUTLINE: BoxOutline = { min: [0, 0, 0], size: [300, 200, 60] };
const TRAYS = [makeTray({ key: "a:p0:0", x: 0, y: 0, z: 0, w: 300, d: 200, h: 30, level: 0 })];
// A triangle across the middle of the box at the height of the tray's top: a click at the middle hits it.
const mesh = {
  positions: new Float32Array([0, 0, 30, 300, 0, 30, 150, 200, 30]),
  indices: new Uint32Array([0, 1, 2]),
};

type Controls = import("three/addons/controls/OrbitControls.js").OrbitControls;

function setup(outline: BoxOutline = OUTLINE) {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 500);
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  const scene = createScene(canvas);
  const controls = made.controls[made.controls.length - 1] as Controls;
  scene.resize(800, 500);
  scene.setBox(outline);
  scene.setTrays(TRAYS.map((spec) => ({ spec, mesh })));
  const camera = (): PerspectiveCamera | OrthographicCamera =>
    controls.object as PerspectiveCamera | OrthographicCamera;
  const distance = (): number => camera().position.distanceTo(controls.target);
  return { scene, canvas, controls, camera, distance };
}

const parts = (): FitPart[] => TRAYS.map((spec) => ({ spec, anchor: spec }));
const view = (s: ReturnType<typeof setup>) => s.scene.getView?.();

describe("the projection", () => {
  it("starts in perspective and switches to an orthographic camera and back", () => {
    const s = setup();
    expect((s.camera() as PerspectiveCamera).isPerspectiveCamera).toBe(true);
    s.scene.setProjection?.("orthographic");
    expect((s.camera() as OrthographicCamera).isOrthographicCamera).toBe(true);
    expect(view(s)?.projection).toBe("orthographic");
    s.scene.setProjection?.("perspective");
    expect((s.camera() as PerspectiveCamera).isPerspectiveCamera).toBe(true);
  });

  it("keeps the side the camera looks from and the apparent size across a switch", () => {
    const s = setup();
    const before = view(s);
    const opened = s.distance();
    // the person zooms in to half the distance
    (s.camera() as PerspectiveCamera).position
      .sub(s.controls.target)
      .multiplyScalar(0.5)
      .add(s.controls.target);
    s.controls.update();
    const zoomed = view(s);
    expect(zoomed?.share).toBeCloseTo(0.5, 6);
    s.scene.setProjection?.("orthographic");
    const ortho = view(s);
    // an orthographic camera is zoomed by 1 / share, and its direction is the same
    expect(ortho?.zoom).toBeCloseTo(2, 6);
    ortho?.direction.forEach((v, i) => expect(v).toBeCloseTo(before?.direction[i] ?? 0, 6));
    s.scene.setProjection?.("perspective");
    expect(view(s)?.share).toBeCloseTo(0.5, 6);
    expect(s.distance()).toBeCloseTo(0.5 * opened, 6);
  });

  it("frames the model in an orthographic box that is the sphere's size, the narrower side first", () => {
    const s = setup();
    s.scene.setProjection?.("orthographic");
    const cam = s.camera() as OrthographicCamera;
    const radius = modelRadius(OUTLINE, parts(), 0);
    expect(cam.top).toBeCloseTo(orthoHalfHeight(radius, 800 / 500), 6);
    expect(cam.right / cam.top).toBeCloseTo(800 / 500, 6);
    // a tall frame: the width is the narrower side, so the height is the radius over the aspect
    s.scene.resize(400, 800);
    expect(cam.top).toBeCloseTo(orthoHalfHeight(radius, 400 / 800), 6);
    expect(cam.right).toBeCloseTo(radius * 1.12, 6);
    // spread apart: the box grows with the model, and the person's zoom stays
    s.scene.resize(800, 500);
    cam.zoom = 1.5;
    s.scene.setExplode(1);
    expect(cam.top).toBeCloseTo(orthoHalfHeight(modelRadius(OUTLINE, parts(), 1), 800 / 500), 6);
    expect(cam.zoom).toBe(1.5);
  });

  it("picks a tray through either camera", () => {
    for (const projection of ["perspective", "orthographic"] as const) {
      const s = setup();
      s.scene.setProjection?.(projection);
      const picked = vi.fn();
      s.scene.onPick(picked);
      s.canvas.dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, isPrimary: true, clientX: 400, clientY: 250 }),
      );
      s.canvas.dispatchEvent(
        new PointerEvent("pointerup", { button: 0, isPrimary: true, clientX: 400, clientY: 250 }),
      );
      expect(picked, projection).toHaveBeenCalledWith("a:p0:0");
      // and the far corner of the frame is no tray
      s.canvas.dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, isPrimary: true, clientX: 2, clientY: 2 }),
      );
      s.canvas.dispatchEvent(
        new PointerEvent("pointerup", { button: 0, isPrimary: true, clientX: 2, clientY: 2 }),
      );
      expect(picked, projection).toHaveBeenLastCalledWith(null);
    }
  });
});

describe("the remembered view", () => {
  function turned(s: ReturnType<typeof setup>): void {
    // turned to the right and in a little, as a person drags and scrolls
    const cam = s.camera();
    const t = s.controls.target;
    cam.position.set(t.x + 220, t.y - 120, t.z + 150);
    s.controls.update();
  }

  it("reads the camera as a direction and a share of the fit, and puts it back on a new scene", () => {
    const first = setup();
    turned(first);
    first.scene.setProjection?.("orthographic");
    first.scene.setExplode(0.5);
    const saved = view(first);
    expect(saved?.projection).toBe("orthographic");
    expect(saved?.explode).toBe(0.5);
    expect(saved?.boxRadius).toBeCloseTo(boxRadius(OUTLINE), 6);
    first.scene.dispose();

    const second = setup();
    expect(second.scene.setView?.(saved as NonNullable<typeof saved>)).toBe(true);
    const back = view(second);
    expect(back?.projection).toBe("orthographic");
    back?.direction.forEach((v, i) => expect(v).toBeCloseTo(saved?.direction[i] ?? 0, 6));
    expect(back?.zoom).toBeCloseTo(saved?.zoom ?? 0, 6);
  });

  it("does not put a view back on a box of another size, and leaves the camera where it is", () => {
    const first = setup();
    turned(first);
    const saved = view(first) as NonNullable<ReturnType<typeof view>>;
    const big: BoxOutline = { min: [0, 0, 0], size: [600, 400, 120] };
    const second = setup(big);
    const opening = view(second);
    expect(second.scene.setView?.(saved)).toBe(false);
    expect(view(second)?.direction).toEqual(opening?.direction);
  });

  it("keeps the turn when the box changes a little, and starts again when it changes a lot", () => {
    const s = setup();
    turned(s);
    const before = view(s);
    s.scene.setBox({ min: [0, 0, 0], size: [330, 220, 66] });
    view(s)?.direction.forEach((v, i) => expect(v).toBeCloseTo(before?.direction[i] ?? 0, 6));
    expect(view(s)?.share).toBeCloseTo(before?.share ?? 0, 6);
    s.scene.setBox({ min: [0, 0, 0], size: [660, 440, 132] });
    const fresh = setup();
    view(s)?.direction.forEach((v, i) => expect(v).toBeCloseTo(view(fresh)?.direction[i] ?? 0, 6));
    expect(view(s)?.share).toBeCloseTo(1, 6);
  });

  it("resets to the opening view at the fit and keeps the projection", () => {
    const s = setup();
    const opening = view(s);
    turned(s);
    s.scene.setProjection?.("orthographic");
    (s.camera() as OrthographicCamera).zoom = 3;
    s.scene.resetView?.();
    const now = view(s);
    expect(now?.projection).toBe("orthographic");
    expect(now?.zoom).toBe(1);
    expect(now?.share).toBeCloseTo(1, 6);
    now?.direction.forEach((v, i) => expect(v).toBeCloseTo(opening?.direction[i] ?? 0, 6));
    s.controls.target
      .toArray()
      .forEach((v, i) => expect(v).toBeCloseTo(outlineTarget(OUTLINE)[i] ?? 0, 6));
  });
});
