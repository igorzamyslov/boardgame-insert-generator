// src/viewer/Viewer.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, flush, makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { SceneFactory, SceneHandle } from "./types";
import { Viewer } from "./Viewer";
import type { ViewerProps } from "./Viewer";
import { WebGLUnavailableError } from "./webgl";

afterEach(cleanup);

function stubScene() {
  let picked: ((key: string | null) => void) | null = null;
  const handle: SceneHandle = {
    setBox: vi.fn(),
    setTrays: vi.fn(),
    setExplode: vi.fn(),
    setMaxLevel: vi.fn(),
    setSelected: vi.fn(),
    onPick: vi.fn((cb: (key: string | null) => void) => {
      picked = cb;
    }),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const factory = vi.fn<SceneFactory>(() => handle);
  return { handle, factory, pick: (key: string | null) => picked?.(key) };
}

function meshes() {
  const get = vi.fn<MeshSource["get"]>(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }));
  return { get, reset: vi.fn(), forget: vi.fn(), dispose: vi.fn() };
}

const trays = [
  makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
  makeTray({ key: "b:p0:0", stack: 0, level: 1, z: 40 }),
];

function props(over: Partial<ViewerProps>, scene: ReturnType<typeof stubScene>): ViewerProps {
  return {
    trays,
    box: DEFAULT_BOX,
    settings: DEFAULT_SETTINGS,
    meshes: meshes(),
    selectedKey: null,
    lockedKeys: new Set(),
    onSelect: vi.fn(),
    webgl: () => true,
    loadScene: () => Promise.resolve(scene.factory),
    ...over,
  };
}

