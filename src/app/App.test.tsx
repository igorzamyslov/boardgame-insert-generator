// src/app/App.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import { DEFAULT_SETTINGS } from "../model/settings";
import { toSerializable } from "../model/schema";
import type { Project } from "../model/types";
import { APP_VERSION, BUILD_ID } from "../model/version";
import { encodeHash } from "../test-support/link";
import { MemoryStorage } from "../test-support/memory-storage";
import type { SceneFactory, SceneHandle } from "../viewer/types";
import type { MeshSource } from "./meshes";
import type { ShareFile } from "./sendFile";
import { renameProject, updateBox } from "./actions";
import { CONFLICT_CODE, OPEN_FAILED_CODE } from "./persistence";
import {
  EMPTY_FOREIGN,
  fixtureProject,
  flush,
  makeLayout,
  makeResult,
  makeTray,
} from "./test-helpers";
import { renderApp, renderAppFromHash } from "./test-app";

// The assembly page's PNG needs a canvas, which jsdom lacks.
vi.mock("../instructions/png", async (orig) => ({
  ...(await orig<typeof import("../instructions/png")>()),
  svgToPng: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))),
}));

// jsdom's window.scrollTo only prints "Not implemented"; the app calls it when the page swaps.
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubSceneFactory(): SceneFactory {
  const handle: SceneHandle = {
    setBox: vi.fn(),
    setTrays: vi.fn(),
    setExplode: vi.fn(),
    setMaxLevel: vi.fn(),
    setSelected: vi.fn(),
    onPick: vi.fn(),
    onView: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return () => handle;
}

function withLayoutProject(): Project {
  const p = fixtureProject();
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", stack: 0, x: 0, y: 0 }),
    makeTray({ key: "b:p0:0", path: "1", stack: 1, x: 110, y: 0 }),
  ];
  return { ...p, layout: makeLayout(inputsHash(p), trays) };
}

/** A tray on the plan, by its key (trays are named, and the fixture's trays hold nothing to name them by). */
function tile(key: string): Element {
  return document.querySelector(`.plan-tray[data-key="${key}"]`) as Element;
}

/** Switches the view sheet to a tab; only the selected view's panel is mounted. */
function openTab(name: "Plan" | "3D"): void {
  fireEvent.click(screen.getByRole("tab", { name }));
}

/** The empty state and the rail both offer the Add buttons; either one adds. */
function addCards(): void {
  fireEvent.click(screen.getAllByRole("button", { name: "Add cards" })[0] as HTMLElement);
}

/** The editor in the aside asks before it removes: the Remove… button, then the answer. */
function removeFromEditor(name: string): void {
  fireEvent.click(screen.getByRole("button", { name: `Remove ${name}…` }));
  fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
}

/** The export panel is a dialog over the view; its button opens it. */
function openExport(): void {
  fireEvent.click(screen.getByRole("button", { name: "Download" }));
}

/** The packing guide's button lives in the download dialog. */
function openAssemblyPage(): void {
  openExport();
  fireEvent.click(screen.getByRole("button", { name: "Open the packing guide" }));
}

