// src/viewer/Viewer.view.test.tsx
// @vitest-environment jsdom
// The projection toggle and the camera that comes back: what the Viewer asks of the scene, with a
// stand-in scene that holds a view as the real one does.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { SceneFactory, SceneHandle } from "./types";
import { loadProjection, viewMemory } from "./view";
import type { ViewState } from "./view";
import { Viewer } from "./Viewer";
import type { ViewerProps } from "./Viewer";

beforeEach(() => {
  localStorage.clear();
  viewMemory.clear();
});
afterEach(cleanup);

const TURNED: ViewState = {
  direction: [0.6, -0.6, 0.529],
  share: 0.7,
  zoom: 1,
  projection: "perspective",
  boxRadius: 1,
  explode: 0.4,
};

/** A scene that keeps a view: it opens at `opening`, and accepts `setView` when `accepts`. */
function viewScene(accepts = true) {
  const state = {
    view: { ...TURNED, direction: [0, -0.74, 0.67], share: 1, explode: 0 } as ViewState,
  };
  const handle: SceneHandle = {
    setBox: vi.fn(),
    setTrays: vi.fn(),
    setExplode: vi.fn((f: number) => {
      state.view = { ...state.view, explode: f };
    }),
    setMaxLevel: vi.fn(),
    setSelected: vi.fn(),
    setLit: vi.fn(),
    setReserved: vi.fn(),
    onPick: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    setProjection: vi.fn((projection) => {
      state.view = { ...state.view, projection };
    }),
    getView: vi.fn(() => state.view),
    setView: vi.fn((v: ViewState) => {
      if (accepts) {
        state.view = v;
      }
      return accepts;
    }),
    resetView: vi.fn(() => {
      state.view = { ...state.view, direction: [0, -0.74, 0.67], share: 1, zoom: 1 };
    }),
  };
  return { handle, state, factory: vi.fn<SceneFactory>(() => handle) };
}

function props(scene: ReturnType<typeof viewScene>, over: Partial<ViewerProps> = {}): ViewerProps {
  const meshes: MeshSource = {
    get: vi.fn(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 })),
    reset: vi.fn(),
    forget: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    trays: [makeTray({ key: "a:p0:0" })],
    box: DEFAULT_BOX,
    settings: DEFAULT_SETTINGS,
    meshes,
    selectedKey: null,
    onSelect: vi.fn(),
    webgl: () => true,
    loadScene: () => Promise.resolve(scene.factory),
    projectId: "p1",
    ...over,
  };
}

const pressed = (name: string): boolean =>
  (screen.getByRole("button", { name }) as HTMLButtonElement).getAttribute("aria-pressed") ===
  "true";

