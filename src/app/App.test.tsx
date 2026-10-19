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
import type { AppProps } from "./App";
import { addComponent, renameProject, updateBox } from "./actions";
import { canOptimize } from "./runner";
import { CONFLICT_CODE, OPEN_FAILED_CODE } from "./persistence";
import {
  EMPTY_FOREIGN,
  fixtureProject,
  flush,
  makeLayout,
  makeResult,
  makeTray,
} from "./test-helpers";
import { hoveredComponent } from "../screens/hover";
import { renderApp, renderWorkspace, renderAppFromHash } from "./test-app";

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
  vi.useRealTimers();
});

function stubSceneFactory(): SceneFactory {
  const handle: SceneHandle = {
    setBox: vi.fn(),
    setTrays: vi.fn(),
    setExplode: vi.fn(),
    setMaxLevel: vi.fn(),
    setSelected: vi.fn(),
    setLit: vi.fn(),
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
  return document.querySelector(`.plan-tile[data-key="${key}"]`) as Element;
}

/**
 * What a browser does for a button that has the focus: Enter clicks on keydown, Space on keyup.
 * jsdom does neither, so the key events are real and the click they lead to is sent here.
 */
function press(el: HTMLElement, key: "Enter" | " "): void {
  el.focus();
  expect(document.activeElement).toBe(el);
  const down = fireEvent.keyDown(el, { key });
  if (key === "Enter" && down) {
    fireEvent.click(el);
  }
  const up = fireEvent.keyUp(el, { key });
  if (key === " " && down && up) {
    fireEvent.click(el);
  }
}

/** The tray bar's More (it holds Swap with… and Lock size): opens its panel. */
function openMore(): void {
  fireEvent.click(screen.getByRole("button", { name: "More" }));
}

/** The stage's View segment: "Top" shows the plan, "3D" the 3D view (only the chosen one is mounted). */
function openView(name: "Top" | "3D"): void {
  fireEvent.click(
    within(screen.getByRole("group", { name: "View" })).getByRole("button", { name }),
  );
}

/** Whether a View option is the pressed one. */
function viewPressed(name: "Top" | "3D"): boolean {
  return (
    within(screen.getByRole("group", { name: "View" }))
      .getByRole("button", { name })
      .getAttribute("aria-pressed") === "true"
  );
}

/** A browser that can draw the 3D view: the segment's "3D" is open, and the scene is a stub. */
function withWebGL(): { viewerProps: AppProps["viewerProps"] } {
  return {
    viewerProps: { webgl: () => true, loadScene: () => Promise.resolve(stubSceneFactory()) },
  };
}

/**
 * Adds a kind of item: on the first visit the kinds are on the page; later they are behind the Add
 * pill of the rail.
 */
function addKind(name: string): void {
  const pill = screen.queryByRole("button", { name: "Add" });
  if (pill !== null) {
    fireEvent.click(pill);
  }
  fireEvent.click(screen.getByRole("button", { name }));
}

function addCards(): void {
  addKind("Cards");
}

/** The editor in the aside asks before it removes: the Remove… button, then the answer. */
function removeFromEditor(name: string): void {
  fireEvent.click(screen.getByRole("button", { name: `Remove ${name}…` }));
  fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
}

/** The live region that speaks a removal: on the page before there is anything to say. */
function removedLive(): HTMLElement {
  const el = document.querySelector<HTMLElement>("[data-live='removed']");
  if (el === null) {
    throw new Error("the removal's live region is not on the page");
  }
  return el;
}

/** The export panel is a dialog over the view; its button opens it. */
function openExport(): void {
  fireEvent.click(screen.getByRole("button", { name: "Download" }));
}

/** The packing guide's button lives in the download dialog. */
function openAssemblyPage(): void {
  openExport();
  fireEvent.click(screen.getByRole("button", { name: /^Packing guide/ }));
}

describe("App", () => {
  it("lays out the rail with the box and what's inside, then the stage under the status heading", () => {
    renderApp({ project: withLayoutProject() });
    // the status heading is the page's one h1 on the workspace; the wordmark is not a heading
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Everything fits");
    expect(screen.queryByRole("heading", { name: "Insert Generator" })).toBeNull();
    const rail = screen.getByRole("complementary", { name: "What's inside" });
    expect(within(rail).getByRole("button", { name: /^The box/ })).toBeTruthy();
    expect(within(rail).getByRole("heading", { level: 2, name: "What's inside" })).toBeTruthy();
    expect(within(rail).getByRole("button", { name: "Add" })).toBeTruthy();
    // the numbered accordion is gone
    expect(document.querySelector("details.pf-acc")).toBeNull();
    const stage = screen.getByRole("main");
    expect(within(stage).getByRole("heading", { level: 1, name: "Everything fits" })).toBeTruthy();
    expect(screen.queryByText(/shared links may break/)).toBeNull();
  });

  it("has no footer: the version and the licences are the project menu's last two lines", () => {
    renderApp({ project: withLayoutProject() });
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByText(/Third-party licenses/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    const panel = screen.getByRole("group", { name: "Project" });
    const [version, licences] = [...panel.children].slice(-2);
    expect(version?.textContent).toBe(`Insert Generator ${APP_VERSION} (${BUILD_ID})`);
    expect(licences?.getAttribute("href")).toBe("./third-party-licenses.txt");
  });

  // The first visit's own tests are in screens/FirstVisit.test.tsx.
  it("an item added later does not open its editor when the rail was already there", () => {
    renderApp({ project: withLayoutProject() });
    expect(screen.queryByRole("heading", { level: 3, name: "Cards" })).toBeNull();
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
    const heading = screen.getByRole("heading", { level: 2, name: "Cards" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole("button", { name: "What's inside" })).toBeTruthy();
    await waitFor(() => expect(stub.calls).toHaveLength(1));
  });

  it("shows the View segment and the export panel for a stored layout, and swaps with the keyboard", () => {
    const { store, stub } = renderApp({ project: withLayoutProject(), overrides: withWebGL() });
    expect(stub.calls).toHaveLength(0);
    expect(viewPressed("Top")).toBe(true);
    expect(viewPressed("3D")).toBe(false);
    expect(tile("a:p0:0")).toBeTruthy();
    expect(screen.queryByText(/WebGL turned on/)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    openView("3D");
    expect(viewPressed("3D")).toBe(true);
    expect(document.querySelector(".plan-tile")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Export" })).toBeNull();
    openExport();
    expect(screen.getByRole("dialog", { name: "Ready to print" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download the 3MF file" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Other formats" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // The export was a dialog over the 3D view, not a view of its own: closing it leaves that view.
    expect(viewPressed("3D")).toBe(true);
    openView("Top");
    expect(viewPressed("Top")).toBe(true);
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    openMore();
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    fireEvent.keyDown(tile("b:p0:0"), { key: "Enter" });
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "1", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
    ]);
  });

  it("blocks 3D without WebGL, says why, and keeps the top view", () => {
    renderApp({ project: withLayoutProject() });
    const threeD = within(screen.getByRole("group", { name: "View" })).getByRole("button", {
      name: "3D",
    });
    expect(threeD.getAttribute("aria-disabled")).toBe("true");
    expect(threeD.getAttribute("title")).toBe("3D needs WebGL");
    expect(
      screen.getByText("3D needs a browser with WebGL turned on. The top view works the same."),
    ).toBeTruthy();
    fireEvent.click(threeD);
    expect(viewPressed("Top")).toBe(true);
    expect(tile("a:p0:0")).toBeTruthy();
  });

  it("ends a swap when the view leaves the plan, whatever is selected meanwhile", () => {
    const { store } = renderApp({ project: withLayoutProject(), overrides: withWebGL() });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    openMore();
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    expect(screen.getByText(/Choose the tray to swap with/)).toBeTruthy();
    // the swap under way keeps More open on the pressed Swap with…
    expect(screen.getByRole("button", { name: "Swap with…" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    openView("3D");
    expect(store.state.swapFrom.value).toBeNull();
    store.state.selection.value = "b:p0:0";
    openView("Top");
    expect(screen.queryByText(/Choose the tray to swap with/)).toBeNull();
    openMore();
    expect(screen.getByRole("button", { name: "Swap with…" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("blocks exporting while the inputs differ from the layout, even before a run starts", async () => {
    const { store } = renderApp({ project: withLayoutProject() });
    openExport();
    fireEvent.click(screen.getByRole("button", { name: "Other formats" }));
    const stl = screen.getByRole("button", { name: "STL files (.zip)" });
    expect(stl.getAttribute("aria-disabled")).toBeNull();
    store.edit((q) => ({ ...q, settings: { ...q.settings, wall: q.settings.wall + 0.4 } }));
    expect(store.state.stale.value).toBe(true);
    expect(await screen.findByText("Make a new plan first.")).toBeTruthy();
    for (const name of ["Download the 3MF file", "One 3MF per part (.zip)", "STL files (.zip)"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-disabled")).toBe("true");
    }
  });

  it("shows settings errors next to their field, in the settings sheet", async () => {
    const { store } = renderApp();
    addCards();
    // the editor has the stage while it is open: the status heading is back once it is closed
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const results = screen.getByRole("main");
    expect(within(results).queryByText(/Fix the errors/)).toBeNull();
    store.edit((q) => ({ ...q, settings: { ...q.settings, bottomChamfer: 3 } }));
    expect(await within(results).findByText(/Fix the errors marked in the inputs/)).toBeTruthy();
    expect(within(results).queryByText(/add at least one component/)).toBeNull();
    // The field is in the sheet, so the heading lists no error of its own for it.
    expect(within(results).queryByRole("list", { name: "Errors without a field" })).toBeNull();
    fireEvent.click(within(results).getByRole("button", { name: "Settings" }));
    const sheet = screen.getByRole("dialog", { name: "Settings" });
    expect(screen.getByRole("button", { name: /^This insert/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    const message = within(sheet).getByText(/Bottom chamfer must be at most/);
    // The message is on screen: its group is open, and nothing between it and the drawer hides it.
    expect(message.closest("[hidden], [inert]")).toBeNull();
    expect(within(sheet).getByRole("group", { name: "Shape and printing" })).toBeTruthy();
  });

  it("opens the settings sheet on My printer for an error in the insert's printer", async () => {
    const { store } = renderApp();
    addCards();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    store.edit((q) => ({ ...q, printer: { ...q.printer, bedMargin: -1 } }));
    fireEvent.click(
      await within(screen.getByRole("main")).findByRole("button", { name: "Settings" }),
    );
    expect(screen.getByRole("button", { name: /^My printer/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("removes a component with an Undo toast that puts it back where it was", async () => {
    const { store } = renderApp();
    addCards();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    addKind("Tokens and dice");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const names = (): string[] => store.state.project.value.components.map((c) => c.name);
    expect(names()).toEqual(["Cards", "Tokens and dice"]);
    fireEvent.click(screen.getByRole("button", { name: /^Cards,/ }));
    removeFromEditor("Cards");
    expect(names()).toEqual(["Tokens and dice"]);
    const toast = await screen.findByText(/^Removed “Cards”\.$/);
    expect(toast.closest(".k-toast")).not.toBeNull();
    // in the stage's slot above the box, as Edit's note toast is
    expect(toast.closest(".stage-slot")).not.toBeNull();
    // the live region was on the page before it spoke, and it says the same
    const live = removedLive();
    expect(live.textContent).toMatch(/^Removed “Cards”\. Undo removal is available\.$/);
    fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
    expect(names()).toEqual(["Cards", "Tokens and dice"]);
    expect(screen.queryByText(/Removed “Cards”/)).toBeNull();
    expect(removedLive()).toBe(live);
    expect(live.textContent).toBe("");
  });

  it("has one h1 while editing: the stage's sentence", () => {
    renderApp({ project: fixtureProject() });
    const first = within(screen.getByRole("list", { name: "What's inside" })).getAllByRole(
      "button",
      { name: /,/ },
    )[0] as HTMLElement;
    fireEvent.click(first);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toBe(h1s[0]);
    // the status heading is back with the list
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).closest(".k-status")).not.toBeNull();
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
    await screen.findByText(/^Removed “Cards”\.$/);
    act(() => store.edit((q) => renameProject(q, "Something else")));
    await waitFor(() => expect(screen.queryByText(/Removed “Cards”/)).toBeNull());
    expect(screen.queryByRole("button", { name: "Undo removal" })).toBeNull();
  });

  it("dismisses the Undo toast", async () => {
    const { store } = renderApp();
    addCards();
    removeFromEditor("Cards");
    await screen.findByText(/^Removed “Cards”\.$/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/Removed “Cards”/)).toBeNull();
    expect(store.state.project.value.components).toHaveLength(0);
  });

  it("picks the view with its two buttons, as any pressed toggle: no tablist, no arrow keys", () => {
    renderApp({ project: withLayoutProject(), overrides: withWebGL() });
    const group = screen.getByRole("group", { name: "View" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Top", "3D"]);
    openView("3D");
    expect(viewPressed("3D")).toBe(true);
    expect(viewPressed("Top")).toBe(false);
    openView("Top");
    expect(viewPressed("Top")).toBe(true);
  });

  it("shows the tray bar once in the 3D tab", async () => {
    renderApp({ project: withLayoutProject(), overrides: withWebGL() });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    openView("3D");
    await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
    expect(screen.getAllByRole("region", { name: "Selected tray" })).toHaveLength(1);
    openMore();
    expect(screen.getAllByRole("button", { name: "Lock size" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Pin this (tray|stack)/ })).toHaveLength(1);
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
      const open = screen.getByRole("button", { name: /^Packing guide/ });
      expect(open.getAttribute("aria-disabled")).toBeNull();
      makeStale(store);
      expect(await screen.findByText("Make a new plan first.")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /^Packing guide/ }).getAttribute("aria-disabled"),
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

    it("leaves a plan the inputs have outgrown to its banner: the tray bar says nothing of it", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
      makeStale(store);
      await waitFor(() => expect(store.state.stale.value).toBe(true));
      expect(screen.getByRole("region", { name: "Selected tray" }).textContent).not.toMatch(
        /before your last changes|sizes shown may not match/,
      );
    });
  });

  it("locks and unlocks a tray's size from the tray bar", () => {
    const { store } = renderApp({ project: withLayoutProject() });
    fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
    openMore();
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "size", trayKey: "a:p0:0", w: 100, d: 80, h: 40 },
    ]);
    expect(tile("a:p0:0").getAttribute("aria-label")).toMatch(/, layer 1, size locked$/);
    openMore();
    fireEvent.click(screen.getByRole("button", { name: "Unlock size" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("opens the packing guide and comes back", () => {
    renderApp({ project: withLayoutProject() });
    openAssemblyPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/— packing guide$/);
    fireEvent.click(screen.getByRole("button", { name: "Back to your insert" }));
    expect(screen.getByRole("group", { name: "View" })).toBeTruthy();
  });

  it("has no Copy link, and Save file keeps a copy", () => {
    const { download } = renderWorkspace();
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
    expect(await screen.findByText("Not everything fits yet")).toBeTruthy();
    act(() => {
      store.edit((q) => updateBox(q, { innerWidth: q.box.innerWidth + 5 }));
    });
    await waitFor(() => expect(screen.queryByText("Not everything fits yet")).toBeNull());
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

    /** The open project menu's panel: the rail has a Settings button of its own. */
    const menuPanel = (): HTMLElement => screen.getByRole("group", { name: "Project" });

    /** Types a new name: the name is a button until it is pressed, then a field (left open). */
    const renameTo = (name: string): void => {
      if (screen.queryByLabelText("Project name") === null) {
        fireEvent.click(document.querySelector(".hd-name") as HTMLElement);
      }
      fireEvent.input(screen.getByLabelText("Project name"), { target: { value: name } });
    };

    it("has the wordmark, the project name, no save line and Download", () => {
      const { store } = renderWorkspace();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      // the name is a button until it is pressed, then a field
      const name = screen.getByRole("button", { name: store.state.project.value.name });
      fireEvent.click(name);
      expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe(
        store.state.project.value.name,
      );
      // saving works: the header says nothing about it
      expect(screen.queryByText("Saved in this browser")).toBeNull();
      expect(document.querySelector(".saved-status")?.textContent).toBe("");
      expect(document.querySelector("details.app-menu")).toBeNull();
      expect(screen.queryByRole("button", { name: "Project" })).toBeNull();
    });

    it("renames the project from the header", () => {
      const { store } = renderWorkspace();
      renameTo("Wingspan");
      expect(store.state.project.value.name).toBe("Wingspan");
    });

    it("follows the history with Undo and Redo", () => {
      const { store } = renderWorkspace();
      const undo = () => screen.getByRole("button", { name: "Undo" });
      const redo = () => screen.getByRole("button", { name: "Redo" });
      const off = (b: HTMLElement): boolean => b.getAttribute("aria-disabled") === "true";
      expect(off(undo())).toBe(true);
      renameTo("Wingspan");
      expect(off(undo())).toBe(false);
      fireEvent.click(undo());
      expect(store.state.project.value.name).not.toBe("Wingspan");
      expect(off(redo())).toBe(false);
      fireEvent.click(redo());
      expect(store.state.project.value.name).toBe("Wingspan");
    });

    describe("Undo and Redo from the keyboard", () => {
      const rename = renameTo;
      const key = (init: KeyboardEventInit, target: Element = document.body): boolean =>
        fireEvent.keyDown(target, init);
      const nameNow = (store: { state: { project: { value: Project } } }): string =>
        store.state.project.value.name;

      it("undoes on Ctrl+Z and Cmd+Z, redoes on Shift+Ctrl+Z, Shift+Cmd+Z and Ctrl+Y", () => {
        const { store } = renderWorkspace();
        const before = nameNow(store);
        rename("Wingspan");
        // not left to the browser: the key was taken
        expect(key({ key: "z", ctrlKey: true })).toBe(false);
        expect(nameNow(store)).toBe(before);
        expect(key({ key: "Z", ctrlKey: true, shiftKey: true })).toBe(false);
        expect(nameNow(store)).toBe("Wingspan");
        expect(key({ key: "z", metaKey: true })).toBe(false);
        expect(nameNow(store)).toBe(before);
        expect(key({ key: "Z", metaKey: true, shiftKey: true })).toBe(false);
        expect(nameNow(store)).toBe("Wingspan");
        key({ key: "z", ctrlKey: true });
        expect(nameNow(store)).toBe(before);
        expect(key({ key: "y", ctrlKey: true })).toBe(false);
        expect(nameNow(store)).toBe("Wingspan");
      });

      it("does nothing, and leaves the key to the browser, when there is nothing to undo or redo", () => {
        const { store } = renderWorkspace();
        expect(store.canUndo.value).toBe(false);
        expect(key({ key: "z", ctrlKey: true })).toBe(true);
        expect(key({ key: "y", ctrlKey: true })).toBe(true);
        expect(key({ key: "z", ctrlKey: true, shiftKey: true })).toBe(true);
        rename("Wingspan");
        // something to undo, nothing to redo
        expect(key({ key: "y", ctrlKey: true })).toBe(true);
        expect(nameNow(store)).toBe("Wingspan");
        // as the buttons say
        expect(screen.getByRole("button", { name: "Redo" }).getAttribute("aria-disabled")).toBe(
          "true",
        );
      });

      it("ignores other keys and other chords", () => {
        const { store } = renderWorkspace();
        rename("Wingspan");
        expect(key({ key: "z" })).toBe(true);
        expect(key({ key: "x", ctrlKey: true })).toBe(true);
        expect(key({ key: "z", ctrlKey: true, altKey: true })).toBe(true);
        expect(key({ key: "y", metaKey: true })).toBe(true);
        expect(key({ key: "y", ctrlKey: true, shiftKey: true })).toBe(true);
        expect(nameNow(store)).toBe("Wingspan");
      });

      it("leaves a text field its own undo", () => {
        const { store } = renderWorkspace();
        const before = nameNow(store);
        rename("Wingspan");
        const field = screen.getByLabelText("Project name");
        field.focus();
        expect(key({ key: "z", ctrlKey: true }, field)).toBe(true);
        expect(nameNow(store)).toBe("Wingspan");
        // back on the page the same key undoes
        (field as HTMLElement).blur();
        key({ key: "z", ctrlKey: true });
        expect(nameNow(store)).toBe(before);
      });

      it("stands aside while a modal dialog is open (Download, Settings), and works again after", () => {
        const { store } = renderWorkspace({ project: withLayoutProject() });
        rename("Wingspan");
        fireEvent.click(screen.getByRole("button", { name: "Download" }));
        expect(screen.getByRole("dialog", { name: "Ready to print" })).toBeTruthy();
        expect(key({ key: "z", ctrlKey: true })).toBe(true);
        expect(nameNow(store)).toBe("Wingspan");
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
        fireEvent.click(
          within(screen.getByRole("group", { name: "Project" })).getByRole("button", {
            name: "Settings",
          }),
        );
        const sheet = screen.getByRole("dialog", { name: "Settings" });
        expect(key({ key: "z", ctrlKey: true }, sheet)).toBe(true);
        expect(nameNow(store)).toBe("Wingspan");
        fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
        expect(key({ key: "z", ctrlKey: true })).toBe(false);
        expect(nameNow(store)).not.toBe("Wingspan");
      });

      it("has one listener, added with the app and removed when it goes", async () => {
        const added = vi.spyOn(document, "addEventListener");
        const removed = vi.spyOn(document, "removeEventListener");
        try {
          const { store } = renderWorkspace();
          const live = (): Set<unknown> => {
            const on = new Set(added.mock.calls.filter(([t]) => t === "keydown").map((c) => c[1]));
            for (const [t, fn] of removed.mock.calls) {
              if (t === "keydown") {
                on.delete(fn);
              }
            }
            return on;
          };
          // one listener while the app is on screen, and it is the app's, not a menu's
          expect(live().size).toBe(1);
          rename("Wingspan");
          expect(live().size).toBe(1);
          cleanup();
          await waitFor(() => expect(live().size).toBe(0));
          // nothing listens now
          expect(key({ key: "z", ctrlKey: true })).toBe(true);
          expect(nameNow(store)).toBe("Wingspan");
        } finally {
          added.mockRestore();
          removed.mockRestore();
        }
      });

      it("shows the shortcut in the buttons' titles while they work, the reason while not", () => {
        renderWorkspace();
        const title = (name: string) => screen.getByRole("button", { name }).getAttribute("title");
        expect(title("Undo")).toBe("Nothing to undo");
        expect(title("Redo")).toBe("Nothing to redo");
        rename("Wingspan");
        expect(title("Undo")).toBe("Undo (Ctrl+Z)");
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(title("Redo")).toBe("Redo (Ctrl+Y)");
      });
    });

    it("shows Saving paused during a conflict and the dot on the menu button", async () => {
      const { store } = renderWorkspace();
      store.state.conflict.value = true;
      store.pushNotice({ level: "warning", code: CONFLICT_CODE, message: "Another tab saved." });
      await waitFor(() =>
        expect(document.querySelector(".saved-status")?.textContent).toBe(
          "Saving pausedSaving paused",
        ),
      );
      expect(screen.getByRole("button", { name: "Project menu, 1 notice" })).toBeTruthy();
    });

    it("closes the menu when a project is chosen, and when a new one is made", () => {
      const { store } = renderWorkspace();
      store.newProject();
      // an empty insert is the first visit, which has no menu: give it something inside
      act(() => store.edit((q) => addComponent(q, "cards")));
      const first = store.state.projects.value.find((e) => e.id !== store.state.project.value.id);
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: /^Your inserts/ }));
      const panel = screen.getByRole("group", { name: "Project" });
      fireEvent.click(within(panel).getByRole("button", { name: first?.name || "(unnamed)" }));
      expect(store.state.project.value.id).toBe(first?.id);
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "New insert" }));
      expect(store.state.project.value.id).not.toBe(first?.id);
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
    });

    it("deletes an insert from Your inserts after the question, not before", () => {
      const { store, projectStore } = renderWorkspace();
      store.newProject();
      act(() => store.edit((q) => addComponent(q, "cards")));
      const doomed = store.state.project.value.id;
      expect(projectStore.list().map((e) => e.id)).toContain(doomed);
      openMenu();
      // Delete is not in the menu itself: it is a row's button in Your inserts
      expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^Your inserts/ }));
      fireEvent.click(document.querySelector(`[data-delete="${doomed}"]`) as HTMLElement);
      expect(projectStore.list().map((e) => e.id)).toContain(doomed);
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(projectStore.list().map((e) => e.id)).not.toContain(doomed);
    });

    it("Settings opens the settings sheet, and Escape closes it back to the menu button", () => {
      renderWorkspace();
      const button = openMenu();
      fireEvent.click(within(menuPanel()).getByRole("button", { name: "Settings" }));
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
      const dialog = screen.getByRole("dialog", { name: "Settings" });
      expect(within(dialog).getByRole("button", { name: /^This insert/ })).toBeTruthy();
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(button);
    });

    it("keeps the settings and printer out of the rail", () => {
      renderWorkspace();
      expect(document.getElementById("section-settings")).toBeNull();
      expect(document.getElementById("section-printer")).toBeNull();
    });

    it("edits this insert's settings from the sheet as one undoable step", () => {
      // two changes within a second are one step (typing): the clock moves between them
      vi.useFakeTimers({ toFake: ["Date"] });
      const { store } = renderWorkspace();
      openMenu();
      fireEvent.click(within(menuPanel()).getByRole("button", { name: "Settings" }));
      fireEvent.click(
        within(screen.getByRole("group", { name: "Walls" })).getByRole("button", {
          name: "Sturdy",
        }),
      );
      expect(store.state.project.value.settings.wall).toBe(2);
      // the header counts it, and so does the Walls group (the fixture's rim is on, the default);
      // Reset all puts it back as one more step
      expect(screen.getAllByText("1 changed")).toHaveLength(2);
      vi.setSystemTime(Date.now() + 5000);
      fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
      expect(store.state.project.value.settings.wall).toBe(DEFAULT_SETTINGS.wall);
      act(() => store.undo());
      expect(store.state.project.value.settings.wall).toBe(2);
      act(() => store.undo());
      expect(store.state.project.value.settings.wall).toBe(DEFAULT_SETTINGS.wall);
    });

    it("sets my printer without touching this insert until Apply, which is one step to undo", () => {
      const { store, prefs } = renderWorkspace();
      const before = store.state.project.value.printer;
      openMenu();
      fireEvent.click(within(menuPanel()).getByRole("button", { name: "Settings" }));
      fireEvent.click(screen.getByRole("button", { name: "My printer" }));
      // the insert and the browser agree: nothing to apply
      expect(screen.queryByText("This insert uses another printer")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^Printer details/ }));
      fireEvent.input(screen.getByLabelText(/^Bed margin/), { target: { value: "9" } });
      expect(prefs.printer.value.bedMargin).toBe(9);
      expect(store.state.project.value.printer).toEqual(before);
      // now the insert uses another printer: a row at the top says so, with Apply
      expect(screen.getByText("This insert uses another printer")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(store.state.project.value.printer).toEqual(prefs.printer.value);
      expect(screen.queryByText("This insert uses another printer")).toBeNull();
      act(() => store.undo());
      expect(store.state.project.value.printer).toEqual(before);
      expect(screen.getByText("This insert uses another printer")).toBeTruthy();
    });

    it("offers Apply when the insert is on a 220 mm bed and the browser's printer is 256 mm", () => {
      // two edits within a second are one step (typing): the clock moves between them
      vi.useFakeTimers({ toFake: ["Date"] });
      const { store, prefs } = renderWorkspace();
      act(() =>
        store.edit((q) => ({ ...q, printer: { ...q.printer, bedX: 220, bedY: 220, bedZ: 250 } })),
      );
      expect(prefs.printer.value.bedX).toBe(256);
      vi.setSystemTime(Date.now() + 5000);
      openMenu();
      fireEvent.click(within(menuPanel()).getByRole("button", { name: "Settings" }));
      fireEvent.click(screen.getByRole("button", { name: "My printer" }));
      expect(screen.getByText("This insert uses another printer")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(store.state.project.value.printer.bedX).toBe(256);
      expect(screen.queryByText("This insert uses another printer")).toBeNull();
      // one step to undo
      act(() => store.undo());
      expect(store.state.project.value.printer.bedX).toBe(220);
    });

    it("closes the sheet when another insert opens", async () => {
      const { store } = renderWorkspace();
      openMenu();
      fireEvent.click(within(menuPanel()).getByRole("button", { name: "Settings" }));
      store.newProject();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("has exactly one Download button, in every state of the workspace", async () => {
      const entry = (): HTMLElement[] =>
        screen.queryAllByRole("button", { name: /^(?:Download|Fix the fit to download)$/ });
      // no plan yet
      renderWorkspace();
      expect(entry()).toHaveLength(1);
      cleanup();
      // a plan, a stale plan, a pin conflict, no fit
      const current = renderWorkspace({ project: withLayoutProject() });
      expect(entry()).toHaveLength(1);
      act(() => {
        current.store.state.lockConflicts.value = [
          { trayKey: "a:p0:0", kind: "position", name: "Action cards", reason: "too big" },
        ];
      });
      expect(entry()).toHaveLength(1);
      expect(entry()[0]?.textContent).toBe("Fix the fit to download");
      cleanup();
      renderWorkspace({ project: { ...fixtureProject(), layout: makeLayout("older") } });
      expect(entry()).toHaveLength(1);
    });

    it("keeps Download off until there is a plan, and says what to do", () => {
      // items but no plan yet (an empty insert is the first visit, which has no Download)
      renderWorkspace();
      const download = screen.getByRole("button", { name: "Download" });
      expect(download.getAttribute("aria-disabled")).toBe("true");
      expect(download.getAttribute("title")).toBe("Wait for the first plan");
      expect(
        document.getElementById(download.getAttribute("aria-describedby") ?? "")?.textContent,
      ).toBe("Wait for the first plan");
    });

    it("keeps Download off, with the reason, while the plan is stale or a run is pending", async () => {
      const p = fixtureProject();
      const { store } = renderWorkspace({ project: { ...p, layout: makeLayout("an-older-hash") } });
      const download = (): HTMLElement => screen.getByRole("button", { name: "Download" });
      expect(store.state.stale.value).toBe(true);
      expect(download().getAttribute("aria-disabled")).toBe("true");
      expect(download().getAttribute("title")).toBe("Make a new plan first");
      expect(download().getAttribute("aria-describedby")).toBeTruthy();
      fireEvent.click(download());
      expect(screen.queryByRole("heading", { name: "Ready to print" })).toBeNull();
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
      expect(download().getAttribute("aria-disabled")).toBeNull();
    });

    describe("an older-geometry plan", () => {
      const oldPlan = (hash?: string): Project => {
        const p = fixtureProject();
        return {
          ...p,
          layout: makeLayout(hash ?? inputsHash(p), undefined, { geometryVersion: "0.1.0" }),
        };
      };
      const download = (): HTMLElement => screen.getByRole("button", { name: "Download" });
      const reasonOf = (button: HTMLElement): string | undefined =>
        document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent ??
        undefined;

      it("keeps Download off, with one short line that points to Reprint everything", async () => {
        renderWorkspace({ project: oldPlan() });
        expect(await screen.findByRole("button", { name: "Reprint everything" })).toBeTruthy();
        expect(download().getAttribute("aria-disabled")).toBe("true");
        expect(download().getAttribute("disabled")).toBeNull();
        expect(download().getAttribute("title")).toBe("Reprint everything to download");
        expect(reasonOf(download())).toBe("Reprint everything to download");
        // short and on one line
        expect("Reprint everything to download".length).toBeLessThanOrEqual(40);
        expect(download().getAttribute("title")).not.toMatch(/\n/);
        fireEvent.click(download());
        expect(screen.queryByRole("heading", { name: "Ready to print" })).toBeNull();
      });

      it("keeps it off after Use the old plan, and a press on it brings the banner back", async () => {
        renderWorkspace({ project: oldPlan() });
        fireEvent.click(await screen.findByRole("button", { name: "Use the old plan" }));
        expect(screen.queryByRole("button", { name: "Reprint everything" })).toBeNull();
        expect(download().getAttribute("aria-disabled")).toBe("true");
        expect(download().getAttribute("title")).toBe("Reprint everything to download");
        expect(reasonOf(download())).toBe("Reprint everything to download");
        // still focusable, and pressing it opens nothing; the way out shows again
        download().focus();
        expect(document.activeElement).toBe(download());
        fireEvent.click(download());
        expect(screen.queryByRole("heading", { name: "Ready to print" })).toBeNull();
        expect(await screen.findByRole("button", { name: "Reprint everything" })).toBeTruthy();
      });

      it("says Make a new plan first when the plan is also stale and its own banner shows", async () => {
        // older and stale: the older-geometry banner speaks for both, and so does the reason
        renderWorkspace({ project: oldPlan("an-older-hash") });
        expect(await screen.findByRole("button", { name: "Reprint everything" })).toBeTruthy();
        expect(download().getAttribute("title")).toBe("Reprint everything to download");
        cleanup();
        // kept, then stale: the stale banner is the one in view, with its own button
        const { store } = renderWorkspace({ project: oldPlan() });
        fireEvent.click(await screen.findByRole("button", { name: "Use the old plan" }));
        act(() => {
          store.edit((q) => updateBox(q, { innerWidth: q.box.innerWidth + 5 }));
        });
        act(() => {
          store.state.runScheduled.value = false;
          store.state.run.value = { status: "idle" };
        });
        expect(screen.getByRole("button", { name: "Make a new plan" })).toBeTruthy();
        expect(download().getAttribute("title")).toBe("Make a new plan first");
      });

      it("is cleared by Reprint everything: a plan from the current geometry downloads", async () => {
        const { store } = renderWorkspace({ project: oldPlan() });
        const refit = vi.spyOn(store, "refit").mockImplementation(() => {
          // what the run does when it succeeds: a layout made by this version of the app
          store.state.project.value = {
            ...store.state.project.value,
            layout: makeLayout(store.state.currentHash.value),
          };
        });
        fireEvent.click(await screen.findByRole("button", { name: "Reprint everything" }));
        expect(refit).toHaveBeenCalled();
        expect(store.state.geometryOld.value).toBe(false);
        await waitFor(() => expect(download().getAttribute("aria-disabled")).toBeNull());
        expect(download().getAttribute("title") ?? "").toBe("");
        expect(screen.queryByRole("button", { name: "Reprint everything" })).toBeNull();
        fireEvent.click(download());
        expect(screen.getByRole("heading", { name: "Ready to print" })).toBeTruthy();
      });
    });

    it("Download opens the export dialog once there is a plan", () => {
      renderWorkspace({ project: withLayoutProject() });
      fireEvent.click(screen.getByRole("button", { name: "Download" }));
      expect(screen.getByRole("heading", { name: "Ready to print" })).toBeTruthy();
    });

    it("returns the focus to the menu button after a choice", () => {
      renderWorkspace();
      const button = openMenu();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "New insert" }));
      fireEvent.click(screen.getByRole("button", { name: "Save file" }));
      expect(document.activeElement).toBe(button);
    });

    it("opens a chosen insert file, and tells when it can't be read", async () => {
      const { store } = renderWorkspace();
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
  });

  it("orders the stage: banner, status, plan, then the notes", () => {
    const p = fixtureProject();
    renderApp({ project: { ...p, layout: makeLayout("an-older-hash") } });
    const stage = document.querySelector('[data-region="stage"]') as HTMLElement;
    const index = (selector: string): number => {
      const el = stage.querySelector(`:scope > ${selector}`);
      return el === null ? -1 : [...stage.children].indexOf(el);
    };
    const banner = index(".app-notices");
    const status = index('[data-region="status"]');
    const plan = index(".plan-col");
    expect(banner).toBeGreaterThanOrEqual(0);
    expect(stage.querySelector(".app-notices .k-notice")).not.toBeNull();
    expect(status).toBeGreaterThan(banner);
    expect(plan).toBeGreaterThan(status);
    // the figures and their notes are gone: nothing of the Summary is left
    expect(stage.querySelector(".pf-readouts, .pf-status, .hint")).toBeNull();
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
    const banner = document.querySelector('.k-notice[data-tone="warn"]');
    expect(banner?.textContent).toContain(
      "Made with an older version of the app. Trays printed from it won't stack with trays you print now.",
    );
    // the banner itself is not live: the region that was there before it speaks for it
    expect(banner?.getAttribute("role")).toBeNull();
    expect(
      screen
        .getAllByRole("status")
        .some((r) => r.textContent?.startsWith("Made with an older version of the app.")),
    ).toBe(true);
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

  describe("status heading", () => {
    const status = (): HTMLElement =>
      document.querySelector('[data-region="status"]') as HTMLElement;
    const heading = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";

    it("says everything fits, with the trays, the layers and the height", () => {
      renderApp({ project: withLayoutProject() });
      // two stored trays 40 mm high; the box is 70 mm inside and keeps 8 mm free on top
      expect(heading()).toBe("Everything fits");
      expect(status().textContent).toContain("2 trays in 1 layer, 40 of 62 mm high");
      expect(
        screen.getByRole("button", { name: "Download" }).getAttribute("aria-disabled"),
      ).toBeNull();
    });

    it("Keep searching starts a longer search and becomes Stop while it runs", async () => {
      const { stub } = renderApp({ project: withLayoutProject() });
      fireEvent.click(screen.getByRole("button", { name: "Keep searching" }));
      expect(await screen.findByRole("button", { name: "Stop" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
      expect(stub.calls).toHaveLength(1);
      expect(heading()).toBe("Searching for a better plan…");
      // Main shows no progress bar
      expect(screen.queryByRole("progressbar")).toBeNull();
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
      expect(heading()).toBe("The Market tray doesn't fit yet");
      expect(status().textContent).not.toContain("Everything fits");
      const download = screen.getByRole("button", { name: "Fix the fit to download" });
      expect(download.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(download);
      expect(screen.queryByRole("dialog", { name: "Ready to print" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Edit Market" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Market" })).toBeTruthy();
      // leaving the editor does not bring it back
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(screen.queryByRole("heading", { level: 2, name: "Market" })).toBeNull();
    });

    it("tells the no-fit fact in one line on every stage: the engine's paragraph is drawn on none", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      const market = store.state.project.value.components[1];
      const paragraph = "No fit found yet. The search ran 100,000 iterations without a layout.";
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
          notices: [{ level: "error", code: "layout.doesNotFit", message: paragraph }],
          bestAttempt: { trays: [tray], shortfall: { x: 30, y: 0, z: 0 } },
        });
        store.state.lastResultHash.value = store.state.currentHash.value;
      });
      // the fit stage: the heading's line carries it
      expect(heading()).toMatch(/fits? yet$/);
      expect(screen.queryByText(new RegExp(paragraph.slice(0, 20)))).toBeNull();
      // the box's editor: its problem line, not the paragraph
      fireEvent.click(
        within(screen.getByRole("complementary", { name: "What's inside" })).getByRole("button", {
          name: /^The box/,
        }),
      );
      expect(await screen.findByText(/fits? yet$/)).toBeTruthy();
      expect(screen.queryByText(new RegExp(paragraph.slice(0, 20)))).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      // an item's editor: the same
      fireEvent.click(
        within(screen.getByRole("complementary", { name: "What's inside" })).getByRole("button", {
          name: /^Market/,
        }),
      );
      expect(await screen.findByRole("heading", { level: 2, name: "Market" })).toBeTruthy();
      expect(screen.queryByText(new RegExp(paragraph.slice(0, 20)))).toBeNull();
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
      expect(heading()).toBe("The Market tray doesn't fit yet");
      expect(status().textContent).toContain("It's too big for your printer's bed.");
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
      expect(heading()).toBe("Action cards doesn't fit with your pins");
      // the engine's reasons are the line; the other conflict is a card of its own
      expect(status().textContent).toContain("It is too big. No room.");
      expect(screen.getByRole("button", { name: "Unlock size of Market" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Fix the fit to download" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Unpin Action cards" }));
      // only that pin goes, and the plan updates; the other conflict waits for the run's verdict
      expect(store.state.project.value.locks.map((l) => l.kind)).toEqual(["size"]);
      expect(store.state.lockConflicts.value.map((c) => c.name)).toEqual(["Market"]);
      expect(heading()).toBe("Making a new plan…");
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
      expect(heading()).toBe("Action cards, Market doesn't fit with your pins");
      fireEvent.click(screen.getByRole("button", { name: "Unpin Action cards, Market" }));
      expect(store.state.project.value.locks).toEqual([]);
      expect(store.state.lockConflicts.value).toEqual([]);
    });

    it("says a run is going once, in the status heading, not again in a badge over the view", () => {
      const { store } = renderApp({ project: withLayoutProject() });
      act(() => {
        store.state.run.value = { status: "running", done: 5, total: 100, kind: "edit" };
      });
      expect(heading()).toBe("Making a new plan…");
      expect(screen.queryByText("Updating…")).toBeNull();
      expect(document.querySelector(".pf-badge")).toBeNull();
    });

    it("says the plan is updating while a run is pending, with Download waiting", () => {
      const { store } = renderApp({ project: withLayoutProject() });
      act(() => {
        store.state.runScheduled.value = true;
      });
      expect(heading()).toBe("Making a new plan…");
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
      const { store } = renderWorkspace();
      store.pushNotice(notice("Your version was kept as a copy."));
      expect(store.state.conflict.value).toBe(false);
      openMenu();
      expect(await screen.findByText(/kept as a copy/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Keep this version" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Use the other tab/ })).toBeNull();
    });

    it("can't be dismissed during a real conflict, only after it is resolved", async () => {
      const { store } = renderWorkspace();
      store.state.conflict.value = true;
      store.pushNotice(notice("Another tab saved this project."));
      openMenu();
      // the board's words for the choice, with no way to dismiss it
      expect(await screen.findByText("Saving is paused here until you choose.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Dismiss/ })).toBeNull();
      store.state.conflict.value = false;
      expect(
        await screen.findByRole("button", { name: /^Dismiss: Another tab saved/ }),
      ).toBeTruthy();
    });

    it("offers both choices during a real conflict and passes them on", async () => {
      const { store } = renderWorkspace();
      const resolve = vi.spyOn(store, "resolveConflict").mockImplementation(() => undefined);
      store.state.conflict.value = true;
      store.pushNotice(notice("Another tab saved this project."));
      openMenu();
      fireEvent.click(await screen.findByRole("button", { name: "Keep this version" }));
      expect(resolve).toHaveBeenLastCalledWith("keepMine");
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Use the other tab version" }));
      expect(resolve).toHaveBeenLastCalledWith("loadTheirs");
    });

    it("conflict shows a menu dot and both choices", async () => {
      const { store, projectStore } = renderWorkspace();
      const mine = store.state.project.value;
      // The other tab saved a different version of the same insert.
      projectStore.save({ ...mine, name: "From the other tab" }, EMPTY_FOREIGN);
      store.edit((q) => renameProject(q, "From this tab"));
      store.onExternalChange();
      expect(store.state.conflict.value).toBe(true);
      // nothing on the page: the notice is in the menu; the box stays, empty, for its live regions
      expect(document.querySelector(".app-notices")?.getAttribute("data-empty")).toBe("true");
      expect(document.querySelectorAll(".app-notices li")).toHaveLength(0);
      const menu = await screen.findByRole("button", { name: "Project menu, 1 notice" });
      expect(document.querySelector(".k-iconbtn__dot")).not.toBeNull();
      fireEvent.click(menu);
      const panel = screen.getByRole("group", { name: "Project" });
      const first = panel.querySelector("button");
      expect(first?.textContent).toBe("Keep this version");
      expect(within(panel).getByRole("button", { name: "Use the other tab version" })).toBeTruthy();
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
      expect(screen.queryByRole("heading", { name: "Ready to print" })).toBeNull();
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

    it("no stale banner beside a pin conflict: the pill is the one call to action", async () => {
      const { store } = renderApp({ project: stalePlan() });
      expect(await screen.findByRole("button", { name: "Make a new plan" })).toBeTruthy();
      act(() => {
        store.state.lockConflicts.value = [
          { trayKey: "a:p0:0", kind: "position", name: "Action cards", reason: "it is too big" },
        ];
      });
      expect(store.state.stale.value).toBe(true);
      expect(screen.queryByRole("button", { name: "Make a new plan" })).toBeNull();
      expect(screen.queryByText("This plan is from before your last changes.")).toBeNull();
      expect(screen.getByRole("button", { name: "Unpin Action cards" })).toBeTruthy();
    });

    it("no stale banner while a field is in error: a new plan could not be made", async () => {
      const p = stalePlan();
      const { store } = renderApp({ project: p });
      expect(await screen.findByRole("button", { name: "Make a new plan" })).toBeTruthy();
      act(() => {
        store.edit((q) => updateBox(q, { innerWidth: 0 }));
      });
      expect(canOptimize(store.state.project.value, store.state.validation.value)).toBe(false);
      expect(screen.queryByRole("button", { name: "Make a new plan" })).toBeNull();
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
      const { store } = renderWorkspace();
      store.pushNotice({ level: "error", code: OPEN_FAILED_CODE, message: "That file is broken." });
      expect(await screen.findByText("That file is broken.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Project menu" })).toBeTruthy();
      expect(document.querySelector(".k-iconbtn__dot")).toBeNull();
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
      const dialog = screen.getByRole("dialog", { name: "Ready to print" });
      expect(dialog.tagName).toBe("DIALOG");
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Ready to print" }));
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
      const { store } = renderApp({ project: withLayoutProject(), overrides: withWebGL() });
      openView("3D");
      store.state.selection.value = "a:p0:0";
      openExport();
      fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      expect(viewPressed("3D")).toBe(true);
      expect(store.state.selection.value).toBe("a:p0:0");
      expect(document.querySelector(".plan-tile")).toBeNull();
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
      fireEvent.click(screen.getByRole("button", { name: "Download the 3MF file" }));
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
      expect(await screen.findByRole("group", { name: "View" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to your insert" })).toBeNull();
    });

    it("returns to the editor when another project is opened", async () => {
      const { store, projectStore } = renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      const other = { ...fixtureProject(), id: "other-project", name: "Other" };
      projectStore.save({ ...other, layout: makeLayout(inputsHash(other)) }, EMPTY_FOREIGN);
      store.openProject(other.id);
      expect(await screen.findByRole("complementary", { name: "What's inside" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /^Pin this (tray|stack)/ }));
    const locks = store.state.project.value.locks;
    expect(locks.filter((l) => l.kind === "position").map((l) => l.trayKey)).toEqual([
      "a:p0:0",
      "b:p0:1",
    ]);
    expect(locks.some((l) => l.kind === "stack")).toBe(true);
    expect(screen.getByText("Pinned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Unpin this (tray|stack)/ }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  /** The tray bar, so a chip is looked for there and not in the list's own chips. */
  const trayBar = (): HTMLElement => screen.getByRole("region", { name: "Selected tray" });

  it("keyboard pin and swap", () => {
    const { store } = renderApp({ project: withLayoutProject() });
    // A tray is in the Tab order, and Space or Enter on it selects it.
    const a = tile("a:p0:0");
    expect(a.getAttribute("role")).toBe("button");
    expect(a.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(a, { key: " " });
    expect(store.state.selection.value).toBe("a:p0:0");
    // The bar's buttons are in the Tab order, and Space or Enter on one presses it.
    for (const b of within(trayBar()).getAllByRole("button")) {
      expect(b.getAttribute("tabindex")).not.toBe("-1");
    }
    press(within(trayBar()).getByRole("button", { name: /^Pin this (tray|stack)/ }), " ");
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "0", rotated: false },
    ]);
    expect(within(trayBar()).getByText("Pinned")).toBeTruthy();
    press(within(trayBar()).getByRole("button", { name: "More" }), "Enter");
    // Opened with the keyboard, More puts the focus on its first item
    expect(document.activeElement).toBe(
      within(trayBar()).getByRole("button", { name: "Swap with…" }),
    );
    press(within(trayBar()).getByRole("button", { name: "Swap with…" }), "Enter");
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
    expect(
      within(trayBar()).getByRole("button", { name: /^Unpin this (tray|stack)/ }),
    ).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /^Turn this (tray|stack) 90°/ }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "fxcrd003:p0:0", path: "0", rotated: true },
    ]);
    expect(within(trayBar()).getByText("Pinned, turned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Unpin this (tray|stack)/ }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("reads Pinned, turned for a tray the optimizer had already turned, and Turn flips it back", () => {
    const { store } = renderApp({ project: turnable({ rotated: true }) });
    fireEvent.keyDown(tile("fxcrd003:p0:0"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /^Pin this (tray|stack)/ }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "fxcrd003:p0:0", path: "0", rotated: true },
    ]);
    // The chip reads the pin's rotation, so a pin of a tray that was laid turned says so too.
    expect(within(trayBar()).getByText("Pinned, turned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Turn this (tray|stack) 90°/ }));
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
    const turn = screen.getByRole("button", { name: /^Turn this (tray|stack) 90°/ });
    expect(turn.getAttribute("aria-disabled")).toBe("true");
    expect(
      within(trayBar()).getByText("This tray is square, so turning changes nothing.", {
        selector: ".tray-bar__why p",
      }),
    ).toBeTruthy();
    fireEvent.click(turn);
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("prints no hint paragraph under the plan, with or without a tray selected", () => {
    renderApp({ project: withLayoutProject() });
    expect(screen.queryByText(/Select a tray to see its details/)).toBeNull();
    expect(screen.queryByText(/Hatched trays are spares/)).toBeNull();
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
      const rail = screen.getByRole("complementary", { name: "What's inside" });
      // The list is showing, with no editor.
      expect(within(rail).queryByRole("heading", { level: 2, name: "Market" })).toBeNull();
      fireEvent.keyDown(tile("m:p0:0"), { key: "Enter" });
      expect(within(trayBar()).getByText("Market", { selector: ".tray-bar__name" })).toBeTruthy();
      fireEvent.click(within(trayBar()).getByRole("button", { name: "Edit" }));
      // The editor panel is open for that component, with its way back to the list.
      const heading = await within(rail).findByRole("heading", { level: 2, name: "Market" });
      expect(document.activeElement).toBe(heading);
      expect(within(rail).getByRole("button", { name: "What's inside" })).toBeTruthy();
      expect(within(rail).getByRole("button", { name: /^Remove Market/ })).toBeTruthy();
      // Back to the list leaves the tray selected.
      fireEvent.click(within(rail).getByRole("button", { name: "What's inside" }));
      expect(within(rail).queryByRole("heading", { level: 2, name: "Market" })).toBeNull();
      expect(screen.getByRole("region", { name: "Selected tray" })).toBeTruthy();
    });

    it("Close hands the focus back to the tray", async () => {
      renderApp({ project: market() });
      fireEvent.keyDown(tile("m:p0:0"), { key: "Enter" });
      // jsdom gives SVG elements no focus(); stand one in to see the bar hand the focus back.
      const focus = vi.fn();
      (tile("m:p0:0") as unknown as { focus: () => void }).focus = focus;
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
      await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    });

    it("Close during a swap ends it", () => {
      const { store } = renderApp({ project: withLayoutProject() });
      fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
      openMore();
      fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
      expect(store.state.swapFrom.value).toBe("a:p0:0");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(store.state.swapFrom.value).toBeNull();
      expect(store.state.selection.value).toBeNull();
      expect(screen.queryByText(/Choose the tray to swap with/)).toBeNull();
    });

    it("Close in 3D hands the focus to the 3D stage, where the keys step through the trays", async () => {
      renderApp({ project: withLayoutProject(), overrides: withWebGL() });
      fireEvent.keyDown(tile("a:p0:0"), { key: "Enter" });
      openView("3D");
      await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => {
        const stage = document.activeElement as HTMLElement | null;
        expect(stage?.tagName).toBe("CANVAS");
        expect(stage?.closest(".viewer-stage")).not.toBeNull();
      });
      expect(document.querySelector(".tray-picker")).toBeNull();
    });

    it("selects a tray in 3D from the keyboard, and the tray bar shows it", async () => {
      renderApp({ project: withLayoutProject(), overrides: withWebGL() });
      openView("3D");
      await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
      expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
      const canvas = document.querySelector(".viewer-canvas") as HTMLElement;
      fireEvent.keyDown(canvas, { key: "ArrowRight" });
      expect(screen.getByRole("region", { name: "Selected tray" })).toBeTruthy();
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

describe("the rail, What's inside", () => {
  const rail = (): HTMLElement => screen.getByRole("complementary", { name: "What's inside" });

  it("opens the box's editor from the box card and gives the focus back to the card", () => {
    const { store } = renderApp({ project: fixtureProject() });
    fireEvent.click(within(rail()).getByRole("button", { name: /^The box/ }));
    const heading = within(rail()).getByRole("heading", { level: 2, name: "The box" });
    expect(document.activeElement).toBe(heading);
    // the list gives way to the box's fields
    expect(within(rail()).queryByRole("list", { name: "What's inside" })).toBeNull();
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "250" } });
    expect(store.state.project.value.box.innerWidth).toBe(250);
    fireEvent.click(within(rail()).getByRole("button", { name: "Done" }));
    expect(within(rail()).getByRole("list", { name: "What's inside" })).toBeTruthy();
    expect(document.activeElement).toBe(within(rail()).getByRole("button", { name: /^The box/ }));
    expect(within(rail()).getByTitle("250 × 290 × 70 mm")).toBeTruthy();
  });

  it("has one h1 in the box editor: the side view's label, in the stage", () => {
    renderApp({ project: fixtureProject() });
    fireEvent.click(within(rail()).getByRole("button", { name: /^The box/ }));
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe("Side view of the box");
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toBe(h1s[0]);
    // the status heading is not drawn beside it, and the wordmark is not a heading
    expect(document.querySelector(".k-status")).toBeNull();
    // the status heading is back with the list
    fireEvent.click(within(rail()).getByRole("button", { name: "Done" }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).closest(".k-status")).not.toBeNull();
  });

  it("draws the box's side view in the stage, and keeps it in step with the fields", () => {
    const { store } = renderApp({ project: fixtureProject() });
    fireEvent.click(within(rail()).getByRole("button", { name: /^The box/ }));
    const main = within(screen.getByRole("main"));
    expect(main.getByText("Kept free, 8 mm")).toBeTruthy();
    expect(main.getByText("Trays fill the 62 mm below.")).toBeTruthy();
    fireEvent.input(screen.getByLabelText(/^Space on top/), { target: { value: "5" } });
    expect(store.state.project.value.box.headroom).toBe(5);
    expect(main.getByText("Kept free, 5 mm")).toBeTruthy();
    expect(main.getByText("Trays fill the 65 mm below.")).toBeTruthy();
    fireEvent.input(screen.getByLabelText(/^Space on top/), { target: { value: "0" } });
    expect(main.queryByText(/Kept free/)).toBeNull();
    // the edits a second apart are one undo step: one Undo and the box is as it was
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(store.state.project.value.box.headroom).toBe(8);
    expect(main.getByText("Kept free, 8 mm")).toBeTruthy();
    expect(store.canUndo.value).toBe(false);
  });

  it("tells a failed run as an alert in the stage while the box is edited", () => {
    const { store } = renderApp({ project: fixtureProject() });
    fireEvent.click(within(rail()).getByRole("button", { name: /^The box/ }));
    act(() => {
      store.state.run.value = { status: "error", message: "Worker crashed" };
    });
    const alert = within(screen.getByRole("main")).getByRole("alert");
    expect(alert.textContent).toContain("The plan couldn't be updated");
    expect(alert.closest("h1, h2, h3")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("adds from the Add pill, and the new item's editor opens", () => {
    const { store } = renderApp({ project: fixtureProject() });
    const before = store.state.project.value.components.length;
    fireEvent.click(within(rail()).getByRole("button", { name: "Add" }));
    fireEvent.click(within(rail()).getByRole("button", { name: "Miniatures" }));
    const components = store.state.project.value.components;
    expect(components).toHaveLength(before + 1);
    expect(components.at(-1)?.kind).toBe("minis");
    expect(within(rail()).getByRole("button", { name: "What's inside" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Add something inside" })).toBeNull();
  });

  it("presses the row of the selected tray's component", () => {
    const p = fixtureProject();
    const [first] = p.components;
    if (first === undefined) {
      throw new Error("the fixture has no component");
    }
    const tray = makeTray({
      key: "m:p0:0",
      compartments: [
        {
          x: 1.6,
          y: 1.6,
          w: 96.8,
          d: 76.8,
          floorZ: 1.2,
          kind: "well",
          contents: "x",
          componentId: first.id,
          features: [],
        },
      ],
    });
    renderApp({ project: { ...p, layout: makeLayout(inputsHash(p), [tray]) } });
    const pressed = (): string[] =>
      within(rail())
        .queryAllByRole("button", { pressed: true })
        .map((b) => b.textContent ?? "");
    expect(pressed()).toEqual([]);
    fireEvent.keyDown(tile("m:p0:0"), { key: "Enter" });
    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]).toContain(first.name);
  });

  it("tells the plan which component's row the pointer is on", () => {
    renderApp({ project: fixtureProject() });
    const [first] = fixtureProject().components;
    const row = within(rail()).getAllByRole("button", { name: /,/ })[0] as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(hoveredComponent.value).toBe(first?.id);
    fireEvent.mouseLeave(row);
    expect(hoveredComponent.value).toBeNull();
  });

  it("lights no trays once the row has opened its editor", () => {
    renderApp({ project: fixtureProject() });
    const row = within(rail()).getAllByRole("button", { name: /,/ })[0] as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(hoveredComponent.value).not.toBeNull();
    fireEvent.click(row);
    expect(within(rail()).getByRole("button", { name: "Done" })).toBeTruthy();
    expect(hoveredComponent.value).toBeNull();
  });

  it("shows the printer bed of the insert, and Settings opens from it", () => {
    const p = fixtureProject();
    renderApp({ project: p });
    expect(within(rail()).getByText(`Bed ${p.printer.bedX} × ${p.printer.bedY} mm`)).toBeTruthy();
    fireEvent.click(within(rail()).getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  describe("the status heading's jump buttons", () => {
    it("lead to a component's editor, with its name on the button", async () => {
      const { store } = renderApp({ project: fixtureProject() });
      const [first] = store.state.project.value.components;
      if (first === undefined || first.kind !== "cards") {
        throw new Error("the fixture's first component is not cards");
      }
      store.edit((q) => ({
        ...q,
        components: q.components.map((c) =>
          c.id === first.id && c.kind === "cards" ? { ...c, decks: [{ name: "x", count: -1 }] } : c,
        ),
      }));
      fireEvent.click(await screen.findByRole("button", { name: `Edit ${first.name}` }));
      expect(
        await within(rail()).findByRole("heading", { level: 2, name: first.name }),
      ).toBeTruthy();
    });

    it("lead to the box's editor", async () => {
      const { store } = renderApp({ project: fixtureProject() });
      store.edit((q) => updateBox(q, { innerHeight: -5 }));
      fireEvent.click(await screen.findByRole("button", { name: "Change the box" }));
      expect(
        await within(rail()).findByRole("heading", { level: 2, name: "The box" }),
      ).toBeTruthy();
    });
  });
});