describe("Viewer", () => {
  it("shows a message without WebGL and never loads three", async () => {
    const scene = stubScene();
    const loadScene = vi.fn(() => Promise.resolve(scene.factory));
    render(<Viewer {...props({ webgl: () => false, loadScene }, scene)} />);
    expect(screen.getByRole("note").textContent).toMatch(/needs WebGL/);
    await flush();
    expect(loadScene).not.toHaveBeenCalled();
    expect(scene.factory).not.toHaveBeenCalled();
  });

  it("falls back when the browser has no WebGL context for the renderer", async () => {
    const scene = stubScene();
    const broken = vi.fn<SceneFactory>(() => {
      throw new WebGLUnavailableError("Error creating WebGL context");
    });
    render(<Viewer {...props({ loadScene: () => Promise.resolve(broken) }, scene)} />);
    await waitFor(() => expect(screen.getByRole("note").textContent).toMatch(/needs WebGL/));
  });

  it("shows a generic error, not the WebGL message, for other scene failures, and retries", async () => {
    const scene = stubScene();
    let calls = 0;
    const flaky = vi.fn<SceneFactory>((canvas) => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError("controls broke");
      }
      return scene.factory(canvas);
    });
    render(<Viewer {...props({ loadScene: () => Promise.resolve(flaky) }, scene)} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't show/));
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loads the scene, builds meshes and wires the controls", async () => {
    const scene = stubScene();
    const p = props({}, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0]).toHaveLength(2);
    expect(scene.handle.setBox).toHaveBeenCalled();
    fireEvent.input(screen.getByLabelText("Explode"), { target: { value: "0.5" } });
    expect(scene.handle.setExplode).toHaveBeenLastCalledWith(0.5);
    fireEvent.change(screen.getByLabelText("Show layers"), { target: { value: "0" } });
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(0);
    scene.pick("b:p0:0");
    expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
    view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
    expect(scene.handle.setSelected).toHaveBeenLastCalledWith("b:p0:0");
    expect(screen.getByRole("heading", { name: /^#2 / })).toBeTruthy();
    view.unmount();
    expect(scene.handle.dispose).toHaveBeenCalled();
  });

  it("reports parts that could not be built and retries", async () => {
    const scene = stubScene();
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new Error("bad"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }),
    );
    render(<Viewer {...props({ meshes: m }, scene)} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/1 part\(s\) couldn't be shown/),
    );
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(m.reset).toHaveBeenCalled();
    await waitFor(() =>
      expect(vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0]).toHaveLength(2),
    );
  });

  it("passes an abort signal to every build and aborts it on a trays change and on unmount", async () => {
    const scene = stubScene();
    const signals: (AbortSignal | undefined)[] = [];
    const m = meshes();
    m.get.mockImplementation((_spec, _settings, signal) => {
      signals.push(signal);
      return Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 });
    });
    const p = props({ meshes: m }, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(signals).toHaveLength(2));
    for (const s of signals) {
      expect(s).toBeInstanceOf(AbortSignal);
      expect(s?.aborted).toBe(false);
    }
    view.rerender(<Viewer {...p} trays={[makeTray({ key: "z:p0:0" })]} />);
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[2]?.aborted).toBe(false);
    view.unmount();
    expect(signals[2]?.aborted).toBe(true);
  });

  it("ignores meshes of an older trays list that resolve after a newer one", async () => {
    const scene = stubScene();
    const pending: { key: string; resolve: () => void }[] = [];
    const m = meshes();
    m.get.mockImplementation(
      (spec) =>
        new Promise((resolve) => {
          pending.push({
            key: spec.key,
            resolve: () => resolve({ mesh: cubeMesh(), volumeMm3: 1 }),
          });
        }),
    );
    const p = props({ meshes: m }, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(pending).toHaveLength(2));
    view.rerender(<Viewer {...p} trays={[makeTray({ key: "z:p0:0" })]} />);
    await waitFor(() => expect(pending).toHaveLength(3));
    pending[2]?.resolve();
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalledTimes(1));
    pending[0]?.resolve();
    pending[1]?.resolve();
    await flush();
    expect(scene.handle.setTrays).toHaveBeenCalledTimes(1);
    const shown = vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0] ?? [];
    expect(shown.map((t) => t.spec.key)).toEqual(["z:p0:0"]);
  });

  it("re-fits the camera only when the box outline changes, not on other settings", async () => {
    const scene = stubScene();
    const p = props({}, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setBox).toHaveBeenCalledTimes(1));
    view.rerender(
      <Viewer {...p} settings={{ ...DEFAULT_SETTINGS, wall: DEFAULT_SETTINGS.wall + 0.4 }} />,
    );
    await flush();
    expect(scene.handle.setBox).toHaveBeenCalledTimes(1);
    view.rerender(
      <Viewer {...p} box={{ ...DEFAULT_BOX, innerWidth: DEFAULT_BOX.innerWidth + 10 }} />,
    );
    await waitFor(() => expect(scene.handle.setBox).toHaveBeenCalledTimes(2));
  });

  it("falls back to all layers when the chosen layer no longer exists", async () => {
    const scene = stubScene();
    const p = props({}, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Show layers"), { target: { value: "1" } });
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(1);
    view.rerender(<Viewer {...p} trays={[makeTray({ key: "a:p0:0", level: 0 })]} />);
    await waitFor(() => expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(null));
    expect(screen.queryByLabelText("Show layers")).toBeNull();
    view.rerender(<Viewer {...p} />);
    expect((screen.getByLabelText("Show layers") as HTMLSelectElement).value).toBe("all");
  });

  it("reports a scene that fails while showing trays", async () => {
    const scene = stubScene();
    vi.mocked(scene.handle.setTrays).mockImplementation(() => {
      throw new Error("GL error");
    });
    render(<Viewer {...props({}, scene)} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn't show/));
    expect(scene.handle.dispose).toHaveBeenCalled();
  });

  it("offers a retry after the graphics context is lost", async () => {
    const scene = stubScene();
    const view = render(<Viewer {...props({}, scene)} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    const canvas = view.container.querySelector("canvas");
    expect(canvas).toBeTruthy();
    fireEvent(canvas as HTMLCanvasElement, new Event("webglcontextlost", { cancelable: true }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/context was lost/));
    expect(scene.handle.dispose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(scene.factory).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
