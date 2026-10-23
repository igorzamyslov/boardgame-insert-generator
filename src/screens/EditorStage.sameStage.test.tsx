// src/screens/EditorStage.sameStage.test.tsx
// @vitest-environment jsdom
// The editor draws on the normal stage (WideStage2): the same switches in the same place, the
// editing sentence where the status heading was, no Try another arrangement, an empty band where the tray
// bar stands, and the same frame for the top view and the 3D view.
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-app";
import type { AppProps } from "../app/App";
import { loadSeed } from "../test-support/harbourKings";
import type { SceneFactory, SceneHandle } from "../viewer/types";
import { SETTLE_MS } from "./useSettled";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A scene that draws nothing and remembers what it was told. */
function stubScene() {
  const handle: SceneHandle = {
    setBox: vi.fn(),
    setTrays: vi.fn(),
    setExplode: vi.fn(),
    setMaxLevel: vi.fn(),
    setSelected: vi.fn(),
    setLit: vi.fn(),
    onPick: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const factory: SceneFactory = () => handle;
  const viewerProps: AppProps["viewerProps"] = {
    webgl: () => true,
    loadScene: () => Promise.resolve(factory),
  };
  return { handle, viewerProps };
}

const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });
const stage = (): HTMLElement => document.querySelector('[data-region="stage"]') as HTMLElement;
const editMarket = (): void => {
  fireEvent.click(within(rail()).getByRole("button", { name: /^Market deck, / }));
};
const regions = (): string[] =>
  [...stage().querySelectorAll<HTMLElement>(":scope > [data-region]")].map(
    (el) => el.dataset.region ?? "",
  );
const viewGroup = (): HTMLElement => within(stage()).getByRole("group", { name: "View" });
const openView = (name: "Top" | "3D"): void => {
  fireEvent.click(within(viewGroup()).getByRole("button", { name }));
};

