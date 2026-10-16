// src/viewer/Viewer.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, fixtureProject, flush, makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { ViewBasis } from "./axes";
import type { SceneFactory, SceneHandle } from "./types";
import { Viewer } from "./Viewer";
import type { ViewerProps } from "./Viewer";
import { WebGLUnavailableError } from "./webgl";

afterEach(cleanup);

function stubScene() {
  let picked: ((key: string | null) => void) | null = null;
  let viewing: ((view: ViewBasis) => void) | null = null;
  const handle: SceneHandle = {
    setBox: vi.fn(),
    setTrays: vi.fn(),
    setExplode: vi.fn(),
    setMaxLevel: vi.fn(),
    setSelected: vi.fn(),
    onPick: vi.fn((cb: (key: string | null) => void) => {
      picked = cb;
    }),
    onView: vi.fn((cb: ((view: ViewBasis) => void) | null) => {
      viewing = cb;
    }),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const factory = vi.fn<SceneFactory>(() => handle);
  return {
    handle,
    factory,
    pick: (key: string | null) => picked?.(key),
    /** The camera turning: what the scene reports to whoever is listening. */
    look: (view: ViewBasis) => viewing?.(view),
    listening: () => viewing !== null,
  };
}

function meshes() {
  const get = vi.fn<MeshSource["get"]>(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }));
  return { get, reset: vi.fn(), forget: vi.fn(), dispose: vi.fn() };
}