describe("App", () => {
  it("lays out the title, inputs then results and footer", () => {
    renderApp({ project: withLayoutProject() });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Insert Generator");
    const inputs = screen.getByRole("region", { name: "Inputs" });
    const titles = (): (string | undefined)[] =>
      [...inputs.querySelectorAll("details.pf-acc > summary h2")].map((t) =>
        t.textContent?.replace(/^\d+/, ""),
      );
    expect(titles()).toEqual(["The box", "What's inside"]);
    const results = screen.getByRole("main");
    expect(within(results).getByRole("heading", { level: 2, name: "Results" })).toBeTruthy();
    expect(screen.queryByText(/shared links may break/)).toBeNull();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(`v${APP_VERSION} (${BUILD_ID})`);
    expect(
      within(footer).getByRole("link", { name: "Third-party licenses" }).getAttribute("href"),
    ).toBe("./third-party-licenses.txt");
  });

  describe("first visit", () => {
    it("offers the box, the kinds, an example and where it is saved, under one h1", () => {
      renderApp();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      // the box fields are on the page itself, not behind a fold
      expect(screen.getByLabelText(/^Width/)).toBeTruthy();
      expect(screen.getByLabelText(/^Keep space free on top/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Whole top" })).toBeTruthy();
      expect(screen.getByLabelText(/stored on its side/)).toBeTruthy();
      expect(screen.getAllByRole("button", { name: /^Add / })).toHaveLength(5);
      expect(screen.getByRole("button", { name: "Add tokens and dice" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Start from an example game" })).toBeTruthy();
      expect(screen.getByText("Your inserts are saved in this browser.")).toBeTruthy();
      // each field once: no second copy in a rail
      expect(document.querySelectorAll("#box-innerWidth")).toHaveLength(1);
      expect(screen.queryByRole("region", { name: "Inputs" })).toBeNull();
      expect(document.body.textContent).not.toMatch(/\bbits?\b/i);
    });

    it("adding the first item opens its editor", async () => {
      const { stub } = renderApp();
      fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "250" } });
      fireEvent.click(screen.getByRole("button", { name: "Add cards" }));
      // the editor is open in the rail, over the list, and the box kept what was typed
      const heading = screen.getByRole("heading", { level: 3, name: "Cards" });
      expect(document.activeElement).toBe(heading);
      expect(screen.getByRole("button", { name: "What's inside" })).toBeTruthy();
      expect(screen.getByRole("region", { name: "Inputs" })).toBeTruthy();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Start from an example game" })).toBeNull();
      await waitFor(() => expect(stub.calls).toHaveLength(1));
      // back to the list, and the box section shows the size
      fireEvent.click(screen.getByRole("button", { name: "What's inside" }));
      expect(screen.getByText(/^250 × 285 × 70 mm$/)).toBeTruthy();
    });

    it("an item added later does not open its editor when the rail was already there", () => {
      renderApp({ project: withLayoutProject() });
      expect(screen.queryByRole("heading", { level: 3, name: "Cards" })).toBeNull();
    });

    it("starts from the example game: three items, no editor open", () => {
      const { store } = renderApp();
      fireEvent.click(screen.getByRole("button", { name: "Start from an example game" }));
      expect(store.state.project.value.components.map((c) => c.kind)).toEqual([
        "cards",
        "bulk",
        "tiles",
      ]);
      const list = screen.getByRole("list", { name: "What's inside" });
      expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
      expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    });

    it("returns to the first visit when the last item goes, with the focus on a kind", () => {
      renderApp();
      addCards();
      removeFromEditor("Cards");
      expect(screen.getByRole("button", { name: "Start from an example game" })).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add cards" }));
    });
  });

  it("has no Simple/Advanced switch", () => {
    renderApp();
    expect(screen.queryByLabelText("Advanced")).toBeNull();
    expect(screen.queryByLabelText("Simple")).toBeNull();
    expect(screen.queryByRole("group", { name: "Input mode" })).toBeNull();
    expect(screen.queryByText(/Dotted edge/)).toBeNull();
    expect(document.querySelector("[data-level]")).toBeNull();
    // What the switch used to hide is in the settings sheet, not in the rail.
    expect(screen.queryByLabelText(/Bed margin/)).toBeNull();
    expect(screen.queryByLabelText(/^Corner radius/)).toBeNull();
  });

  it("adds a component and starts an optimizer run after the pause", async () => {
    const { stub } = renderApp();
    addCards();
    // a component just added opens in the aside, in the place of the list
    expect(screen.getByRole("heading", { level: 3, name: "Cards" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "What's inside" })).toBeTruthy();
    await waitFor(() => expect(stub.calls).toHaveLength(1));
  });

  it("shows plan and 3D fallback tabs and the export panel for a stored layout, and swaps with the keyboard", () => {
    const { store, stub } = renderApp({ project: withLayoutProject() });
    expect(stub.calls).toHaveLength(0);
    expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("true");
    expect(tile("a:p0:0")).toBeTruthy();
    expect(screen.queryByText(/needs WebGL/)).toBeNull();
    openTab("3D");
    expect(screen.getByText(/needs WebGL/)).toBeTruthy();
    expect(document.querySelector(".plan-tray")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Export" })).toBeNull();
    openExport();
    expect(screen.getByRole("dialog", { name: "Download" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download 3MF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Other formats" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // The export was a dialog over the 3D view, not a view of its own: closing it leaves that view.
    expect(screen.getByRole("tab", { name: "3D" }).getAttribute("aria-selected")).toBe("true");
    openTab("Plan");
    expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    fireEvent.keyDown(tile("b:p0:0"), { key: "Enter" });
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "1", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
    ]);
  });

  it("ends a swap when the view leaves the plan, whatever is selected meanwhile", () => {
    const { store } = renderApp({ project: withLayoutProject() });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    expect(screen.getByText(/Choose the tray to swap with/)).toBeTruthy();
    openTab("3D");
    expect(store.state.swapFrom.value).toBeNull();
    store.state.selection.value = "b:p0:0";
    openTab("Plan");
    expect(screen.queryByText(/Choose the tray to swap with/)).toBeNull();
    expect(screen.getByRole("button", { name: "Swap with…" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("blocks exporting while the inputs differ from the layout, even before a run starts", async () => {
    const { store } = renderApp({ project: withLayoutProject() });
    openExport();
    fireEvent.click(screen.getByRole("button", { name: "Other formats" }));
    const stl = screen.getByRole("button", { name: "Download STL files (.zip)" });
    expect(stl.getAttribute("aria-disabled")).toBeNull();
    store.edit((q) => ({ ...q, settings: { ...q.settings, wall: q.settings.wall + 0.4 } }));
    expect(store.state.stale.value).toBe(true);
    expect(await screen.findByText("Make a new plan first.")).toBeTruthy();
    for (const name of [
      "Download 3MF",
      "Download 3MF per part (.zip)",
      "Download STL files (.zip)",
    ]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-disabled")).toBe("true");
    }
  });

  it("shows settings errors next to their field, in the settings sheet", async () => {
    const { store } = renderApp();
    addCards();
    const results = screen.getByRole("main");
    expect(within(results).queryByText(/Fix the errors/)).toBeNull();
    store.edit((q) => ({ ...q, settings: { ...q.settings, bottomChamfer: 3 } }));
    expect(await within(results).findByText(/Fix the errors marked in the inputs/)).toBeTruthy();
    expect(within(results).queryByText(/add at least one component/)).toBeNull();
    // The field is in the sheet, so the summary lists no error of its own for it.
    expect(within(results).queryByRole("list", { name: "Errors without a field" })).toBeNull();
    fireEvent.click(within(results).getByRole("button", { name: "Show Settings" }));
    const sheet = screen.getByRole("dialog", { name: "Settings" });
    expect(screen.getByRole("tab", { name: /^This insert/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    const message = within(sheet).getByText(/Bottom chamfer must be at most/);
    // The message is on screen: no closed <details> between it and the page.
    for (let el = message.parentElement; el !== null; el = el.parentElement) {
      if (el.tagName === "DETAILS") {
        expect((el as HTMLDetailsElement).open).toBe(true);
      }
    }
  });

  it("opens the settings sheet on My printer for an error in the insert's printer", async () => {
    const { store } = renderApp();
    addCards();
    store.edit((q) => ({ ...q, printer: { ...q.printer, bedMargin: -1 } }));
    fireEvent.click(await screen.findByRole("button", { name: "Show Settings" }));
    expect(screen.getByRole("tab", { name: /^My printer/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("removes a component with an Undo toast that puts it back where it was", async () => {
    const { store } = renderApp();
    addCards();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add tokens and dice" })[0] as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const names = (): string[] => store.state.project.value.components.map((c) => c.name);
    expect(names()).toEqual(["Cards", "Tokens and dice"]);
    fireEvent.click(screen.getByRole("button", { name: /^Cards,/ }));
    removeFromEditor("Cards");
    expect(names()).toEqual(["Tokens and dice"]);
    const toast = await screen.findByText(/Removed “Cards”/);
    expect(toast.getAttribute("role")).toBe("status");
    fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(names()).toEqual(["Cards", "Tokens and dice"]);
    expect(screen.queryByText(/Removed “Cards”/)).toBeNull();
  });

  it("opens a row's editor in the aside and returns to the list from Done", () => {
    renderApp({ project: fixtureProject() });
    const first = within(screen.getByRole("list", { name: "What's inside" })).getAllByRole(
      "button",
      {
        name: /,/,
      },
    )[0] as HTMLElement;
    fireEvent.click(first);
    expect(screen.queryByRole("list", { name: "What's inside" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("list", { name: "What's inside" })).toBeTruthy();
  });

  it("lifts a pin from its chip, the whole stack with it", () => {
    const base = fixtureProject();
    const [first] = base.components;
    if (first === undefined) {
      throw new Error("the fixture has no component");
    }
    const project: Project = {
      ...base,
      locks: [
        { kind: "position", trayKey: `${first.id}:p0:0`, path: "0", rotated: false },
        { kind: "position", trayKey: `${first.id}:p1:0`, path: "0", rotated: true },
        { kind: "stack", trayKeys: [`${first.id}:p0:0`, `${first.id}:p1:0`] },
      ],
    };
    const { store } = renderApp({ project });
    expect(screen.getByText("Pinned, turned")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /^Unpin / })[0] as HTMLElement);
    expect(store.state.project.value.locks).toEqual([]);
    expect(screen.queryByText("Pinned, turned")).toBeNull();
  });

  it("hides the Undo toast once another edit comes after the removal", async () => {
    const { store } = renderApp();
    addCards();
    removeFromEditor("Cards");
    await screen.findByText(/Removed “Cards”/);
    act(() => store.edit((q) => renameProject(q, "Something else")));
    await waitFor(() => expect(screen.queryByText(/Removed “Cards”/)).toBeNull());
    expect(screen.queryByRole("button", { name: "Undo removal" })).toBeNull();
  });

  it("dismisses the Undo toast", async () => {
    const { store } = renderApp();
    addCards();
    removeFromEditor("Cards");
    await screen.findByText(/Removed “Cards”/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Removed “Cards”/)).toBeNull();
    expect(store.state.project.value.components).toHaveLength(0);
  });

  it("moves between the Plan and 3D tabs with the arrow keys, Home and End", () => {
    renderApp({ project: withLayoutProject() });
    const plan = screen.getByRole("tab", { name: "Plan" });
    plan.focus();
    fireEvent.keyDown(plan, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "3D" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "3D" }));
    fireEvent.keyDown(screen.getByRole("tab", { name: "3D" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Plan" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "3D" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "3D" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows the tray bar once in the 3D tab", async () => {
    renderApp({
      project: withLayoutProject(),
      overrides: {
        viewerProps: { webgl: () => true, loadScene: () => Promise.resolve(stubSceneFactory()) },
      },
    });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    openTab("3D");
    await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
    expect(screen.getAllByRole("group", { name: "Selected tray" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Lock size" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Pin" })).toHaveLength(1);
    // A swap is made on the plan, so the 3D view's bar has no Swap with….
    expect(screen.queryByRole("button", { name: "Swap with…" })).toBeNull();
    expect(document.querySelectorAll(".tray-bar")).toHaveLength(1);
  });

  describe("a layout the inputs no longer match", () => {
    const makeStale = (store: ReturnType<typeof renderApp>["store"]): void => {
      store.edit((q) => ({ ...q, settings: { ...q.settings, wall: q.settings.wall + 0.4 } }));
    };

    it("can't be opened as the packing guide, and says why", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      openExport();
      const open = screen.getByRole("button", { name: "Open the packing guide" });
      expect(open.getAttribute("aria-disabled")).toBeNull();
      makeStale(store);
      expect(await screen.findByText("Make a new plan first.")).toBeTruthy();
      expect(
        screen
          .getByRole("button", { name: "Open the packing guide" })
          .getAttribute("aria-disabled"),
      ).toBe("true");
    });

    it("turns an open packing guide read-only when it goes stale", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      expect(
        screen.getByRole("button", { name: "Print or save as PDF" }).getAttribute("aria-disabled"),
      ).toBeNull();
      makeStale(store);
      expect(await screen.findByText(/The plan is out of date/)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Print or save as PDF" }).getAttribute("aria-disabled"),
      ).toBe("true");
      expect(
        screen
          .getAllByRole("button", { name: /^Download PNG/ })
          .every((b) => b.getAttribute("aria-disabled") === "true"),
      ).toBe(true);
    });

    it("hints in the tray bar that the sizes may not match", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
      expect(document.querySelector(".tray-bar .hint")?.textContent ?? "").not.toMatch(
        /Inputs changed/,
      );
      makeStale(store);
      await waitFor(() =>
        expect(document.querySelector(".tray-bar")?.textContent).toMatch(/Inputs changed/),
      );
    });
  });

  it("locks and unlocks a tray's size from the tray bar", () => {
    const { store } = renderApp({ project: withLayoutProject() });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "size", trayKey: "a:p0:0", w: 100, d: 80, h: 40 },
    ]);
    expect(tile("a:p0:0").getAttribute("aria-label")).toMatch(/, layer 1, size locked$/);
    fireEvent.click(screen.getByRole("button", { name: "Unlock size" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("opens the packing guide and comes back", () => {
    renderApp({ project: withLayoutProject() });
    openAssemblyPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/— packing guide$/);
    fireEvent.click(screen.getByRole("button", { name: "Back to your insert" }));
    expect(screen.getByRole("tab", { name: "Plan" })).toBeTruthy();
  });

  it("has no Copy link, and Save file keeps a copy", () => {
    const { download } = renderApp();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("an old link opens as a copy and the address bar is cleared", () => {
    const stored = { ...fixtureProject(), id: "shared-project", name: "Mine" };
    const storage = new MemoryStorage();
    const sent = { ...stored, name: "Sent to me" };
    const { store, projectStore, clearHash } = renderAppFromHash(encodeHash(sent, EMPTY_FOREIGN), {
      project: stored,
      storage,
    });
    expect(store.state.project.value.name).toBe("Sent to me (copy)");
    expect(store.state.project.value.id).not.toBe(stored.id);
    // the project that was already here is untouched
    expect(projectStore.load(stored.id)).toMatchObject({ ok: true, project: { name: "Mine" } });
    expect(clearHash).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("shows a no-fit run only while its inputs are current", async () => {
    const { store } = renderApp({ project: withLayoutProject() });
    act(() => {
      store.state.lastResult.value = makeResult(null, {
        bestAttempt: { trays: [], shortfall: { x: 12.3, y: 0, z: 0 } },
      });
      store.state.lastResultHash.value = store.state.currentHash.value;
    });
    expect(await screen.findByText("The trays don't fit the box yet")).toBeTruthy();
    act(() => {
      store.edit((q) => updateBox(q, { innerWidth: q.box.innerWidth + 5 }));
    });
    await waitFor(() => expect(screen.queryByText(/don't fit the box yet/)).toBeNull());
  });

  describe("header and project menu", () => {
    afterEach(() => {
      // jsdom has no scrollIntoView: the Settings test stubs it
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    });

    const openMenu = (): HTMLElement => {
      const button = screen.getByRole("button", { name: /^Project menu/ });
      fireEvent.click(button);
      return button;
    };

    it("has the wordmark, the project name, the save state and Download", () => {
      const { store } = renderApp();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe(
        store.state.project.value.name,
      );
      expect(screen.getByText("Saved in this browser")).toBeTruthy();
      expect(document.querySelector("details.app-menu")).toBeNull();
      expect(screen.queryByRole("button", { name: "Project" })).toBeNull();
    });

    it("renames the project from the header", () => {
      const { store } = renderApp();
      fireEvent.input(screen.getByLabelText("Project name"), { target: { value: "Wingspan" } });
      expect(store.state.project.value.name).toBe("Wingspan");
    });

    it("follows the history with Undo and Redo", () => {
      const { store } = renderApp();
      const undo = () => screen.getByRole("button", { name: "Undo" });
      const redo = () => screen.getByRole("button", { name: "Redo" });
      const off = (b: HTMLElement): boolean => b.getAttribute("aria-disabled") === "true";
      expect(off(undo())).toBe(true);
      fireEvent.input(screen.getByLabelText("Project name"), { target: { value: "Wingspan" } });
      expect(off(undo())).toBe(false);
      fireEvent.click(undo());
      expect(store.state.project.value.name).not.toBe("Wingspan");
      expect(off(redo())).toBe(false);
      fireEvent.click(redo());
      expect(store.state.project.value.name).toBe("Wingspan");
    });

    it("shows Saving paused during a conflict and the dot on the menu button", async () => {
      const { store } = renderApp();
      store.state.conflict.value = true;
      store.pushNotice({ level: "warning", code: CONFLICT_CODE, message: "Another tab saved." });
      expect(await screen.findByText("Saving paused")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Project menu, 1 notice" })).toBeTruthy();
    });

    it("closes the menu when a project is chosen, and when a new one is made", () => {
      const { store } = renderApp();
      store.newProject();
      const first = store.state.projects.value.find((e) => e.id !== store.state.project.value.id);
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Your inserts" }));
      fireEvent.click(screen.getByRole("button", { name: first?.name || "(unnamed)" }));
      expect(store.state.project.value.id).toBe(first?.id);
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "New insert" }));
      expect(store.state.project.value.id).not.toBe(first?.id);
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
    });

    it("deletes an insert after the question, not before", () => {
      const { store, projectStore } = renderApp();
      store.newProject();
      const doomed = store.state.project.value.id;
      expect(projectStore.list().map((e) => e.id)).toContain(doomed);
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
      expect(projectStore.list().map((e) => e.id)).toContain(doomed);
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(projectStore.list().map((e) => e.id)).not.toContain(doomed);
    });

    it("Settings opens the settings sheet, and Escape closes it back to the menu button", () => {
      renderApp();
      const button = openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
      const dialog = screen.getByRole("dialog", { name: "Settings" });
      expect(within(dialog).getByRole("tab", { name: "This insert" })).toBeTruthy();
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(button);
    });

    it("keeps the settings and printer out of the rail", () => {
      renderApp();
      expect(document.getElementById("section-settings")).toBeNull();
      expect(document.getElementById("section-printer")).toBeNull();
    });

    it("edits this insert's settings from the sheet as one undoable step", () => {
      const { store } = renderApp();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      fireEvent.change(screen.getByRole("combobox", { name: "Walls" }), {
        target: { value: "sturdy" },
      });
      expect(store.state.project.value.settings.wall).toBe(2);
      store.undo();
      expect(store.state.project.value.settings.wall).toBe(DEFAULT_SETTINGS.wall);
    });

    it("sets my printer without touching this insert until Apply, which is one step to undo", () => {
      const { store, prefs } = renderApp();
      const before = store.state.project.value.printer;
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      fireEvent.click(screen.getByRole("tab", { name: "My printer" }));
      fireEvent.input(screen.getByLabelText(/^Bed margin/), { target: { value: "9" } });
      expect(prefs.printer.value.bedMargin).toBe(9);
      expect(store.state.project.value.printer).toEqual(before);
      fireEvent.click(screen.getByRole("button", { name: "Apply to this insert" }));
      expect(store.state.project.value.printer).toEqual(prefs.printer.value);
      expect(screen.getByText("This insert already uses this printer.")).toBeTruthy();
      store.undo();
      expect(store.state.project.value.printer).toEqual(before);
    });

    it("closes the sheet when another insert opens", async () => {
      const { store } = renderApp();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      store.newProject();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("keeps Download off until there is a plan", () => {
      renderApp();
      expect(screen.getByRole("button", { name: "Download" }).getAttribute("aria-disabled")).toBe(
        "true",
      );
    });

    it("keeps Download off, with the reason, while the plan is stale or a run is pending", async () => {
      const p = fixtureProject();
      const { store } = renderApp({ project: { ...p, layout: makeLayout("an-older-hash") } });
      const download = (): HTMLElement => screen.getByRole("button", { name: "Download" });
      expect(store.state.stale.value).toBe(true);
      expect(download().getAttribute("aria-disabled")).toBe("true");
      expect(download().getAttribute("title")).toBe("Make a new plan first");
      expect(download().getAttribute("aria-describedby")).toBeTruthy();
      fireEvent.click(download());
      expect(screen.queryByRole("heading", { name: "Download" })).toBeNull();
      // Current again, but a run is pending.
      act(() => {
        store.state.project.value = {
          ...store.state.project.value,
          layout: makeLayout(store.state.currentHash.value),
        };
        store.state.runScheduled.value = true;
      });
      expect(download().getAttribute("aria-disabled")).toBe("true");
      // Only a run is pending: the plan updates by itself, so the reason says to wait.
      expect(download().getAttribute("title")).toBe("Wait for the plan to finish");
      act(() => {
        store.state.runScheduled.value = false;
      });
      expect(download().getAttribute("aria-disabled")).toBe("false");
    });

    it("Download opens the export dialog once there is a plan", () => {
      renderApp({ project: withLayoutProject() });
      fireEvent.click(screen.getByRole("button", { name: "Download" }));
      expect(screen.getByRole("heading", { name: "Download" })).toBeTruthy();
    });

    it("returns the focus to the menu button after a choice", () => {
      renderApp();
      const button = openMenu();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "New insert" }));
      fireEvent.click(screen.getByRole("button", { name: "New insert" }));
      expect(document.activeElement).toBe(button);
    });

    it("opens a chosen insert file, and tells when it can't be read", async () => {
      const { store } = renderApp();
      const input = screen.getByLabelText("Open an insert file") as HTMLInputElement;
      expect(input.getAttribute("aria-hidden")).toBe("true");
      expect(input.tabIndex).toBe(-1);
      const other = { ...fixtureProject(), id: "from-file", name: "From a file" };
      const text = JSON.stringify(toSerializable(other, EMPTY_FOREIGN));
      fireEvent.change(input, { target: { files: [new File([text], "a.insert.json")] } });
      await waitFor(() => expect(store.state.project.value.id).toBe("from-file"));
      const broken = new File(["x"], "broken.json");
      Object.defineProperty(broken, "text", {
        value: () => Promise.reject(new Error("unreadable")),
      });
      fireEvent.change(input, { target: { files: [broken] } });
      expect(await screen.findByText(/Couldn't read broken\.json: unreadable/)).toBeTruthy();
      expect(input.value).toBe("");
    });

    it("Send file hands the file to the share sheet", async () => {
      const share = vi.fn<ShareFile>(() => Promise.resolve("shared"));
      const { download } = renderApp({ overrides: { share } });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const file = share.mock.calls[0]?.[0] as File;
      expect(file.name).toMatch(/\.insert\.json$/);
      expect(download).not.toHaveBeenCalled();
    });

    it("Send file saves the file where the share sheet can't take it", async () => {
      const share = vi.fn<ShareFile>(() => Promise.resolve("unsupported"));
      const { download } = renderApp({ overrides: { share } });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    });

    it("Send file does nothing more when the sheet is dismissed", async () => {
      const share = vi.fn<ShareFile>(() => Promise.resolve("cancelled"));
      const { download } = renderApp({ overrides: { share } });
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      await flush();
      expect(download).not.toHaveBeenCalled();
    });
  });

  it("has no preview banner, whatever the version", () => {
    renderApp();
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.querySelector(".preview-banner")).toBeNull();
    expect(screen.queryByText(/Preview:/)).toBeNull();
  });

  it("offers Reprint everything, not Keep searching, for a layout made under older geometry", async () => {
    const p = fixtureProject();
    renderApp({
      project: {
        ...p,
        layout: makeLayout(inputsHash(p), undefined, { geometryVersion: "0.1.0" }),
      },
    });
    expect(await screen.findByRole("button", { name: "Reprint everything" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
    expect(
      screen.getByText(
        "Made with an older version of the app. Trays printed from it won't stack with trays you print now.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use the old plan" }));
    expect(screen.queryByRole("button", { name: "Reprint everything" })).toBeNull();
  });

  it("shows the stale banner after Use the old plan and an edit", () => {
    const p = fixtureProject();
    const { store } = renderApp({
      project: {
        ...p,
        layout: makeLayout(inputsHash(p), undefined, { geometryVersion: "0.1.0" }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use the old plan" }));
    expect(screen.queryByRole("button", { name: "Make a new plan" })).toBeNull();
    act(() => {
      store.edit((q) => updateBox(q, { innerWidth: q.box.innerWidth + 5 }));
    });
    // the edit's own run has settled without a new plan
    act(() => {
      store.state.runScheduled.value = false;
      store.state.run.value = { status: "idle" };
    });
    expect(store.state.stale.value).toBe(true);
    expect(screen.getByText("This plan is from before your last changes.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make a new plan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reprint everything" })).toBeNull();
  });

  describe("status line", () => {
    const status = (): HTMLElement => screen.getByRole("group", { name: "Plan status" });

    it("says everything fits, with the trays, the layers and the height", () => {
      renderApp({ project: withLayoutProject() });
      // two stored trays 40 mm high; the box is 70 mm inside and keeps 8 mm free on top
      expect(status().textContent).toContain("Everything fits.");
      expect(status().textContent).toContain("2 trays in 1 layer, 40 of 62 mm high.");
      expect(screen.getByRole("button", { name: "Download" }).getAttribute("aria-disabled")).toBe(
        "false",
      );
    });

    it("Keep searching starts a longer search and becomes Stop while it runs", async () => {
      const { stub } = renderApp({ project: withLayoutProject() });
      fireEvent.click(screen.getByRole("button", { name: "Keep searching" }));
      expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
      expect(stub.calls).toHaveLength(1);
      expect(screen.getByRole("progressbar", { name: "Updating the plan" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
      expect(stub.cancelCount()).toBeGreaterThan(0);
      await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
      expect(screen.getByRole("button", { name: "Keep searching" })).toBeTruthy();
    });

    it("keeps the focus on the button across Keep searching and Stop", async () => {
      renderApp({ project: withLayoutProject() });
      const keep = screen.getByRole("button", { name: "Keep searching" });
      keep.focus();
      fireEvent.click(keep);
      const stop = await screen.findByRole("button", { name: "Stop" });
      expect(document.activeElement).toBe(stop);
      fireEvent.click(stop);
      const again = await screen.findByRole("button", { name: "Keep searching" });
      expect(document.activeElement).toBe(again);
    });

    it("names the component that does not fit, opens its editor, and keeps Download off", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      const market = store.state.project.value.components[1];
      const tray = makeTray({
        key: "m:p0:0",
        x: 200,
        w: 120,
        compartments: [
          {
            x: 1.6,
            y: 1.6,
            w: 100,
            d: 70,
            floorZ: 1.2,
            kind: "well",
            contents: "Market",
            componentId: market?.id,
            features: [],
          },
        ],
      });
      act(() => {
        store.state.lastResult.value = makeResult(null, {
          bestAttempt: { trays: [tray], shortfall: { x: 30, y: 0, z: 0 } },
        });
        store.state.lastResultHash.value = store.state.currentHash.value;
      });
      expect(status().textContent).toContain("Market doesn't fit the box yet");
      expect(status().textContent).not.toContain("Everything fits");
      const download = screen.getByRole("button", { name: "Fix the fit to download" });
      expect(download.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(download);
      expect(screen.queryByRole("dialog", { name: "Download" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Edit Market" }));
      expect(await screen.findByRole("heading", { name: "Market" })).toBeTruthy();
      // leaving the editor does not bring it back
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(screen.queryByRole("heading", { name: "Market" })).toBeNull();
    });

    it("says a tray is too big for the bed when the run reports it", () => {
      const { store } = renderApp({ project: withLayoutProject() });
      const market = store.state.project.value.components[1];
      const tray = makeTray({
        key: "m:p0:0",
        compartments: [
          {
            x: 1.6,
            y: 1.6,
            w: 100,
            d: 70,
            floorZ: 1.2,
            kind: "well",
            contents: "Market",
            componentId: market?.id,
            features: [],
          },
        ],
      });
      act(() => {
        store.state.lastResult.value = makeResult(null, {
          bestAttempt: {
            trays: [tray],
            shortfall: { x: 0, y: 0, z: 0 },
            overBedKeys: ["m:p0:0"],
          },
        });
        store.state.lastResultHash.value = store.state.currentHash.value;
      });
      expect(status().textContent).toContain("Market is too big for your printer's bed");
    });

    it("offers to unpin each pin the last run could not keep", async () => {
      const p = withLayoutProject();
      const { store } = renderApp({
        project: {
          ...p,
          locks: [
            { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
            { kind: "size", trayKey: "b:p0:0", w: 100, d: 80, h: 40 },
          ],
        },
      });
      act(() => {
        store.state.lockConflicts.value = [
          { trayKey: "a:p0:0", kind: "position", name: "Action cards", reason: "it is too big" },
          { trayKey: "b:p0:0", kind: "size", name: "Market", reason: "no room" },
        ];
      });
      expect(status().textContent).toContain("Action cards doesn't fit with your pins");
      expect(status().textContent).toContain("Market doesn't fit with your pins");
      expect(screen.getByRole("button", { name: "Fix the fit to download" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Unpin Action cards" }));
      // only that pin goes, and the plan updates; the other conflict waits for the run's verdict
      expect(store.state.project.value.locks.map((l) => l.kind)).toEqual(["size"]);
      expect(store.state.lockConflicts.value.map((c) => c.name)).toEqual(["Market"]);
      expect(status().textContent).toBe("Updating the plan…");
    });

    it("unpins a stack the last run could not keep", () => {
      const p = withLayoutProject();
      const { store } = renderApp({
        project: { ...p, locks: [{ kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] }] },
      });
      act(() => {
        store.state.lockConflicts.value = [
          { trayKey: "a:p0:0", kind: "stack", name: "Action cards, Market", reason: "no room" },
        ];
      });
      expect(status().textContent).toContain("Action cards, Market doesn't fit with your pins");
      fireEvent.click(screen.getByRole("button", { name: "Unpin Action cards, Market" }));
      expect(store.state.project.value.locks).toEqual([]);
      expect(store.state.lockConflicts.value).toEqual([]);
    });

    it("says the plan is updating while a run is pending, with Download waiting", () => {
      const { store } = renderApp({ project: withLayoutProject() });
      act(() => {
        store.state.runScheduled.value = true;
      });
      expect(status().textContent).toBe("Updating the plan…");
      expect(screen.getByRole("button", { name: "Download" }).getAttribute("title")).toBe(
        "Wait for the plan to finish",
      );
    });
  });

  describe("conflict notices", () => {
    const notice = (message: string) => ({
      level: "info" as const,
      code: CONFLICT_CODE,
      message,
    });
    const openMenu = (): void => {
      fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
    };

    it("offers no choice on a notice left over from a resolved conflict", async () => {
      const { store } = renderApp();
      store.pushNotice(notice("Your version was kept as a copy."));
      expect(store.state.conflict.value).toBe(false);
      openMenu();
      expect(await screen.findByText(/kept as a copy/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Use this tab's version" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Use the other tab/ })).toBeNull();
    });

    it("can't be dismissed during a real conflict, only after it is resolved", async () => {
      const { store } = renderApp();
      store.state.conflict.value = true;
      store.pushNotice(notice("Another tab saved this project."));
      openMenu();
      expect(await screen.findByText(/Another tab saved/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Dismiss: Another tab saved/ })).toBeNull();
      store.state.conflict.value = false;
      expect(
        await screen.findByRole("button", { name: /^Dismiss: Another tab saved/ }),
      ).toBeTruthy();
    });

    it("offers both choices during a real conflict and passes them on", async () => {
      const { store } = renderApp();
      const resolve = vi.spyOn(store, "resolveConflict").mockImplementation(() => undefined);
      store.state.conflict.value = true;
      store.pushNotice(notice("Another tab saved this project."));
      openMenu();
      fireEvent.click(await screen.findByRole("button", { name: "Use this tab's version" }));
      expect(resolve).toHaveBeenLastCalledWith("keepMine");
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Use the other tab's version" }));
      expect(resolve).toHaveBeenLastCalledWith("loadTheirs");
    });

    it("conflict shows a menu dot and both choices", async () => {
      const { store, projectStore } = renderApp();
      const mine = store.state.project.value;
      // The other tab saved a different version of the same insert.
      projectStore.save({ ...mine, name: "From the other tab" }, EMPTY_FOREIGN);
      store.edit((q) => renameProject(q, "From this tab"));
      store.onExternalChange();
      expect(store.state.conflict.value).toBe(true);
      expect(document.querySelector(".app-notices")).toBeNull();
      const menu = await screen.findByRole("button", { name: "Project menu, 1 notice" });
      expect(document.querySelector(".app-menu-dot")).not.toBeNull();
      fireEvent.click(menu);
      const panel = screen.getByRole("group", { name: "Project" });
      const first = panel.querySelector("button");
      expect(first?.textContent).toBe("Use this tab's version");
      expect(
        within(panel).getByRole("button", { name: "Use the other tab's version" }),
      ).toBeTruthy();
    });
  });

  describe("notice placement", () => {
    it("Reprint everything re-plans with the current geometry", async () => {
      const p = fixtureProject();
      const { store } = renderApp({
        project: {
          ...p,
          layout: makeLayout(inputsHash(p), undefined, { geometryVersion: "0.1.0" }),
        },
      });
      const refit = vi.spyOn(store, "refit").mockImplementation(() => undefined);
      fireEvent.click(await screen.findByRole("button", { name: "Reprint everything" }));
      expect(refit).toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Download" })).toBeNull();
    });

    it("shows only the older-geometry banner when the plan is also stale", async () => {
      const p = fixtureProject();
      renderApp({
        project: {
          ...p,
          layout: makeLayout("an-older-hash", undefined, { geometryVersion: "0.1.0" }),
        },
      });
      expect(await screen.findByRole("button", { name: "Reprint everything" })).toBeTruthy();
      expect(screen.queryByText("This plan is from before your last changes.")).toBeNull();
    });

    it("folds inline notices behind Show all after three, and never hides an error", async () => {
      const { store } = renderApp();
      for (const i of [1, 2, 3, 4]) {
        store.pushNotice({ level: "info", code: `test.note${i}`, message: `Note ${i}.` });
      }
      store.pushNotice({ level: "error", code: "test.err", message: "Broken." });
      expect(await screen.findByText("Broken.")).toBeTruthy();
      expect(document.querySelectorAll(".app-notices li")).toHaveLength(3);
      expect(screen.getByRole("button", { name: /^Show all 5 messages/ })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /^Show all 5 messages/ }));
      expect(document.querySelectorAll(".app-notices li")).toHaveLength(5);
    });

    const stalePlan = (): Project => {
      const p = fixtureProject();
      return { ...p, layout: makeLayout("an-older-hash") };
    };

    it("shows the stale banner once, with Make a new plan", async () => {
      const { store } = renderApp({ project: stalePlan() });
      expect(store.state.stale.value).toBe(true);
      expect(await screen.findByText("This plan is from before your last changes.")).toBeTruthy();
      expect(screen.queryByText(/Inputs changed since this plan was made/)).toBeNull();
      const refit = vi.spyOn(store, "refit").mockImplementation(() => undefined);
      fireEvent.click(screen.getByRole("button", { name: "Make a new plan" }));
      expect(refit).toHaveBeenCalled();
    });

    it("no stale banner while a run is pending", async () => {
      const { store } = renderApp({ project: stalePlan() });
      expect(await screen.findByText("This plan is from before your last changes.")).toBeTruthy();
      act(() => {
        store.state.runScheduled.value = true;
      });
      expect(screen.queryByText("This plan is from before your last changes.")).toBeNull();
      act(() => {
        store.state.runScheduled.value = false;
        store.state.run.value = { status: "running", done: 1, total: 4 };
      });
      expect(screen.queryByText("This plan is from before your last changes.")).toBeNull();
      act(() => {
        store.state.run.value = { status: "idle" };
      });
      expect(screen.getByText("This plan is from before your last changes.")).toBeTruthy();
    });

    it("shows no stale banner when the inputs do not fit", async () => {
      const { store } = renderApp({ project: stalePlan() });
      expect(await screen.findByText("This plan is from before your last changes.")).toBeTruthy();
      act(() => {
        store.state.lastResult.value = makeResult(null, {
          notices: [{ level: "error", code: "layout.doesNotFit", message: "Does not fit." }],
        });
        store.state.lastResultHash.value = store.state.currentHash.value;
      });
      expect(screen.queryByText("This plan is from before your last changes.")).toBeNull();
    });

    it("shows a failed open inline, under the header", async () => {
      const { store } = renderApp();
      store.pushNotice({ level: "error", code: OPEN_FAILED_CODE, message: "That file is broken." });
      expect(await screen.findByText("That file is broken.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Project menu" })).toBeTruthy();
      expect(document.querySelector(".app-menu-dot")).toBeNull();
    });
  });

  describe("export dialog", () => {
    const exportButton = (): HTMLElement => screen.getByRole("button", { name: "Download" });

    afterEach(() => {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
      Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    });

    it("opens as a modal dialog (so the page behind is inert) and starts at its heading", () => {
      const showModal = vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      });
      HTMLDialogElement.prototype.showModal = showModal;
      renderApp({ project: withLayoutProject() });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(exportButton().getAttribute("aria-haspopup")).toBe("dialog");
      fireEvent.click(exportButton());
      expect(showModal).toHaveBeenCalledTimes(1);
      const dialog = screen.getByRole("dialog", { name: "Download" });
      expect(dialog.tagName).toBe("DIALOG");
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Download" }));
    });

    it("has the header Download as its only way in", () => {
      renderApp({ project: withLayoutProject() });
      expect(screen.queryByRole("button", { name: /^Export all/ })).toBeNull();
      expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(1);
    });

    it("closes on Escape, on Close, and puts the focus back on its button", () => {
      renderApp({ project: withLayoutProject() });
      exportButton().focus();
      fireEvent.click(exportButton());
      // Escape reaches a modal <dialog> as a cancel event.
      fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(exportButton());
      fireEvent.click(exportButton());
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(exportButton());
    });

    it("leaves the view, the selection and the tab exactly as they were", () => {
      const { store } = renderApp({ project: withLayoutProject() });
      openTab("3D");
      store.state.selection.value = "a:p0:0";
      openExport();
      fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      expect(screen.getByRole("tab", { name: "3D" }).getAttribute("aria-selected")).toBe("true");
      expect(store.state.selection.value).toBe("a:p0:0");
      expect(screen.getByText(/needs WebGL/)).toBeTruthy();
    });

    it("closes itself when another project is opened", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      openExport();
      store.newProject();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("cancels a running export when it is closed, as leaving the old export view did", async () => {
      const waits: MeshSource["get"] = (_spec, _settings, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("cancelled")));
        });
      const { download } = renderApp({
        project: withLayoutProject(),
        overrides: {
          meshes: { get: waits, reset: vi.fn(), forget: vi.fn(), dispose: vi.fn() },
        },
      });
      openExport();
      fireEvent.click(screen.getByRole("button", { name: "Download 3MF" }));
      expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await flush();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(download).not.toHaveBeenCalled();
    });
  });

  describe("packing guide", () => {
    it("moves the focus to the page and back to its button, and scrolls to the top", () => {
      renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      fireEvent.click(screen.getByRole("button", { name: "Back to your insert" }));
      // Back where the export was opened from: its button.
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Download" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("hands its downloads to the app's download function", async () => {
      const { download } = renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      fireEvent.click(screen.getByRole("button", { name: /^Download PNG of layer 1/ }));
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      expect(download.mock.calls[0]?.[1]).toMatch(/-layer-1\.png$/);
    });

    it("returns to the editor when the layout goes away, and stays there when one comes back", async () => {
      const project = withLayoutProject();
      const { store } = renderApp({ project });
      openAssemblyPage();
      store.newProject();
      // the new insert is empty: the first visit, not the inputs rail
      expect(
        await screen.findByRole("button", { name: "Start from an example game" }),
      ).toBeTruthy();
      store.openProject(project.id);
      expect(await screen.findByRole("tab", { name: "Plan" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to your insert" })).toBeNull();
    });

    it("returns to the editor when another project is opened", async () => {
      const { store, projectStore } = renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      const other = { ...fixtureProject(), id: "other-project", name: "Other" };
      projectStore.save({ ...other, layout: makeLayout(inputsHash(other)) }, EMPTY_FOREIGN);
      store.openProject(other.id);
      expect(await screen.findByRole("region", { name: "Inputs" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to your insert" })).toBeNull();
    });
  });

  it("pins the whole stack from the tray bar's Pin button", () => {
    const p = fixtureProject();
    const trays = [
      makeTray({ key: "a:p0:0", path: "0", level: 0, z: 0 }),
      makeTray({ key: "b:p0:1", path: "0", level: 1, z: 40 }),
      makeTray({ key: "c:p1:0", path: "1", stack: 1, x: 110 }),
    ];
    const { store } = renderApp({ project: { ...p, layout: makeLayout(inputsHash(p), trays) } });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    const locks = store.state.project.value.locks;
    expect(locks.filter((l) => l.kind === "position").map((l) => l.trayKey)).toEqual([
      "a:p0:0",
      "b:p0:1",
    ]);
    expect(locks.some((l) => l.kind === "stack")).toBe(true);
    expect(screen.getByText("Pinned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  /** The tray bar, so a chip is looked for there and not in the list's own chips. */
  const trayBar = (): HTMLElement => screen.getByRole("group", { name: "Selected tray" });

  it("keyboard pin and swap", () => {
    const { store } = renderApp({ project: withLayoutProject() });
    // A tray is in the Tab order, and Space or Enter on it selects it.
    const a = tile("a:p0:0");
    expect(a.getAttribute("role")).toBe("button");
    // Lower-case `tabindex`: an SVG attribute is case-sensitive, and `tabIndex` there is no tab stop.
    expect(a.getAttribute("tabindex")).toBe("0");
    expect(a.hasAttribute("tabIndex")).toBe(false);
    fireEvent.keyDown(a, { key: " " });
    expect(store.state.selection.value).toBe("a:p0:0");
    // Pin and Swap with… are buttons, so Enter or Space on them is a click.
    fireEvent.click(within(trayBar()).getByRole("button", { name: "Pin" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
    ]);
    expect(within(trayBar()).getByText("Pinned")).toBeTruthy();
    fireEvent.click(within(trayBar()).getByRole("button", { name: "Swap with…" }));
    expect(
      within(trayBar()).getByRole("button", { name: "Swap with…" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // Enter on the other tray: both stacks are pinned where the other stood.
    fireEvent.keyDown(tile("b:p0:0"), { key: "Enter" });
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "1", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
    ]);
    // The swap leaves the first tray selected, pinned, with its chip.
    expect(store.state.swapFrom.value).toBeNull();
    expect(within(trayBar()).getByRole("button", { name: "Unpin" })).toBeTruthy();
    expect(within(trayBar()).getByText("Pinned")).toBeTruthy();
  });

  /** Two trays the project's own components made (what a turn's dry run checks against), in a tall box. */
  function turnable(over: Partial<ReturnType<typeof makeTray>> = {}): Project {
    const base = fixtureProject();
    const p = { ...base, box: { ...base.box, innerHeight: 200 } };
    const trays = [
      makeTray({ key: "fxcrd003:p0:0", path: "0", w: 72, d: 96, ...over }),
      makeTray({ key: "fxcrd001:p0:0", path: "1", stack: 1, x: 110, w: 72, d: 96 }),
    ];
    return { ...p, layout: makeLayout(inputsHash(p), trays) };
  }

  it("turns a tray from the bar, which pins it turned, and Unpin undoes it", () => {
    const { store } = renderApp({ project: turnable() });
    fireEvent.keyDown(tile("fxcrd003:p0:0"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Turn 90°" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "fxcrd003:p0:0", path: "0", rotated: true },
    ]);
    expect(within(trayBar()).getByText("Pinned, turned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("reads Pinned, turned for a tray the optimizer had already turned, and Turn flips it back", () => {
    const { store } = renderApp({ project: turnable({ rotated: true }) });
    fireEvent.keyDown(tile("fxcrd003:p0:0"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "fxcrd003:p0:0", path: "0", rotated: true },
    ]);
    // The chip reads the pin's rotation, so a pin of a tray that was laid turned says so too.
    expect(within(trayBar()).getByText("Pinned, turned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn 90°" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "fxcrd003:p0:0", path: "0", rotated: false },
    ]);
    expect(within(trayBar()).getByText("Pinned")).toBeTruthy();
    expect(within(trayBar()).queryByText("Pinned, turned")).toBeNull();
  });

  it("says why a square tray can't turn, and writes nothing when asked", () => {
    const p = fixtureProject();
    const trays = [makeTray({ key: "a:p0:0", w: 80, d: 80 })];
    const { store } = renderApp({ project: { ...p, layout: makeLayout(inputsHash(p), trays) } });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    const turn = screen.getByRole("button", { name: "Turn 90°" });
    expect(turn.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("This tray is square, so turning changes nothing.")).toBeTruthy();
    fireEvent.click(turn);
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("hides the generic hint while the bar shows", () => {
    renderApp({ project: withLayoutProject() });
    expect(screen.getByText(/Select a tray to see its details/)).toBeTruthy();
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    expect(screen.queryByText(/Select a tray to see its details/)).toBeNull();
  });

  describe("Edit and Close", () => {
    const market = (): Project => {
      const p = fixtureProject();
      const t = makeTray({
        key: "m:p0:0",
        compartments: [
          {
            x: 1.6,
            y: 1.6,
            w: 96.8,
            d: 76.8,
            floorZ: 1.2,
            kind: "well",
            contents: "Market ×30",
            componentId: "fxcrd002",
            features: [],
          },
        ],
      });
      return { ...p, layout: makeLayout(inputsHash(p), [t]) };
    };

    it("Edit opens the component's editor panel in the rail, as a row does", async () => {
      renderApp({ project: market() });
      const rail = screen.getByRole("region", { name: "Inputs" });
      // The list is showing, with no editor.
      expect(within(rail).queryByRole("heading", { level: 3 })).toBeNull();
      fireEvent.keyDown(tile("m:p0:0"), { key: "Enter" });
      expect(within(trayBar()).getByRole("heading", { name: "Market" })).toBeTruthy();
      fireEvent.click(within(trayBar()).getByRole("button", { name: "Edit" }));
      // The editor panel is open for that component, with its way back to the list.
      const heading = await within(rail).findByRole("heading", { level: 3, name: "Market" });
      expect(document.activeElement).toBe(heading);
      expect(within(rail).getByRole("button", { name: "What's inside" })).toBeTruthy();
      expect(within(rail).getByRole("button", { name: /^Remove Market/ })).toBeTruthy();
      // Back to the list leaves the tray selected.
      fireEvent.click(within(rail).getByRole("button", { name: "What's inside" }));
      expect(within(rail).queryByRole("heading", { level: 3 })).toBeNull();
      expect(screen.getByRole("group", { name: "Selected tray" })).toBeTruthy();
    });

    it("Close hands the focus back to the tray", async () => {
      renderApp({ project: market() });
      fireEvent.keyDown(tile("m:p0:0"), { key: "Enter" });
      // jsdom gives SVG elements no focus(); stand one in to see the bar hand the focus back.
      const focus = vi.fn();
      (tile("m:p0:0") as unknown as { focus: () => void }).focus = focus;
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("group", { name: "Selected tray" })).toBeNull();
      await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    });

    it("Close during a swap ends it", () => {
      const { store } = renderApp({ project: withLayoutProject() });
      fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
      fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
      expect(store.state.swapFrom.value).toBe("a:p0:0");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(store.state.swapFrom.value).toBeNull();
      expect(store.state.selection.value).toBeNull();
      expect(screen.queryByText(/Choose the tray to swap with/)).toBeNull();
    });

    it("Close in 3D hands the focus to that tray's picker item", async () => {
      renderApp({
        project: withLayoutProject(),
        overrides: {
          viewerProps: { webgl: () => true, loadScene: () => Promise.resolve(stubSceneFactory()) },
        },
      });
      fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
      openTab("3D");
      await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => {
        const item = document.activeElement as HTMLElement | null;
        expect(item?.closest(".tray-picker")).not.toBeNull();
        expect(item?.getAttribute("data-key")).toBe("a:p0:0");
      });
    });

    it("names a tray with no name 'Tray', never its key", () => {
      const p = fixtureProject();
      renderApp({
        project: { ...p, layout: makeLayout(inputsHash(p), [makeTray({ key: "zz:raw:key" })]) },
      });
      fireEvent.keyDown(tile("zz:raw:key"), { key: "Enter" });
      expect(trayBar().textContent).not.toMatch(/zz:raw:key/);
    });
  });

  it("dismisses an app notice", async () => {
    const { store } = renderApp();
    store.pushNotice({ level: "info", code: "test.note", message: "Heads up." });
    expect(await screen.findByText("Heads up.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Heads up." }));
    await waitFor(() => expect(screen.queryByText("Heads up.")).toBeNull());
    expect(store.state.appNotices.value).toEqual([]);
  });

  it("undoes the last layout from the header, and the summary has no Undo of its own", async () => {
    const p = fixtureProject();
    const before = makeLayout(inputsHash(p), [makeTray({ key: "old:p0:0" })]);
    const { store } = renderApp({ project: { ...p, layout: before } });
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    await waitFor(() => expect(store.canUndo.value).toBe(true));
    expect(screen.getAllByRole("button", { name: /undo/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.layout).toEqual(before);
    expect(store.state.project.value.box.innerHeight).toBe(p.box.innerHeight);
    expect(store.canUndo.value).toBe(false);
  });
});