describe("the editor on the normal stage", () => {
  it("has the stage's regions in the stage's order: status, switches, plan", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    const normal = regions().filter((r) => ["status", "switches", "plan"].includes(r));
    expect(normal).toEqual(["status", "switches", "plan"]);
    editMarket();
    expect(regions().filter((r) => ["status", "switches", "plan"].includes(r))).toEqual(normal);
  });

  it("keeps the normal stage's padding, so nothing moves when an item is opened", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    expect(stage().classList.contains("ws-stage--focus")).toBe(false);
    editMarket();
    expect(stage().classList.contains("ws-stage--focus")).toBe(false);
  });

  it("puts the sentence, the page's one h1, where the status heading was", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    editMarket();
    const status = stage().querySelector(':scope > [data-region="status"]') as HTMLElement;
    const h1 = within(status).getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/^Market deck tray, /);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("keeps the Layer switch in its row and the Top / 3D switch in the toolbar", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    const switchesBefore = stage().querySelector('[data-region="switches"]') as HTMLElement;
    const kidsBefore = [...switchesBefore.children].map((c) => c.className);
    editMarket();
    const row = stage().querySelector(':scope > [data-region="switches"]') as HTMLElement;
    expect(row.classList.contains("stage-segs")).toBe(true);
    expect([...row.children].map((c) => c.className)).toEqual(kidsBefore);
    const toolbar = stage().querySelector(':scope > [data-region="status"]') as HTMLElement;
    const view = toolbar.querySelector('[data-region="view-switch"]') as HTMLElement;
    expect(within(view).getByRole("group", { name: "View" })).toBeTruthy();
    expect(within(row).getByRole("group", { name: "Layer" })).toBeTruthy();
    expect(
      within(viewGroup())
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent),
    ).toEqual(["Top"]);
  });

  it("has no plan menu (Try another arrangement) while an item is edited, and has it again after Done", () => {
    renderApp({ project: loadSeed("harbour-kings").project });
    expect(within(stage()).queryByRole("button", { name: "Plan options" })).not.toBeNull();
    editMarket();
    expect(screen.queryByRole("button", { name: "Plan options" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(within(stage()).queryByRole("button", { name: "Plan options" })).not.toBeNull();
  });

  it("leaves the tray bar's slot as an empty band, in the top view and in 3D", async () => {
    const scene = stubScene();
    renderApp({
      project: loadSeed("harbour-kings").project,
      overrides: { viewerProps: scene.viewerProps },
    });
    editMarket();
    const band = (): HTMLElement =>
      stage().querySelector('[data-region="plan"] .stage-slot') as HTMLElement;
    expect(band()).not.toBeNull();
    expect(band().textContent).toBe("");
    expect(within(stage()).queryByText("Tap a tray for details.")).toBeNull();
    openView("3D");
    await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
    expect(band()).not.toBeNull();
    expect(band().textContent).toBe("");
    expect(within(stage()).queryByText("Tap a tray for details.")).toBeNull();
  });
});

describe("the editor in 3D", () => {
  it("opens the 3D view from the same View switch, with All as the switch's last segment", async () => {
    const scene = stubScene();
    renderApp({
      project: loadSeed("harbour-kings").project,
      overrides: { viewerProps: scene.viewerProps },
    });
    editMarket();
    openView("3D");
    await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
    const layers = within(stage()).getByRole("group", { name: "Layer" });
    expect(
      within(layers)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Layer 1", "Layer 2", "All"]);
    expect(
      within(viewGroup())
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent),
    ).toEqual(["3D"]);
    // the switch is the stage's, so the editor does not forget the view when it closes
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      within(viewGroup())
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent),
    ).toEqual(["3D"]);
  });

  it("lifts the edited item's trays and dims the rest", async () => {
    const { project } = loadSeed("harbour-kings");
    const scene = stubScene();
    renderApp({ project, overrides: { viewerProps: scene.viewerProps } });
    editMarket();
    openView("3D");
    await waitFor(() => expect(scene.handle.setLit).toHaveBeenCalled());
    const mine = (project.layout?.trays ?? [])
      .filter((t) => t.key.startsWith("market01:"))
      .map((t) => t.key);
    expect(mine.length).toBeGreaterThan(0);
    const last = vi.mocked(scene.handle.setLit).mock.calls.at(-1)?.[0] ?? [];
    expect([...last].sort()).toEqual([...mine].sort());
    // nothing is selected: the trays in the scene cannot be picked while an editor is open
    expect(scene.handle.setSelected).toHaveBeenLastCalledWith(null);
  });

  it("draws the scene again once a change settles, not on every keystroke", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scene = stubScene();
    const { store } = renderApp({
      project: loadSeed("harbour-kings").project,
      overrides: { viewerProps: scene.viewerProps },
    });
    editMarket();
    openView("3D");
    await vi.waitFor(() => expect(scene.handle.setTrays).toHaveBeenCalled());
    const drawn = (): number => vi.mocked(scene.handle.setTrays).mock.calls.length;
    const before = drawn();
    // a name is not part of the plan's hash, so typing it leaves the plan current: the case
    // that used to rebuild the scene on every keystroke
    for (const suffix of ["x", "xy", "xyz"]) {
      act(() => {
        store.edit((q) => ({
          ...q,
          components: q.components.map((c) =>
            c.name.startsWith("Market deck") ? { ...c, name: `Market deck${suffix}` } : c,
          ),
        }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SETTLE_MS / 4);
      });
    }
    expect(drawn()).toBe(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SETTLE_MS);
    });
    await vi.waitFor(() => expect(drawn()).toBe(before + 1));
  });

  it("keeps the note after an option change working (the sentence gives way, then comes back)", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderApp({ project: loadSeed("harbour-kings").project });
    editMarket();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Sleeves" })).getByRole("button", {
        name: "Premium",
      }),
    );
    expect(screen.getByRole("heading", { level: 1 }).classList.contains("visually-hidden")).toBe(
      true,
    );
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole("heading", { level: 1 }).classList.contains("visually-hidden")).toBe(
      false,
    );
  });
});

describe("the 3D view across the editor", () => {
  it("is one scene: opening and closing an item keeps the canvas, the camera and Spread apart", async () => {
    const created = vi.fn();
    const scene = stubScene();
    const factory: SceneFactory = (canvas) => {
      created(canvas);
      return scene.handle;
    };
    renderApp({
      project: loadSeed("harbour-kings").project,
      overrides: { viewerProps: { webgl: () => true, loadScene: () => Promise.resolve(factory) } },
    });
    openView("3D");
    await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    const canvas = stage().querySelector("canvas");
    const slider = screen.getByLabelText("Spread apart") as HTMLInputElement;
    fireEvent.input(slider, { target: { value: "0.5" } });
    expect(slider.value).toBe("0.5");
    const loading = (): HTMLElement | null => screen.queryByText("Loading the 3D preview…");

    editMarket();
    expect(loading()).toBeNull();
    expect(stage().querySelector("canvas")).toBe(canvas);
    expect((screen.getByLabelText("Spread apart") as HTMLInputElement).value).toBe("0.5");
    expect(scene.handle.dispose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(loading()).toBeNull();
    expect(stage().querySelector("canvas")).toBe(canvas);
    expect((screen.getByLabelText("Spread apart") as HTMLInputElement).value).toBe("0.5");
    expect(scene.handle.dispose).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(1);
  });
});
