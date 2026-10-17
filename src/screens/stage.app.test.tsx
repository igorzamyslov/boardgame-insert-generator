// src/screens/stage.app.test.tsx
// @vitest-environment jsdom
// The top of the stage as the app wires it (UI rebuild Task 6): the status heading is the page's
// h1, and every job the Summary did has a home here.
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateBox } from "../app/actions";
import { renderApp } from "../app/test-app";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import { stageView } from "./stageView";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const h1s = (): HTMLElement[] => screen.getAllByRole("heading", { level: 1 });
const stage = (): HTMLElement => screen.getByRole("main");

/** Two trays on two layers: 40 mm and 26 mm high. */
function twoLayers(): Project {
  const p = fixtureProject();
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", stack: 0, level: 0, h: 40 }),
    makeTray({ key: "b:p0:0", path: "1", stack: 1, level: 1, z: 40, h: 26 }),
  ];
  return { ...p, layout: makeLayout(inputsHash(p), trays) };
}

describe("the stage's top, in the app", () => {
  it("names the state in the page's one h1", () => {
    const { project } = loadSeed("harbour-kings");
    renderApp({ project });
    // the wordmark is not a heading on the workspace
    expect(h1s()).toHaveLength(1);
    expect(h1s()[0]?.textContent).toBe("Everything fits");
    expect(screen.queryByRole("heading", { name: "Insert Generator" })).toBeNull();
    const line = document.querySelector(".k-status__line")?.textContent ?? "";
    expect(line).toMatch(/^\d+ trays in \d+ layers?, \d+(\.\d)? of 70 mm high$/);
  });

  it("keeps the wordmark as the h1 on the first visit, which has no status", () => {
    renderApp();
    expect(h1s()).toHaveLength(1);
    expect(h1s()[0]?.textContent).toBe("Insert Generator");
    expect(document.querySelector('[data-region="status"]')).toBeNull();
  });

  it("keeps the h1 while an editor is open in the rail", () => {
    const { project } = loadSeed("harbour-kings");
    renderApp({ project });
    fireEvent.click(screen.getByRole("button", { name: /^The box/ }));
    expect(h1s()).toHaveLength(1);
    expect(h1s()[0]?.textContent).toBe("Everything fits");
  });

  it("mounts the run's live region even before there is a status", () => {
    renderApp();
    expect(document.querySelector("[data-live='run']")?.getAttribute("role")).toBe("status");
  });

  it("says Making a new plan… while an edit's run is pending", () => {
    const { store } = renderApp({ project: twoLayers() });
    act(() => {
      store.state.runScheduled.value = true;
    });
    expect(h1s()[0]?.textContent).toBe("Making a new plan…");
    expect(within(stage()).queryByRole("button", { name: "Keep searching" })).toBeNull();
  });

  it("shows the run error with Retry", () => {
    const { store } = renderApp({ project: twoLayers() });
    const retry = vi.spyOn(store, "retry").mockImplementation(() => undefined);
    act(() => {
      store.state.run.value = { status: "error", message: "Worker crashed" };
    });
    expect(h1s()[0]?.textContent).toBe("The plan couldn't be updated");
    expect(stage().textContent).toContain("Worker crashed.");
    expect(stage().textContent).toContain("The plan shown is the last good one");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("lists errors that have no field", async () => {
    const p = fixtureProject();
    const { store } = renderApp({ project: p });
    act(() => {
      store.edit((q) => ({ ...q, locks: [{ kind: "stack", trayKeys: [] }] }));
    });
    expect(await screen.findByText("Fix the errors marked in the inputs")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Errors without a field" });
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "A pinned stack needs at least one tray.",
    ]);
    // under the h1, in the heading itself
    expect(list.closest(".k-status")?.querySelector("h1")?.textContent).toBe(
      "Fix the errors marked in the inputs",
    );
  });

  it("lists the error of an empty list, which has no field of its own", async () => {
    const { store } = renderApp({ project: fixtureProject() });
    act(() => {
      store.edit((q) => ({
        ...q,
        components: q.components.map((c, i) =>
          i === 0 && c.kind === "cards" ? { ...c, decks: [] } : c,
        ),
      }));
    });
    const list = await screen.findByRole("list", { name: "Errors without a field" });
    expect(list.textContent).toBe("Add at least one deck.");
  });

  it("sends the person to the input in error", async () => {
    const { project } = loadSeed("harbour-kings");
    const { store } = renderApp({ project });
    const market = project.components[0];
    if (market === undefined || market.kind !== "cards") {
      throw new Error("the seed's first component is not cards");
    }
    act(() => {
      store.edit((q) => ({
        ...q,
        components: q.components.map((c) =>
          c.id === market.id && c.kind === "cards"
            ? { ...c, decks: [{ name: "x", count: -1 }] }
            : c,
        ),
      }));
    });
    fireEvent.click(await within(stage()).findByRole("button", { name: `Edit ${market.name}` }));
    // the editor opens in the rail: its back link names the list
    const rail = screen.getByRole("complementary", { name: "What's inside" });
    expect(await within(rail).findByRole("button", { name: "What's inside" })).toBeTruthy();
    expect(within(rail).getByRole("heading", { level: 3, name: market.name })).toBeTruthy();
    // a box in error: Change the box
    act(() => {
      store.edit((q) => updateBox(q, { innerHeight: -5 }));
    });
    fireEvent.click(await within(stage()).findByRole("button", { name: "Change the box" }));
    expect(await within(rail).findByRole("heading", { level: 3, name: "The box" })).toBeTruthy();
  });

  it("shows layout notices under the plan, three then Show all", async () => {
    const { store } = renderApp({ project: twoLayers() });
    act(() => {
      store.state.lastResult.value = {
        ...(store.state.lastResult.value ?? {}),
        layout: store.state.project.value.layout ?? null,
        notices: Array.from({ length: 5 }, (_, i) => ({
          level: "warning" as const,
          code: `test.warn${i}`,
          message: `Layout warning ${i}.`,
        })),
      } as never;
      store.state.lastResultHash.value = store.state.currentHash.value;
    });
    const list = await screen.findByRole("list", { name: "Layout messages" });
    expect(list.querySelectorAll("li")).toHaveLength(3);
    // under the plan, not above it
    const plan = stage().querySelector(".pf-view") as Element;
    expect(plan.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(list.querySelectorAll("li")).toHaveLength(5);
  });

  describe("the Layer switch", () => {
    it("labels layers by number and height, and shows the one chosen", () => {
      renderApp({ project: twoLayers() });
      const group = screen.getByRole("group", { name: "Layer" });
      expect(
        within(group)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Layer 1 (bottom) · 40 mm", "Layer 2 (top) · 26 mm"]);
      expect(document.querySelector('.plan-tray[data-key="a:p0:0"]')).not.toBeNull();
      expect(document.querySelector('.plan-tray[data-key="b:p0:0"]')).toBeNull();
      fireEvent.click(within(group).getByRole("button", { name: "Layer 2 (top) · 26 mm" }));
      expect(document.querySelector('.plan-tray[data-key="b:p0:0"]')).not.toBeNull();
      expect(document.querySelector('.plan-tray[data-key="a:p0:0"]')).toBeNull();
    });

    it("labels add up to the status height, on the Harbour Kings plan", () => {
      const { project } = loadSeed("harbour-kings");
      renderApp({ project });
      const heights = within(screen.getByRole("group", { name: "Layer" }))
        .getAllByRole("button")
        .map((b) => Number(/· ([\d.]+) mm$/.exec(b.textContent ?? "")?.[1]));
      const status = /(\d+(?:\.\d)?) of 70 mm high$/.exec(
        document.querySelector(".k-status__line")?.textContent ?? "",
      )?.[1];
      expect(heights).toHaveLength(2);
      expect(Math.round(((heights[0] ?? 0) + (heights[1] ?? 0)) * 10) / 10).toBe(Number(status));
    });

    it("has no Layer group for one layer, and the plan has no picker of its own", () => {
      const p = fixtureProject();
      renderApp({
        project: { ...p, layout: makeLayout(inputsHash(p), [makeTray({ key: "a:p0:0" })]) },
      });
      expect(screen.queryByRole("group", { name: "Layer" })).toBeNull();
      expect(screen.queryByRole("radio")).toBeNull();
    });

    it("is one control: the plan holds no second Layer group", () => {
      renderApp({ project: twoLayers() });
      expect(screen.getAllByRole("group", { name: "Layer" })).toHaveLength(1);
    });
  });

  describe("the View selection", () => {
    it("is a signal of the stage, reset when the app goes", async () => {
      renderApp({ project: twoLayers(), overrides: { viewerProps: { webgl: () => true } } });
      fireEvent.click(
        within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "3D" }),
      );
      expect(stageView.value).toBe("3d");
      cleanup();
      await waitFor(() => expect(stageView.value).toBe("plan"));
    });
  });

  describe("the plan banner", () => {
    it("asks to make a new plan for a stale plan, above the status", () => {
      const p = fixtureProject();
      const { store } = renderApp({ project: { ...p, layout: makeLayout("an-older-hash") } });
      expect(store.state.stale.value).toBe(true);
      const banner = document.querySelector('[data-region="banner"] .k-notice') as HTMLElement;
      expect(banner.getAttribute("data-tone")).toBe("info");
      expect(banner.textContent).toContain("This plan is from before your last changes.");
      expect(banner.textContent).toContain("Download is off until it is updated.");
      const status = document.querySelector('[data-region="status"]') as Element;
      expect(
        banner.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Main draws the heading under its banner, with the plan's own figures
      expect(h1s()[0]?.textContent).toBe("Everything fits");
      const refit = vi.spyOn(store, "refit").mockImplementation(() => undefined);
      fireEvent.click(screen.getByRole("button", { name: "Make a new plan" }));
      expect(refit).toHaveBeenCalled();
    });
  });
});
