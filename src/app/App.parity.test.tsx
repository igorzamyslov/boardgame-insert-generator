// src/app/App.parity.test.tsx
// @vitest-environment jsdom
// The top view and the 3D view share one selection: a tray chosen in either shows the same bar and
// presses the same rail row, the choice survives Top <-> 3D, a rail row lights its trays in
// whichever view shows, and Close hands the focus back to the view the person is in.
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoveredComponent } from "../screens/hover";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import type { SceneFactory, SceneHandle } from "../viewer/types";
import type { AppProps } from "./App";
import { fixtureProject, makeLayout, makeTray } from "./test-helpers";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  hoveredComponent.value = null;
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

/** A scene that draws nothing and remembers what it was told, and lets a test click a tray. */
function stubScene() {
  let picked: ((key: string | null) => void) | null = null;
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
    onView: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const factory: SceneFactory = () => handle;
  const viewerProps: AppProps["viewerProps"] = {
    webgl: () => true,
    loadScene: () => Promise.resolve(factory),
  };
  return {
    handle,
    viewerProps,
    /** A click on a tray in the scene (the scene reports the key it hit). */
    click: (key: string | null) => {
      act(() => picked?.(key));
    },
  };
}

/** Two trays on the bottom layer, each holding one of the first two components. */
function twoTrays(): { project: Project; ids: [string, string]; names: [string, string] } {
  const p = fixtureProject();
  const [first, second] = p.components;
  if (first === undefined || second === undefined) {
    throw new Error("the fixture has fewer than two components");
  }
  const well = (id: string) => ({
    x: 1.6,
    y: 1.6,
    w: 96.8,
    d: 76.8,
    floorZ: 1.2,
    kind: "well" as const,
    contents: "x",
    componentId: id,
    features: [],
  });
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", stack: 0, x: 0, y: 0, compartments: [well(first.id)] }),
    makeTray({ key: "b:p0:0", path: "1", stack: 1, x: 110, y: 0, compartments: [well(second.id)] }),
  ];
  return {
    project: { ...p, layout: makeLayout(inputsHash(p), trays) },
    ids: [first.id, second.id],
    names: [first.name, second.name],
  };
}

const tile = (key: string): HTMLElement =>
  document.querySelector(`.plan-tile[data-key="${key}"]`) as HTMLElement;
const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const row = (id: string): HTMLElement =>
  rail().querySelector(`[data-row-id="${id}"]`) as HTMLElement;
const pressedRows = (): string[] =>
  within(rail())
    .queryAllByRole("button", { pressed: true })
    .map((b) => (b as HTMLElement).dataset.rowId ?? "");
const bars = (): HTMLElement[] => screen.queryAllByRole("region", { name: "Selected tray" });
const barName = (): string | null => document.querySelector(".tray-bar__name")?.textContent ?? null;

function openView(name: "Top" | "3D"): void {
  fireEvent.click(
    within(screen.getByRole("group", { name: "View" })).getByRole("button", { name }),
  );
}

async function inThreeD(): Promise<void> {
  openView("3D");
  await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
}

describe("2D and 3D share one selection", () => {
  it("a tray chosen in the top view stays selected in 3D: the same bar, the same rail row, the same tray glowing", async () => {
    const { project, ids, names } = twoTrays();
    const scene = stubScene();
    const { store } = renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    fireEvent.keyDown(tile("b:p0:0"), { key: "Enter" });
    const nameInTop = barName();
    expect(nameInTop).toBe(names[1]);
    expect(pressedRows()).toEqual([ids[1]]);

    await inThreeD();
    expect(store.state.selection.value).toBe("b:p0:0");
    expect(bars()).toHaveLength(1);
    expect(barName()).toBe(nameInTop);
    expect(pressedRows()).toEqual([ids[1]]);
    await waitFor(() => expect(scene.handle.setSelected).toHaveBeenLastCalledWith("b:p0:0"));

    openView("Top");
    expect(bars()).toHaveLength(1);
    expect(barName()).toBe(nameInTop);
    expect(tile("b:p0:0").classList.contains("is-selected")).toBe(true);
    expect(pressedRows()).toEqual([ids[1]]);
  });

  it("a tray clicked in 3D shows the bar, presses its rail row, and is the selected tile in the top view", async () => {
    const { project, ids, names } = twoTrays();
    const scene = stubScene();
    const { store } = renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    expect(bars()).toHaveLength(0);
    expect(pressedRows()).toEqual([]);

    scene.click("a:p0:0");
    expect(store.state.selection.value).toBe("a:p0:0");
    expect(bars()).toHaveLength(1);
    expect(barName()).toBe(names[0]);
    expect(pressedRows()).toEqual([ids[0]]);
    await waitFor(() => expect(scene.handle.setSelected).toHaveBeenLastCalledWith("a:p0:0"));

    openView("Top");
    expect(bars()).toHaveLength(1);
    expect(barName()).toBe(names[0]);
    expect(tile("a:p0:0").classList.contains("is-selected")).toBe(true);
    expect(pressedRows()).toEqual([ids[0]]);
  });

  it("a click on nothing in 3D clears the selection, the bar and the pressed row", async () => {
    const { project } = twoTrays();
    const scene = stubScene();
    const { store } = renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    scene.click("a:p0:0");
    expect(bars()).toHaveLength(1);
    scene.click(null);
    expect(store.state.selection.value).toBeNull();
    expect(bars()).toHaveLength(0);
    expect(pressedRows()).toEqual([]);
  });

  it("the arrow keys on the 3D canvas select a tray that the top view then shows selected", async () => {
    const { project, ids } = twoTrays();
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    const canvas = document.querySelector(".viewer-canvas") as HTMLElement;
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(bars()).toHaveLength(1);
    expect(pressedRows()).toEqual([ids[0]]);
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(pressedRows()).toEqual([ids[1]]);
    openView("Top");
    expect(tile("b:p0:0").classList.contains("is-selected")).toBe(true);
    expect(bars()).toHaveLength(1);
  });
});