/** A well holding something of a component of the cards-heavy fixture. */
function deckWell(contents: string) {
  return {
    x: 1.6,
    y: 1.6,
    w: 10,
    d: 10,
    floorZ: 1.2,
    kind: "well" as const,
    contents,
    features: [],
  };
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
    fireEvent.input(screen.getByLabelText("Spread apart"), { target: { value: "0.5" } });
    expect(scene.handle.setExplode).toHaveBeenLastCalledWith(0.5);
    fireEvent.change(screen.getByLabelText("Show layers"), { target: { value: "0" } });
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(0);
    scene.pick("b:p0:0");
    expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
    view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
    expect(scene.handle.setSelected).toHaveBeenLastCalledWith("b:p0:0");
    expect(screen.getByRole("heading", { name: /^#2 / })).toBeTruthy();
    act(() => {
      view.unmount();
    });
    expect(scene.handle.dispose).toHaveBeenCalled();
  });

  describe("axis indicator", () => {
    /** The camera in front of the box, level: X to the right, Z up, Y away from the viewer. */
    const FRONT: ViewBasis = { right: [1, 0, 0], up: [0, 0, 1], back: [0, -1, 0] };

    it("is off by default: an unchecked toggle with a hint, no indicator, no camera reports", async () => {
      const scene = stubScene();
      render(<Viewer {...props({}, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      const toggle = screen.getByRole("checkbox", { name: "Show axes" }) as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      const hint = document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
      expect(hint?.textContent).toMatch(
        /X runs across the box, Y from its front to its back, Z up/,
      );
      expect(screen.queryByTestId("axis-gizmo")).toBeNull();
      expect(scene.listening()).toBe(false);
    });

    it("sits beside the Spread apart slider", async () => {
      const scene = stubScene();
      render(<Viewer {...props({}, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      const controls = screen.getByLabelText("Spread apart").closest(".viewer-controls");
      expect(controls?.contains(screen.getByRole("checkbox", { name: "Show axes" }))).toBe(true);
    });

    it("shows labelled X, Y and Z axes that follow the camera, and stops listening when turned off", async () => {
      const scene = stubScene();
      render(<Viewer {...props({}, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("checkbox", { name: "Show axes" }));
      expect(scene.listening()).toBe(true);
      // Nothing is drawn before the camera has said which way it looks.
      expect(screen.queryByTestId("axis-gizmo")).toBeNull();
      act(() => scene.look(FRONT));
      const gizmo = screen.getByTestId("axis-gizmo");
      expect(gizmo.getAttribute("aria-label")).toMatch(/^Axis indicator: X \(red\)/);
      const labels = [...gizmo.querySelectorAll("text")].map((t) => t.textContent);
      expect(labels.sort()).toEqual(["X", "Y", "Z"]);
      const tip = (axis: string): { x: number; y: number } => {
        const c = gizmo.querySelector(`g[data-axis="${axis}"] circle`);
        return { x: Number(c?.getAttribute("cx")), y: Number(c?.getAttribute("cy")) };
      };
      // Seen from the front: X goes right, Z goes up (smaller SVG y), Y points into the screen.
      expect(tip("x").x).toBeGreaterThan(42);
      expect(tip("z").y).toBeLessThan(42);
      expect(tip("y")).toEqual({ x: 42, y: 42 });
      // Turned a quarter: X now points at the viewer and Y goes right.
      act(() => scene.look({ right: [0, 1, 0], up: [0, 0, 1], back: [1, 0, 0] }));
      expect(tip("y").x).toBeGreaterThan(42);
      expect(tip("x")).toEqual({ x: 42, y: 42 });
      fireEvent.click(screen.getByRole("checkbox", { name: "Show axes" }));
      expect(scene.listening()).toBe(false);
      expect(screen.queryByTestId("axis-gizmo")).toBeNull();
    });

    it("does not get in the way of picking trays", async () => {
      const scene = stubScene();
      const p = props({}, scene);
      render(<Viewer {...p} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("checkbox", { name: "Show axes" }));
      act(() => scene.look(FRONT));
      // The picking is the scene's, on the canvas: the indicator is not inside it, takes no
      // pointer events (see style.test.ts) and the scene is never told about it.
      const canvas = document.querySelector("canvas");
      expect(canvas?.contains(screen.getByTestId("axis-gizmo"))).toBe(false);
      scene.pick("b:p0:0");
      expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
      expect(scene.handle.setTrays).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole("button", { name: /^Spare \d$/ })).toHaveLength(2);
    });
  });

  it("asks for each part with its short name to engrave, as the instructions name it, unless that is off", async () => {
    const scene = stubScene();
    const m = meshes();
    const components = fixtureProject().components;
    const twoDecks = [
      makeTray({ key: "a:p0:0", level: 0, compartments: [deckWell("Market ×20")] }),
      makeTray({ key: "b:p0:0", level: 1, z: 40, compartments: [deckWell("Objectives ×10")] }),
    ];
    render(<Viewer {...props({ meshes: m, trays: twoDecks, components }, scene)} />);
    await waitFor(() => expect(m.get).toHaveBeenCalledTimes(2));
    expect(m.get.mock.calls.map(([spec]) => [spec.key, spec.partName])).toEqual([
      ["a:p0:0", "Market"],
      ["b:p0:0", "Objectives"],
    ]);
    cleanup();
    const off = meshes();
    const settings = { ...DEFAULT_SETTINGS, engraveNames: false };
    render(<Viewer {...props({ meshes: off, settings, trays: twoDecks, components }, scene)} />);
    await waitFor(() => expect(off.get).toHaveBeenCalledTimes(2));
    expect(off.get.mock.calls.every(([spec]) => spec.partName === undefined)).toBe(true);
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
    act(() => {
      view.unmount();
    });
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

  it("keeps the last built meshes while the layout is stale and rebuilds when it is current", async () => {
    const scene = stubScene();
    const m = meshes();
    const p = props({ meshes: m }, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalledTimes(1));
    expect(m.get).toHaveBeenCalledTimes(2);
    const changed = { ...DEFAULT_SETTINGS, wall: DEFAULT_SETTINGS.wall + 0.4 };
    view.rerender(<Viewer {...p} settings={changed} stale />);
    await flush();
    view.rerender(<Viewer {...p} settings={{ ...changed, wall: changed.wall + 0.2 }} stale />);
    await flush();
    expect(m.get).toHaveBeenCalledTimes(2);
    expect(scene.handle.setTrays).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/shows the last layout/)).toBeTruthy();
    view.rerender(<Viewer {...p} settings={changed} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalledTimes(2));
    expect(m.get).toHaveBeenCalledTimes(4);
    expect(m.get.mock.calls.at(-1)?.[1]).toBe(changed);
    expect(screen.queryByText(/shows the last layout/)).toBeNull();
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

  it("labels the spread slider and describes its value", async () => {
    const scene = stubScene();
    render(<Viewer {...props({}, scene)} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    const slider = screen.getByLabelText("Spread apart") as HTMLInputElement;
    expect(screen.queryByLabelText("Explode")).toBeNull();
    expect(slider.getAttribute("aria-valuetext")).toBe("Together");
    fireEvent.input(slider, { target: { value: "0.5" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("50% apart");
    expect([slider.min, slider.max, slider.step]).toEqual(["0", "1", "0.05"]);
  });

  it("names the layer options by the layers they show", async () => {
    const scene = stubScene();
    const three = [
      makeTray({ key: "a:p0:0", level: 0 }),
      makeTray({ key: "b:p0:0", level: 1, z: 40 }),
      makeTray({ key: "c:p0:0", level: 2, z: 80 }),
    ];
    render(<Viewer {...props({ trays: three }, scene)} />);
    const select = screen.getByLabelText("Show layers") as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["all", "All layers"],
      ["0", "Layer 1 only"],
      ["1", "Layers 1 to 2"],
      ["2", "Layers 1 to 3"],
    ]);
  });

  describe("tray picker", () => {
    const named = [
      makeTray({ key: "a:p0:0", level: 0 }),
      makeTray({
        key: "b:p0:0",
        level: 1,
        z: 40,
        compartments: [
          {
            x: 1.6,
            y: 1.6,
            w: 10,
            d: 10,
            floorZ: 1.2,
            kind: "well",
            contents: "Market ×20",
            features: [],
          },
        ],
      }),
      makeTray({ key: "a:p0:0:spacer", part: "spacer", level: 0, compartments: [] }),
    ];

    it("lists the trays except spacers as toggle buttons and selects on click", () => {
      const scene = stubScene();
      const p = props(
        { trays: named, selectedKey: "b:p0:0", components: fixtureProject().components },
        scene,
      );
      render(<Viewer {...p} />);
      const list = screen.getByRole("list", { name: "Trays" });
      const buttons = [...list.querySelectorAll("button")];
      // named after what they hold, no number in front
      expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
        "Spare by Market",
        "Market",
      ]);
      expect(buttons.map((b) => b.textContent)).toEqual(["Spare by Market", "Market"]);
      expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
      fireEvent.click(buttons[0] as HTMLButtonElement);
      expect(p.onSelect).toHaveBeenLastCalledWith("a:p0:0");
      fireEvent.click(buttons[1] as HTMLButtonElement);
      expect(p.onSelect).toHaveBeenLastCalledWith(null);
    });

    it("tints a tray by its component and marks the others as spare", () => {
      const scene = stubScene();
      const components = fixtureProject().components;
      const { container } = render(<Viewer {...props({ trays: named, components }, scene)} />);
      const chips = [...container.querySelectorAll<HTMLElement>(".tray-picker .tray-chip")];
      expect(chips).toHaveLength(2);
      expect(chips[0]?.classList.contains("tray-chip--spare")).toBe(true);
      expect(chips[0]?.style.getPropertyValue("--tint")).toBe("");
      expect(chips[1]?.classList.contains("tray-chip--spare")).toBe(false);
      expect(chips[1]?.style.getPropertyValue("--tint")).toMatch(/^var\(--tint-\d\)$/);
    });

    it("lists only the trays on the layers shown", async () => {
      const scene = stubScene();
      render(
        <Viewer {...props({ trays: named, components: fixtureProject().components }, scene)} />,
      );
      fireEvent.change(screen.getByLabelText("Show layers"), { target: { value: "0" } });
      const list = screen.getByRole("list", { name: "Trays" });
      expect([...list.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual(
        ["Spare by Market"],
      );
    });
  });

  it("shows the selected tray's details with its position and locks", () => {
    const scene = stubScene();
    const p = props({ selectedKey: "b:p0:0" }, scene);
    render(<Viewer {...p} />);
    const details = screen.getByRole("group", { name: "Selected tray" });
    expect(details.getAttribute("aria-live")).toBe("polite");
    expect(details.textContent).toMatch(/Outer size/);
    expect(details.textContent).toMatch(/Position/);
  });
});