describe("the projection toggle", () => {
  it("is in the caption row beside Spread apart, and opens in perspective", async () => {
    const scene = viewScene();
    render(<Viewer {...props(scene)} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    const row = document.querySelector(".plan-caption--3d");
    expect(row?.contains(screen.getByRole("group", { name: "Projection" }))).toBe(true);
    expect(row?.contains(screen.getByLabelText("Spread apart"))).toBe(true);
    expect(pressed("Perspective")).toBe(true);
    expect(pressed("Orthographic")).toBe(false);
    expect(scene.handle.setProjection).toHaveBeenLastCalledWith("perspective");
  });

  it("asks the scene for the other camera and keeps the choice for this browser", async () => {
    const scene = viewScene();
    render(<Viewer {...props(scene)} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Orthographic" }));
    expect(scene.handle.setProjection).toHaveBeenLastCalledWith("orthographic");
    expect(pressed("Orthographic")).toBe(true);
    expect(loadProjection()).toBe("orthographic");
    expect(localStorage.getItem("insert-generator:view-projection")).toBe("orthographic");
    fireEvent.click(screen.getByRole("button", { name: "Perspective" }));
    expect(loadProjection()).toBe("perspective");
  });

  it("opens in the projection this browser chose", async () => {
    localStorage.setItem("insert-generator:view-projection", "orthographic");
    const scene = viewScene();
    render(<Viewer {...props(scene)} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(pressed("Orthographic")).toBe(true);
    expect(scene.handle.setProjection).toHaveBeenLastCalledWith("orthographic");
  });

  it("works with storage that throws", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const scene = viewScene();
    render(<Viewer {...props(scene)} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(pressed("Perspective")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Orthographic" }));
    expect(pressed("Orthographic")).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });
});

describe("the camera that comes back", () => {
  it("keeps the view as the viewer leaves, and puts it back when it returns for the same project", async () => {
    const first = viewScene();
    const view = render(<Viewer {...props(first)} />);
    await waitFor(() => expect(first.handle.setTrays).toHaveBeenCalled());
    first.state.view = { ...TURNED, projection: "orthographic" };
    view.unmount();
    await waitFor(() => expect(viewMemory.get("p1")?.direction).toEqual(TURNED.direction));

    const second = viewScene();
    render(<Viewer {...props(second)} />);
    await waitFor(() => expect(second.handle.setView).toHaveBeenCalled());
    expect(second.handle.setView).toHaveBeenCalledWith(
      expect.objectContaining({ direction: TURNED.direction, projection: "orthographic" }),
    );
    // the spread and the projection come back with it
    await waitFor(() => expect(second.handle.setExplode).toHaveBeenLastCalledWith(0.4));
    expect(pressed("Orthographic")).toBe(true);
    expect(second.handle.setProjection).toHaveBeenLastCalledWith("orthographic");
    // the box is framed first, then the camera put back
    const [box] = vi.mocked(second.handle.setBox).mock.invocationCallOrder;
    const [put] = vi.mocked(second.handle.setView ?? vi.fn()).mock.invocationCallOrder;
    expect(box).toBeLessThan(put ?? 0);
  });

  it("opens another project's view fresh, and the slot holds one project's camera", async () => {
    viewMemory.set("p1", TURNED);
    const scene = viewScene();
    render(<Viewer {...props(scene, { projectId: "p2" })} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(scene.handle.setView).not.toHaveBeenCalled();
    expect(pressed("Perspective")).toBe(true);
    viewMemory.set("p2", TURNED);
    expect(viewMemory.get("p1")).toBeUndefined();
  });

  it("leaves the camera at its opening place when the scene says the box is too different", async () => {
    viewMemory.set("p1", { ...TURNED, projection: "orthographic", explode: 0.4 });
    const scene = viewScene(false);
    render(<Viewer {...props(scene)} />);
    await waitFor(() => expect(scene.handle.setView).toHaveBeenCalled());
    expect(pressed("Perspective")).toBe(true);
    expect(scene.handle.setExplode).not.toHaveBeenCalledWith(0.4);
  });

  it("puts the view back once per scene, not on every change of the box", async () => {
    viewMemory.set("p1", TURNED);
    const scene = viewScene();
    const p = props(scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setView).toHaveBeenCalledTimes(1));
    view.rerender(
      <Viewer {...p} box={{ ...DEFAULT_BOX, innerWidth: DEFAULT_BOX.innerWidth + 10 }} />,
    );
    await waitFor(() => expect(scene.handle.setBox).toHaveBeenCalledTimes(2));
    expect(scene.handle.setView).toHaveBeenCalledTimes(1);
  });

  it("remembers nothing without a project id", async () => {
    const scene = viewScene();
    const view = render(<Viewer {...props(scene, { projectId: undefined })} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    view.unmount();
    expect(viewMemory.get(undefined)).toBeUndefined();
  });
});

describe("Reset view", () => {
  it("turns the camera back to where the view opens, and nothing else", async () => {
    const scene = viewScene();
    render(<Viewer {...props(scene)} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    fireEvent.input(screen.getByLabelText("Spread apart"), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(scene.handle.resetView).toHaveBeenCalledTimes(1);
    expect(scene.handle.setExplode).toHaveBeenLastCalledWith(0.5);
  });
});
