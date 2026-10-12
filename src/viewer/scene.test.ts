// @vitest-environment jsdom
// three is replaced by stand-ins: jsdom has no WebGL, so this checks the renderer's life cycle and
// the click handling, not the drawing.
import { afterEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  renderers: [] as {
    dispose: ReturnType<typeof vi.fn>;
    forceContextLoss: ReturnType<typeof vi.fn>;
  }[],
  failRenderer: false,
  failControls: false,
}));

vi.mock("three", () => {
  const deep = (): unknown =>
    new Proxy(vi.fn(), {
      get: (_t, p) => (p === "then" ? undefined : deep()),
      apply: () => deep(),
    });
  // A constructor that yields a stand-in answering every property and call with another one.
  const stand = () =>
    vi.fn(function () {
      return deep();
    });
  class WebGLRenderer {
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    constructor() {
      if (fake.failRenderer) {
        throw new Error("Error creating WebGL context.");
      }
      fake.renderers.push(this);
    }
  }
  class Raycaster {
    setFromCamera = vi.fn();
    intersectObjects = vi.fn(() => []);
  }
  return {
    AmbientLight: stand(),
    BoxGeometry: stand(),
    BufferAttribute: stand(),
    BufferGeometry: stand(),
    Color: stand(),
    DirectionalLight: stand(),
    EdgesGeometry: stand(),
    LineBasicMaterial: stand(),
    LineSegments: stand(),
    Mesh: stand(),
    MeshStandardMaterial: stand(),
    PerspectiveCamera: stand(),
    Scene: stand(),
    Vector2: stand(),
    Raycaster,
    WebGLRenderer,
  };
});

vi.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    target = { set: vi.fn() };
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
    constructor() {
      if (fake.failControls) {
        throw new Error("controls broke");
      }
    }
  },
}));

import { createScene } from "./scene";
import { WebGLUnavailableError } from "./webgl";

afterEach(() => {
  fake.renderers.length = 0;
  fake.failRenderer = false;
  fake.failControls = false;
});

function pointer(type: string, init: PointerEventInit = {}): Event {
  return new PointerEvent(type, { clientX: 10, clientY: 10, isPrimary: true, ...init });
}

describe("createScene", () => {
  it("releases the WebGL context after disposing the renderer", () => {
    const handle = createScene(document.createElement("canvas"));
    const r = fake.renderers[0];
    expect(r).toBeDefined();
    handle.dispose();
    expect(r?.dispose).toHaveBeenCalledTimes(1);
    expect(r?.forceContextLoss).toHaveBeenCalledTimes(1);
    const disposed = r?.dispose.mock.invocationCallOrder[0] ?? Infinity;
    const lost = r?.forceContextLoss.mock.invocationCallOrder[0] ?? 0;
    expect(disposed).toBeLessThan(lost);
  });

  it("reports a missing WebGL context as WebGLUnavailableError", () => {
    fake.failRenderer = true;
    expect(() => createScene(document.createElement("canvas"))).toThrow(WebGLUnavailableError);
  });

  it("releases the renderer when the rest of the setup fails", () => {
    fake.failControls = true;
    expect(() => createScene(document.createElement("canvas"))).toThrow("controls broke");
    const r = fake.renderers[0];
    expect(r?.dispose).toHaveBeenCalledTimes(1);
    expect(r?.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  describe("picking", () => {
    function setup() {
      const canvas = document.createElement("canvas");
      const handle = createScene(canvas);
      const cb = vi.fn();
      handle.onPick(cb);
      return { canvas, cb };
    }

    it("picks on a primary-button click", () => {
      const { canvas, cb } = setup();
      canvas.dispatchEvent(pointer("pointerdown", { button: 0 }));
      canvas.dispatchEvent(pointer("pointerup", { button: 0 }));
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(null);
    });

    it("ignores other buttons and non-primary pointers", () => {
      const { canvas, cb } = setup();
      canvas.dispatchEvent(pointer("pointerdown", { button: 2 }));
      canvas.dispatchEvent(pointer("pointerup", { button: 2 }));
      canvas.dispatchEvent(pointer("pointerdown", { button: 0, isPrimary: false }));
      canvas.dispatchEvent(pointer("pointerup", { button: 0, isPrimary: false }));
      expect(cb).not.toHaveBeenCalled();
    });

    it("forgets a press that was cancelled", () => {
      const { canvas, cb } = setup();
      canvas.dispatchEvent(pointer("pointerdown", { button: 0 }));
      canvas.dispatchEvent(pointer("pointercancel"));
      canvas.dispatchEvent(pointer("pointerup", { button: 0 }));
      expect(cb).not.toHaveBeenCalled();
    });

    it("does not pick after a drag", () => {
      const { canvas, cb } = setup();
      canvas.dispatchEvent(pointer("pointerdown", { button: 0 }));
      canvas.dispatchEvent(pointer("pointerup", { button: 0, clientX: 40 }));
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