describe("a rail row lights its trays in 3D", () => {
  it("tints the trays of the component the pointer is on, and none once it leaves", async () => {
    const { project, ids } = twoTrays();
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenCalled());
    expect(scene.handle.setLit).toHaveBeenLastCalledWith([]);

    fireEvent.mouseEnter(row(ids[1]));
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenLastCalledWith(["b:p0:0"]));
    fireEvent.mouseLeave(row(ids[1]));
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenLastCalledWith([]));
    fireEvent.mouseEnter(row(ids[0]));
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenLastCalledWith(["a:p0:0"]));
  });

  it("does the same for the keyboard focus on a row", async () => {
    const { project, ids } = twoTrays();
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    fireEvent.focus(row(ids[0]));
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenLastCalledWith(["a:p0:0"]));
    fireEvent.blur(row(ids[0]));
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenLastCalledWith([]));
  });

  it("lights a row the pointer was already on when the scene opens", async () => {
    const { project, ids } = twoTrays();
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    fireEvent.mouseEnter(row(ids[1]));
    await inThreeD();
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenLastCalledWith(["b:p0:0"]));
  });

  it("still opens the editor when the row is clicked", async () => {
    const { project, ids } = twoTrays();
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    fireEvent.mouseEnter(row(ids[0]));
    fireEvent.click(row(ids[0]));
    expect(within(rail()).getByRole("button", { name: "Done" })).toBeTruthy();
  });
});

describe("the keyboard reaches the same bar from either view, and Close goes back to that view", () => {
  it("Enter on a tile opens the bar; Close hands the focus back to the tile", async () => {
    const { project } = twoTrays();
    renderApp({ project });
    const focus = vi.fn();
    tile("a:p0:0").focus = focus;
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    expect(bars()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bars()).toHaveLength(0);
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
  });

  it("a tray chosen with the arrow keys in 3D: Close in the top view focuses its tile", async () => {
    const { project } = twoTrays();
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    fireEvent.keyDown(document.querySelector(".viewer-canvas") as HTMLElement, {
      key: "ArrowRight",
    });
    openView("Top");
    const focus = vi.fn();
    tile("a:p0:0").focus = focus;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    expect(document.activeElement?.tagName).not.toBe("CANVAS");
  });

  it("a tray chosen on a tile: Close in 3D focuses the canvas, whose arrow keys step on from that tray", async () => {
    const { project, ids } = twoTrays();
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    await inThreeD();
    // the arrow keys start from the tray chosen on the plan, not from the first one
    fireEvent.keyDown(document.querySelector(".viewer-canvas") as HTMLElement, {
      key: "ArrowRight",
    });
    expect(pressedRows()).toEqual([ids[1]]);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement?.tagName).toBe("CANVAS"));
    expect(bars()).toHaveLength(0);
    expect(pressedRows()).toEqual([]);
  });
});

describe("the Layer switch drives the 3D view", () => {
  /** Three layers, one tray each. */
  function threeLayers(): Project {
    const p = fixtureProject();
    const trays = [
      makeTray({ key: "a:p0:0", path: "0", stack: 0, level: 0, h: 30 }),
      makeTray({ key: "b:p0:0", path: "1", stack: 0, level: 1, z: 30, h: 30 }),
      makeTray({ key: "c:p0:0", path: "2", stack: 0, level: 2, z: 60, h: 30 }),
    ];
    return { ...p, layout: makeLayout(inputsHash(p), trays) };
  }
  const layer = (name: string): HTMLElement =>
    within(screen.getByRole("group", { name: "Layer" })).getByRole("button", {
      name: name === "All" ? name : new RegExp(`^${name.replace(/[()]/g, "\\$&")}`),
    });

  it("opens on All, peels the layers one by one, and keeps the top view's own layer", async () => {
    const scene = stubScene();
    renderApp({ project: threeLayers(), overrides: { viewerProps: scene.viewerProps } });
    // the top view: one layer, no All
    expect(within(screen.getByRole("group", { name: "Layer" })).queryByText("All")).toBeNull();
    fireEvent.click(layer("Layer 2"));
    await inThreeD();
    expect(layer("All").getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(null));
    // there is no select of its own any more
    expect(screen.queryByLabelText("Show layers")).toBeNull();
    fireEvent.click(layer("Layer 1 (bottom)"));
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(0);
    fireEvent.click(layer("Layer 2"));
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(1);
    fireEvent.click(layer("Layer 3 (top)"));
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(2);
    fireEvent.click(layer("All"));
    expect(scene.handle.setMaxLevel).toHaveBeenLastCalledWith(null);
    // back in the top view, the layer it had is still its own
    fireEvent.click(layer("Layer 1 (bottom)"));
    openView("Top");
    expect(layer("Layer 2").getAttribute("aria-pressed")).toBe("true");
  });

  it("opens 3D on All again each time", async () => {
    const scene = stubScene();
    renderApp({ project: threeLayers(), overrides: { viewerProps: scene.viewerProps } });
    await inThreeD();
    fireEvent.click(layer("Layer 1 (bottom)"));
    openView("Top");
    openView("3D");
    expect(layer("All").getAttribute("aria-pressed")).toBe("true");
  });
});
