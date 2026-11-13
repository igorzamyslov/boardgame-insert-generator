// src/app/App.putOn.test.tsx
// @vitest-environment jsdom
// Put on… (0.15.0): More's item, the plan's prompt, the stack lock it writes (no pin), the dry run's
// refusals in the pill, and the rail's "On <base>" chip with its ×. The base is the Event cards: with
// 0.26.0's roomier card wells the Market deck stack no longer fits on the Dice tray.
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneFactory, SceneHandle } from "../viewer/types";
import { loadSeed } from "../test-support/harbourKings";
import { renderApp } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const stage = (): HTMLElement => document.querySelector('[data-region="stage"]') as HTMLElement;
const tile = (name: RegExp): HTMLElement => within(stage()).getByRole("button", { name });
const press = (name: RegExp): void => {
  fireEvent.keyDown(tile(name), { key: "Enter" });
};
const putOn = (name: RegExp): void => {
  press(name);
  fireEvent.click(screen.getByRole("button", { name: "More about this tray" }));
  fireEvent.click(screen.getByRole("button", { name: /^Put on…/ }));
};

function seeded() {
  const project = loadSeed("harbour-kings").project;
  const key = (name: string): string => {
    const c = project.components.find((x) => x.name === name);
    if (c === undefined) {
      throw new Error(`the seed has no ${name}`);
    }
    return `${c.id}:p0:0`;
  };
  return { project, key, ...renderApp({ project }) };
}

describe("Put on…", () => {
  it("asks for the base, writes one stack lock without a pin, and draws the On chip", () => {
    const { store, key } = seeded();
    putOn(/^Market deck/);
    expect(screen.getByText("Pick the tray to put Market deck on.")).toBeTruthy();
    // the panel is shut so the prompt can be read; it says on reopening that the put-on is under way
    expect(screen.queryByRole("button", { name: /^Put on…/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More about this tray" }));
    expect(screen.getByRole("button", { name: /^Put on…/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "More about this tray" }));
    expect(store.canUndo.peek()).toBe(false);
    press(/^Event cards/);
    const locks = store.state.project.value.locks;
    expect(locks.filter((l) => l.kind === "position")).toEqual([]);
    const stack = locks.find((l) => l.kind === "stack");
    expect(stack?.kind === "stack" ? stack.trayKeys.slice(-2) : []).toEqual([
      key("Event cards"),
      key("Market deck"),
    ]);
    // done: the prompt is gone and the tray stays selected
    expect(screen.queryByText(/Pick the tray to put/)).toBeNull();
    expect(store.state.swapFrom.value).toBeNull();
    expect(within(rail()).getByText("On Event cards")).toBeTruthy();
    expect(
      within(rail()).getByText("Trays put on another stay on it when the plan updates."),
    ).toBeTruthy();
    expect(within(rail()).queryByText(/Pinned/)).toBeNull();
  });

  it("takes the tray off with the chip's ×, and Undo puts it back", () => {
    const { store } = seeded();
    putOn(/^Market deck/);
    press(/^Event cards/);
    const locks = store.state.project.value.locks;
    // edits within a moment of each other are one step: the person's click comes later than that
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    fireEvent.click(
      within(rail()).getByRole("button", { name: "Take Market deck off Event cards" }),
    );
    expect(store.state.project.value.locks).toEqual([]);
    expect(within(rail()).queryByText("On Event cards")).toBeNull();
    act(() => store.undo());
    expect(store.state.project.value.locks).toEqual(locks);
  });

  it("is the one choice that ends with Escape on the plan, and is off again after it", () => {
    const { store } = seeded();
    putOn(/^Market deck/);
    // the dock is not inside the plan: its Escape does not reach the plan's, a tray's does
    fireEvent.keyDown(tile(/^Market deck/), { key: "Escape" });
    expect(store.state.swapFrom.value).toBeNull();
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("blocks a base that is pinned with one sentence, and keeps asking", () => {
    const { store, key } = seeded();
    act(() =>
      store.edit((q) => ({
        ...q,
        locks: [{ kind: "position", trayKey: key("Heroes"), path: "0", rotated: false }],
      })),
    );
    const before = store.state.project.value.locks;
    putOn(/^Market deck/);
    press(/^Heroes/);
    expect(screen.getByText("Heroes is pinned. Unpin it before you put trays on it.")).toBeTruthy();
    expect(store.state.project.value.locks).toEqual(before);
    expect(store.state.swapFrom.value).toBe(key("Market deck"));
  });

  it("blocks a stack that would be taller than the box (Heroes has two trays already), naming both trays", () => {
    const { store } = seeded();
    const before = store.state.project.value.locks;
    putOn(/^Market deck/);
    press(/^Heroes/);
    expect(
      screen.getByText(
        "Market deck doesn't go on Heroes: the stack is taller than the space in the box.",
      ),
    ).toBeTruthy();
    expect(store.state.project.value.locks).toEqual(before);
  });

  it("works in the 3D view too: the base is picked by clicking its tray in the scene", async () => {
    const project = loadSeed("harbour-kings").project;
    let picked: ((key: string | null) => void) | null = null;
    const handle: SceneHandle = {
      setBox: vi.fn(),
      setTrays: vi.fn(),
      setExplode: vi.fn(),
      setMaxLevel: vi.fn(),
      setSelected: vi.fn(),
      setLit: vi.fn(),
      setMisfit: vi.fn(),
      onPick: vi.fn((cb: (key: string | null) => void) => {
        picked = cb;
      }),
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    const factory: SceneFactory = () => handle;
    const { store } = renderApp({
      project,
      overrides: { viewerProps: { webgl: () => true, loadScene: () => Promise.resolve(factory) } },
    });
    const dice = project.components.find((c) => c.name === "Event cards");
    press(/^Market deck/);
    fireEvent.click(
      within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "3D" }),
    );
    await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
    // the same dock, with the same entry
    fireEvent.click(screen.getByRole("button", { name: "More about this tray" }));
    fireEvent.click(screen.getByRole("button", { name: /^Put on…/ }));
    expect(screen.getByText("Pick the tray to put Market deck on.")).toBeTruthy();
    act(() => picked?.(`${dice?.id}:p0:0`));
    const stack = store.state.project.value.locks.find((l) => l.kind === "stack");
    expect(stack?.kind === "stack" ? stack.trayKeys.slice(-2) : []).toEqual([
      `${dice?.id}:p0:0`,
      `${project.components.find((c) => c.name === "Market deck")?.id}:p0:0`,
    ]);
    expect(store.state.swapFrom.value).toBeNull();
  });
});
