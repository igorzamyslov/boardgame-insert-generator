// src/viewer/Viewer.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { SceneFactory, SceneHandle } from "./types";
import { Viewer } from "./Viewer";
import type { ViewerProps } from "./Viewer";

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
  return { get, reset: vi.fn(), dispose: vi.fn() };
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
  it("shows a message without WebGL and never loads three", () => {
    const scene = stubScene();
    render(<Viewer {...props({ webgl: () => false }, scene)} />);
    expect(screen.getByRole("note").textContent).toMatch(/needs WebGL/);
    expect(scene.factory).not.toHaveBeenCalled();
  });

  it("falls back when creating the renderer throws", async () => {
    const scene = stubScene();
    const broken = vi.fn<SceneFactory>(() => {
      throw new Error("Error creating WebGL context");
    });
    render(<Viewer {...props({ loadScene: () => Promise.resolve(broken) }, scene)} />);
    await waitFor(() => expect(screen.getByRole("note").textContent).toMatch(/needs WebGL/));
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
});
