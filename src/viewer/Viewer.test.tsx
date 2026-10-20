// src/viewer/Viewer.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, fixtureProject, flush, makeTray } from "../app/test-helpers";
import { DEFAULT_BOX } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import { GROUP_SHADE, SPACER_SHADE, shadeHex } from "../ui/identity";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import type { Component } from "../model/types";
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
    setLit: vi.fn(),
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
    onSelect: vi.fn(),
    webgl: () => true,
    loadScene: () => Promise.resolve(scene.factory),
    ...over,
  };
}

describe("Viewer", () => {
  it("explains when WebGL is missing", async () => {
    const scene = stubScene();
    const loadScene = vi.fn(() => Promise.resolve(scene.factory));
    render(<Viewer {...props({ webgl: () => false, loadScene }, scene)} />);
    expect(screen.getByRole("note").textContent).toBe(
      "3D needs WebGL turned on. The top view works the same.",
    );
    // a missing WebGL is not an error to retry: the page says what to do
    expect(screen.queryByRole("alert")).toBeNull();
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
    await waitFor(() =>
      expect(screen.getByRole("note").textContent).toBe(
        "3D needs WebGL turned on. The top view works the same.",
      ),
    );
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
    view.rerender(<Viewer {...p} topLayer={0} />);
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(0);
    view.rerender(<Viewer {...p} topLayer={null} />);
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(null);
    scene.pick("b:p0:0");
    expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
    view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
    expect(scene.handle.setSelected).toHaveBeenLastCalledWith("b:p0:0");
    act(() => {
      view.unmount();
    });
    expect(scene.handle.dispose).toHaveBeenCalled();
  });

  describe("axis indicator", () => {
    /** The camera in front of the box, level: X to the right, Z up, Y away from the viewer. */
    const FRONT: ViewBasis = { right: [1, 0, 0], up: [0, 0, 1], back: [0, -1, 0] };

    it("is off by default: an unpressed toggle with a hint, no indicator, no camera reports", async () => {
      const scene = stubScene();
      render(<Viewer {...props({}, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      const toggle = screen.getByRole("button", { name: "Show axes" });
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      const hint = document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
      expect(hint?.textContent).toMatch(
        /X runs across the box, Y from its front to its back, Z up/,
      );
      expect(screen.queryByTestId("axis-gizmo")).toBeNull();
      expect(scene.listening()).toBe(false);
    });

    it("sits in the corner of the view, not among the controls below it", async () => {
      const scene = stubScene();
      render(<Viewer {...props({}, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      const toggle = screen.getByRole("button", { name: "Show axes" });
      expect(toggle.closest(".viewer-stage")).toBeTruthy();
      expect(toggle.closest(".viewer-controls")).toBeNull();
      expect(toggle.classList.contains("viewer-axes-toggle")).toBe(true);
    });

    it("is pressed while the axes show", async () => {
      const scene = stubScene();
      render(<Viewer {...props({}, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      const toggle = screen.getByRole("button", { name: "Show axes" });
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });

    it("shows labelled X, Y and Z axes that follow the camera, and stops listening when turned off", async () => {
      const scene = stubScene();
      render(<Viewer {...props({}, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("button", { name: "Show axes" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Show axes" }));
      expect(scene.listening()).toBe(false);
      expect(screen.queryByTestId("axis-gizmo")).toBeNull();
    });

    it("does not get in the way of picking trays", async () => {
      const scene = stubScene();
      const p = props({}, scene);
      render(<Viewer {...p} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("button", { name: "Show axes" }));
      act(() => scene.look(FRONT));
      // The picking is the scene's, on the canvas: the indicator is not inside it, takes no
      // pointer events (see style.test.ts) and the scene is never told about it.
      const canvas = document.querySelector("canvas");
      expect(canvas?.contains(screen.getByTestId("axis-gizmo"))).toBe(false);
      scene.pick("b:p0:0");
      expect(p.onSelect).toHaveBeenCalledWith("b:p0:0");
      expect(scene.handle.setTrays).toHaveBeenCalledTimes(1);
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

  describe("a group's trays", () => {
    const [deck, , objectives] = fixtureProject().components as [Component, Component, Component];
    const inKit = (n: number) =>
      makeTray({
        key: `kit:p${n}:0`,
        level: 0,
        compartments: [
          { ...deckWell("x"), contents: `${deck.name} ×20`, componentId: deck.id },
          { ...deckWell("x"), contents: `${objectives.name} ×10`, componentId: objectives.id },
        ],
      });
    const kit = {
      id: "kit",
      name: "Player kit",
      copies: 2,
      access: "often" as const,
      memberIds: [deck.id, objectives.id],
    };
    const own = makeTray({ key: "own:p0:0", level: 0, compartments: [deckWell("Market ×20")] });
    const base = { components: fixtureProject().components, groups: [kit] };

    it("takes the neutral body colour of the group, and an ungrouped tray its kind's shade", async () => {
      const scene = stubScene();
      render(<Viewer {...props({ ...base, trays: [inKit(0), inKit(1), own] }, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      const shown = vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0] ?? [];
      const got = Object.fromEntries(shown.map((t) => [t.spec.key, t.color]));
      expect(got["kit:p0:0"]).toBe(GROUP_SHADE.light.fill);
      expect(got["kit:p1:0"]).toBe(GROUP_SHADE.light.fill);
      expect(got["own:p0:0"]).toBe(shadeHex("cards", 1, "light").fill);
    });

    it("names the selected tray by the group and its copy", () => {
      const scene = stubScene();
      const view = render(
        <Viewer
          {...props({ ...base, trays: [inKit(0), inKit(1)], selectedKey: "kit:p1:0" }, scene)}
        />,
      );
      expect(view.container.querySelector(".viewer-selection")?.textContent).toBe("Player kit 2");
    });

    it("engraves each copy with the group's short name and its copy, as the packing guide names it", async () => {
      const scene = stubScene();
      const m = meshes();
      render(<Viewer {...props({ ...base, meshes: m, trays: [inKit(0), inKit(1)] }, scene)} />);
      await waitFor(() => expect(m.get).toHaveBeenCalledTimes(2));
      const engraved = m.get.mock.calls.map(([spec]) => spec.partName);
      expect(engraved).toHaveLength(2);
      expect(engraved.every((n) => typeof n === "string" && n.startsWith("Player"))).toBe(true);
      expect(new Set(engraved).size).toBe(2);
      expect(engraved.every((n) => (n ?? "").length <= 10)).toBe(true);
    });
  });

  it("reports trays that could not be built and retries", async () => {
    const scene = stubScene();
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new Error("bad"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }),
    );
    render(<Viewer {...props({ meshes: m }, scene)} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/^1 tray couldn't be shown/),
    );
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(m.reset).toHaveBeenCalled();
    await waitFor(() =>
      expect(vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0]).toHaveLength(2),
    );
  });

  it("counts the trays that could not be built in words, one or several", async () => {
    const scene = stubScene();
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("bad")));
    render(<Viewer {...props({ meshes: m }, scene)} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/^2 trays couldn't be shown/),
    );
    expect(screen.getByRole("alert").textContent).not.toContain("(s)");
  });

  it("speaks the 3D build once, from a region that was already there, and the count is not in it", async () => {
    const scene = stubScene();
    const m = meshes();
    const release: (() => void)[] = [];
    m.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          release.push(() => resolve({ mesh: cubeMesh(), volumeMm3: 1 }));
        }),
    );
    const view = render(<Viewer {...props({ meshes: m }, scene)} />);
    const live = view.container.querySelector<HTMLElement>(".visually-hidden[role=status]");
    expect(live).not.toBeNull();
    const progress = await waitFor(() => {
      const el = view.container.querySelector(".run-status");
      if (el === null) {
        throw new Error("no progress yet");
      }
      return el;
    });
    expect(live?.textContent).toBe("Building 3D models.");
    expect(progress.getAttribute("role")).toBeNull();
    expect(live?.contains(progress)).toBe(false);
    act(() => {
      for (const r of release) {
        r();
      }
    });
    await waitFor(() => expect(live?.textContent).toBe(""));
    expect(view.container.querySelector(".visually-hidden[role=status]")).toBe(live);
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
    expect(screen.getByText(/The preview shows the last plan/)).toBeTruthy();
    view.rerender(<Viewer {...p} settings={changed} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalledTimes(2));
    expect(m.get).toHaveBeenCalledTimes(4);
    expect(m.get.mock.calls.at(-1)?.[1]).toBe(changed);
    expect(screen.queryByText(/The preview shows the last plan/)).toBeNull();
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

  it("peels the layers from the cut it is given: layers 1 to k, and no select of its own", async () => {
    const scene = stubScene();
    const three = [
      makeTray({ key: "a:p0:0", level: 0 }),
      makeTray({ key: "b:p0:0", level: 1, z: 40 }),
      makeTray({ key: "c:p0:0", level: 2, z: 80 }),
    ];
    const p = props({ trays: three }, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(null);
    expect(screen.queryByLabelText("Show layers")).toBeNull();
    for (const [cut, level] of [
      [0, 0],
      [1, 1],
      [2, 2],
    ] as const) {
      view.rerender(<Viewer {...p} topLayer={cut} />);
      expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(level);
    }
  });

  it("reads the cut against the level list it is given, the one the Layer switch was made from", async () => {
    const scene = stubScene();
    const p = props({ levels: [0, 7] }, scene);
    const view = render(<Viewer {...p} topLayer={1} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    // the trays' own levels are 0 and 1; the given list says the second layer is level 7
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(7);
    view.rerender(<Viewer {...p} topLayer={2} />);
    await waitFor(() => expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(null));
  });

  it("falls back to all layers when the cut layer no longer exists", async () => {
    const scene = stubScene();
    const p = props({ topLayer: 1 }, scene);
    const view = render(<Viewer {...p} />);
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(1);
    view.rerender(<Viewer {...p} trays={[makeTray({ key: "a:p0:0", level: 0 })]} topLayer={1} />);
    await waitFor(() => expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(null));
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

  it("draws the canvas in the plan's frame, sized from the box, with the controls over its foot", async () => {
    const scene = stubScene();
    const { container } = render(
      <Viewer {...props({ box: { ...DEFAULT_BOX, innerWidth: 300, innerDepth: 150 } }, scene)} />,
    );
    await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    const fit = container.querySelector<HTMLElement>(".plan-fit");
    expect(fit?.style.getPropertyValue("--box-w")).toBe("300");
    expect(fit?.style.getPropertyValue("--box-l")).toBe("150");
    const frame = fit?.querySelector(".viewer-stage");
    expect(frame?.querySelector("canvas.viewer-canvas")).not.toBeNull();
    // the axes toggle is in the frame's corner; the one row of controls is inside it, out of the flow
    expect(frame?.querySelector(".viewer-axes-toggle")).not.toBeNull();
    const under = container.querySelector(".viewer-under");
    const row = under?.querySelector(".viewer-controls");
    expect(row).not.toBeNull();
    // Spread apart is the one control in the row (the Layer switch is the status row's); nothing else sits in the strip but messages
    expect(row?.querySelectorAll("input[type=range], select")).toHaveLength(1);
    expect(row?.querySelector("select")).toBeNull();
    expect(under?.querySelector("ul, li")).toBeNull();
    expect(frame?.contains(under ?? null)).toBe(true);
    expect(frame?.getAttribute("data-region")).toBe("plan-box");
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

  describe("colours and names", () => {
    const market = makeTray({ key: "a:p0:0", level: 0, compartments: [deckWell("Market ×20")] });
    const goals = makeTray({
      key: "b:p0:0",
      level: 1,
      z: 40,
      compartments: [deckWell("Objectives ×10")],
    });
    const spacer = makeTray({ key: "a:p0:0:spacer", part: "spacer", level: 0, compartments: [] });
    const spare = makeTray({ key: "c:p0:0", level: 0, compartments: [] });

    async function colours(
      over: Partial<ViewerProps>,
    ): Promise<Record<string, string | undefined>> {
      const scene = stubScene();
      render(<Viewer {...props(over, scene)} />);
      await waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
      const shown = vi.mocked(scene.handle.setTrays).mock.calls.at(-1)?.[0] ?? [];
      return Object.fromEntries(shown.map((t) => [t.spec.key, t.color]));
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      document.documentElement.removeAttribute("data-theme");
    });

    it("gives each component of a kind its own shade, the one the top view uses", async () => {
      const components = fixtureProject().components;
      const got = await colours({ trays: [market, goals, spacer, spare], components });
      // Market and Objectives are the 2nd and 3rd cards components: shades 1 and 2 of the hue.
      expect(got["a:p0:0"]).toBe(shadeHex("cards", 1, "light").fill);
      expect(got["b:p0:0"]).toBe(shadeHex("cards", 2, "light").fill);
      expect(got["a:p0:0"]).not.toBe(got["b:p0:0"]);
      // a spacer and a spare tray are the plan's hatched neutral, not a hue
      expect(got["a:p0:0:spacer"]).toBe(SPACER_SHADE.light.fill);
      expect(got["c:p0:0"]).toBe(SPACER_SHADE.light.fill);
    });

    it("counts shades among the components of the same kind only", async () => {
      const [cards, , objectives] = fixtureProject().components;
      const tiles = { id: "fxtile01", kind: "tiles", name: "Terrain" } as unknown as Component;
      const components = [tiles, cards, objectives] as Component[];
      const terrain = makeTray({ key: "t:p0:0", compartments: [deckWell("Terrain ×6")] });
      const first = makeTray({ key: "a:p0:0", compartments: [deckWell("Action cards ×20")] });
      const got = await colours({ trays: [terrain, first, goals], components });
      expect(got["t:p0:0"]).toBe(shadeHex("tiles", 0, "light").fill);
      expect(got["a:p0:0"]).toBe(shadeHex("cards", 0, "light").fill);
      expect(got["b:p0:0"]).toBe(shadeHex("cards", 1, "light").fill);
    });

    it("stays light on a dark system, until dark is opt-in (Task 16)", async () => {
      const listeners: (() => void)[] = [];
      vi.stubGlobal("matchMedia", (q: string) => ({
        matches: q.includes("dark"),
        media: q,
        addEventListener: (_: string, cb: () => void) => listeners.push(cb),
        removeEventListener: vi.fn(),
      }));
      const got = await colours({
        trays: [market, spacer, spare],
        components: fixtureProject().components,
      });
      expect(got["a:p0:0"]).toBe(shadeHex("cards", 1, "light").fill);
      expect(got["a:p0:0:spacer"]).toBe(SPACER_SHADE.light.fill);
      expect(got["c:p0:0"]).toBe(SPACER_SHADE.light.fill);
      // nothing watches the system's setting
      expect(listeners).toEqual([]);
    });

    it("does not read data-theme yet: the page is light only", async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      const got = await colours({ trays: [market], components: fixtureProject().components });
      expect(got["a:p0:0"]).toBe(shadeHex("cards", 1, "light").fill);
    });

    it("names the selected tray in full over the view, never by number", async () => {
      const scene = stubScene();
      const components = fixtureProject().components;
      const p = props({ trays: [market, goals], components }, scene);
      const view = render(<Viewer {...p} />);
      // The live region is there from the start, empty, so a reader hears the name arrive.
      const region = view.container.querySelector(".viewer-selection-live");
      expect(region?.getAttribute("role")).toBe("status");
      expect(region?.textContent).toBe("");
      expect(view.container.querySelector(".viewer-selection")).toBeNull();
      view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
      const label = view.container.querySelector(".viewer-selection");
      expect(label?.closest(".viewer-stage")).toBeTruthy();
      expect(view.container.querySelector(".viewer-selection-live")).toBe(region);
      expect(region?.textContent).toBe("Objectives");
      // a name cut off on a narrow screen can still be read in full
      expect(label?.getAttribute("title")).toBe("Objectives");
      expect(label?.textContent).toBe("Objectives");
      expect(label?.textContent).not.toMatch(/\d/);
      view.rerender(<Viewer {...p} selectedKey={null} />);
      expect(view.container.querySelector(".viewer-selection")).toBeNull();
      expect(view.container.querySelector(".viewer-selection-live")?.textContent).toBe("");
    });
  });

  describe("choosing a tray without the pointer", () => {
    const named = [
      makeTray({ key: "a:p0:0", level: 0 }),
      makeTray({ key: "b:p0:0", level: 1, z: 40, compartments: [deckWell("Market ×20")] }),
      makeTray({ key: "a:p0:0:spacer", part: "spacer", level: 0, compartments: [] }),
      makeTray({ key: "c:p0:0", level: 1, z: 40 }),
    ];

    it("has no row of tray chips: a tray is chosen in the scene, the rail or with the keys", () => {
      const scene = stubScene();
      const { container } = render(<Viewer {...props({ trays: named }, scene)} />);
      expect(screen.queryByRole("list", { name: "Trays" })).toBeNull();
      expect(container.querySelector(".tray-picker, .tray-chip")).toBeNull();
      expect(container.querySelector(".viewer-under button[data-key]")).toBeNull();
    });

    it("makes the canvas a tab stop that the arrow keys step through the trays from, spacers left out", () => {
      const scene = stubScene();
      const p = props({ trays: named, selectedKey: null }, scene);
      const view = render(<Viewer {...p} />);
      const canvas = view.container.querySelector("canvas") as HTMLCanvasElement;
      expect(canvas.tabIndex).toBe(0);
      fireEvent.keyDown(canvas, { key: "ArrowRight" });
      expect(p.onSelect).toHaveBeenLastCalledWith("a:p0:0");
      view.rerender(<Viewer {...p} selectedKey="a:p0:0" />);
      fireEvent.keyDown(canvas, { key: "ArrowRight" });
      expect(p.onSelect).toHaveBeenLastCalledWith("b:p0:0");
      view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
      fireEvent.keyDown(canvas, { key: "ArrowDown" });
      expect(p.onSelect).toHaveBeenLastCalledWith("c:p0:0");
      // the ends wrap round
      view.rerender(<Viewer {...p} selectedKey="c:p0:0" />);
      fireEvent.keyDown(canvas, { key: "ArrowRight" });
      expect(p.onSelect).toHaveBeenLastCalledWith("a:p0:0");
      view.rerender(<Viewer {...p} selectedKey="a:p0:0" />);
      fireEvent.keyDown(canvas, { key: "ArrowLeft" });
      expect(p.onSelect).toHaveBeenLastCalledWith("c:p0:0");
      view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
      fireEvent.keyDown(canvas, { key: "ArrowUp" });
      expect(p.onSelect).toHaveBeenLastCalledWith("a:p0:0");
    });

    it("leaves other keys, and the keys with a modifier, to the browser", () => {
      const scene = stubScene();
      const p = props({ trays: named }, scene);
      const { container } = render(<Viewer {...p} />);
      const canvas = container.querySelector("canvas") as HTMLCanvasElement;
      fireEvent.keyDown(canvas, { key: "Tab" });
      fireEvent.keyDown(canvas, { key: "ArrowRight", altKey: true });
      fireEvent.keyDown(canvas, { key: "ArrowRight", metaKey: true });
      expect(p.onSelect).not.toHaveBeenCalled();
    });

    it("steps only through the trays on the layers shown", () => {
      const scene = stubScene();
      const p = props({ trays: named, selectedKey: "a:p0:0", topLayer: 0 }, scene);
      const { container } = render(<Viewer {...p} />);
      fireEvent.keyDown(container.querySelector("canvas") as HTMLCanvasElement, {
        key: "ArrowRight",
      });
      // layer 1 holds one tray (and a spacer): the step lands on itself
      expect(p.onSelect).toHaveBeenLastCalledWith("a:p0:0");
    });
  });

  describe("a lit rail row", () => {
    const [, second, third] = fixtureProject().components as [Component, Component, Component];
    const market = makeTray({ key: "a:p0:0", level: 0, compartments: [deckWell("Market ×20")] });
    const goals = makeTray({
      key: "b:p0:0",
      level: 1,
      z: 40,
      compartments: [deckWell("Objectives ×10")],
    });
    const spacer = makeTray({ key: "a:p0:0:spacer", part: "spacer", level: 0, compartments: [] });
    const all = [market, goals, spacer];
    const components = fixtureProject().components;

    afterEach(() => {
      hoveredComponent.value = null;
      hoveredMembers.value = null;
    });

    it("tints the trays of that component only, spacers and other components' trays left out", async () => {
      const scene = stubScene();
      render(<Viewer {...props({ trays: all, components }, scene)} />);
      await waitFor(() => expect(scene.handle.setLit).toHaveBeenCalled());
      expect(scene.handle.setLit).toHaveBeenLastCalledWith([]);
      act(() => {
        hoveredComponent.value = second.id;
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith(["a:p0:0"]);
      act(() => {
        hoveredComponent.value = third.id;
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith(["b:p0:0"]);
      act(() => {
        hoveredComponent.value = null;
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith([]);
    });

    it("tints a group's shared tray from either member's row, and lights the pair's trays together", async () => {
      const scene = stubScene();
      // Objectives and the second component share the tray b; the second also has the tray a
      const shared = makeTray({
        key: "b:p0:0",
        level: 1,
        z: 40,
        compartments: [deckWell("Objectives ×10"), deckWell("Market ×20")],
      });
      const own = makeTray({ key: "a:p0:0", level: 0, compartments: [deckWell("Market ×20")] });
      render(<Viewer {...props({ trays: [own, shared], components }, scene)} />);
      await waitFor(() => expect(scene.handle.setLit).toHaveBeenCalled());
      // each member's row finds the shared tray (by contents text, as these wells name no id)
      act(() => {
        hoveredComponent.value = third.id;
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith(["a:p0:0", "b:p0:0"]);
      act(() => {
        hoveredComponent.value = second.id;
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith(["a:p0:0", "b:p0:0"]);
    });

    it("tints the trays of every item of the group card the rail points at", async () => {
      const scene = stubScene();
      render(<Viewer {...props({ trays: all, components }, scene)} />);
      await waitFor(() => expect(scene.handle.setLit).toHaveBeenCalled());
      act(() => {
        hoveredMembers.value = [second.id, third.id];
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith(["a:p0:0", "b:p0:0"]);
      act(() => {
        hoveredMembers.value = null;
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith([]);
    });

    it("tints nothing for a component that holds no tray here", async () => {
      const scene = stubScene();
      render(<Viewer {...props({ trays: all, components }, scene)} />);
      await waitFor(() => expect(scene.handle.setLit).toHaveBeenCalled());
      act(() => {
        hoveredComponent.value = "no-such-component";
      });
      expect(scene.handle.setLit).toHaveBeenLastCalledWith([]);
    });

    it("does not call the scene again while the lit trays stay the same", async () => {
      const scene = stubScene();
      const p = props({ trays: all, components }, scene);
      const view = render(<Viewer {...p} />);
      await waitFor(() => expect(scene.handle.setLit).toHaveBeenCalled());
      act(() => {
        hoveredComponent.value = second.id;
      });
      const calls = vi.mocked(scene.handle.setLit).mock.calls.length;
      view.rerender(<Viewer {...p} selectedKey="b:p0:0" />);
      expect(vi.mocked(scene.handle.setLit).mock.calls.length).toBe(calls);
    });
  });
});
