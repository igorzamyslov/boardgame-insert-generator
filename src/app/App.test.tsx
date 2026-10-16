// src/app/App.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { APP_VERSION, BUILD_ID } from "../model/version";
import type { SceneFactory, SceneHandle } from "../viewer/types";
import type { MeshSource } from "./meshes";
import { updateBox } from "./actions";
import { CONFLICT_CODE } from "./persistence";
import {
  EMPTY_FOREIGN,
  fixtureProject,
  flush,
  makeLayout,
  makeResult,
  makeTray,
} from "./test-helpers";
import { renderApp } from "./test-app";

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

/** Switches the view sheet to a tab; only the selected view's panel is mounted. */
function openTab(name: "Plan" | "3D"): void {
  fireEvent.click(screen.getByRole("tab", { name }));
}

/** The empty state and the rail both offer the Add buttons; either one adds. */
function addCards(): void {
  fireEvent.click(screen.getAllByRole("button", { name: "Add cards" })[0] as HTMLElement);
}

/** The export panel is a dialog over the view; its button opens it. */
function openExport(): void {
  fireEvent.click(screen.getByRole("button", { name: /^Export all \d+ parts?$/ }));
}

/** The assembly page's button lives in the export panel. */
function openAssemblyPage(): void {
  openExport();
  fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
}

describe("App", () => {
  it("lays out the title, inputs then results and footer", () => {
    renderApp();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Insert Generator");
    const inputs = screen.getByRole("region", { name: "Inputs" });
    const titles = (): (string | undefined)[] =>
      [...inputs.querySelectorAll("details.pf-acc > summary h2")].map((t) =>
        t.textContent?.replace(/^\d+/, "").replace(/adv$/, ""),
      );
    expect(titles()).toEqual(["The box", "What goes inside", "Your printer"]);
    const results = screen.getByRole("main");
    expect(within(results).getByRole("heading", { level: 2, name: "Results" })).toBeTruthy();
    expect(screen.queryByText(/shared links may break/)).toBeNull();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(`v${APP_VERSION} (${BUILD_ID})`);
    expect(
      within(footer).getByRole("link", { name: "Third-party licenses" }).getAttribute("href"),
    ).toBe("./third-party-licenses.txt");
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(titles()).toEqual(["The box", "What goes inside", "Your printer", "Walls and fit"]);
  });

  it("switches to advanced inputs", () => {
    renderApp();
    expect(screen.queryByLabelText(/Bed margin/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(screen.getByLabelText(/Bed margin/)).toBeTruthy();
  });

  it("adds a component and starts an optimizer run after the pause", async () => {
    const { stub } = renderApp();
    addCards();
    const card = document.querySelector("details.component-card") as HTMLDetailsElement;
    expect(card.querySelector(".pf-item__title")?.textContent).toBe("Cards");
    expect(card.open).toBe(true);
    await waitFor(() => expect(stub.calls).toHaveLength(1));
  });

  it("shows plan and 3D fallback tabs and the export panel for a stored layout, and swaps with the keyboard in Advanced", () => {
    const { store, stub } = renderApp({ project: withLayoutProject() });
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(stub.calls).toHaveLength(0);
    expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: /^Tray 1,/ })).toBeTruthy();
    expect(screen.queryByText(/needs WebGL/)).toBeNull();
    openTab("3D");
    expect(screen.getByText(/needs WebGL/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Tray 1,/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Export" })).toBeNull();
    openExport();
    expect(screen.getByRole("dialog", { name: "Export all 2 parts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3MF per part (.zip)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // The export was a dialog over the 3D view, not a view of its own: closing it leaves that view.
    expect(screen.getByRole("tab", { name: "3D" }).getAttribute("aria-selected")).toBe("true");
    openTab("Plan");
    expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1,/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 2,/ }), { key: "Enter" });
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "1", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
    ]);
  });

  it("blocks exporting while the inputs differ from the layout, even before a run starts", async () => {
    const { store } = renderApp({ project: withLayoutProject() });
    openExport();
    const stl = screen.getByRole("button", { name: "STL files (.zip)" });
    expect(stl.hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByLabelText("Advanced"));
    store.edit((q) => ({ ...q, settings: { ...q.settings, wall: q.settings.wall + 0.4 } }));
    expect(store.state.stale.value).toBe(true);
    expect(
      await screen.findByText("Inputs changed — update the plan before exporting."),
    ).toBeTruthy();
    for (const name of ["3MF per part (.zip)", "One combined 3MF", "STL files (.zip)"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });

  it("says why the optimizer is blocked by an error whose field is hidden in simple mode", async () => {
    const { store } = renderApp();
    addCards();
    const results = screen.getByRole("main");
    expect(within(results).queryByText(/Fix the errors/)).toBeNull();
    store.edit((q) => ({ ...q, settings: { ...q.settings, bottomChamfer: 3 } }));
    expect(await within(results).findByText(/Fix the errors marked in the inputs/)).toBeTruthy();
    expect(within(results).queryByText(/add at least one component/)).toBeNull();
    const list = within(results).getByRole("list", { name: "Errors without a field" });
    expect(list.textContent).toMatch(/Bottom chamfer must be at most/);
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(within(results).queryByRole("list", { name: "Errors without a field" })).toBeNull();
    expect(within(results).getByText(/Fix the errors marked in the inputs/)).toBeTruthy();
  });

  it("removes a component with an Undo toast that puts it back where it was", async () => {
    const { store } = renderApp();
    addCards();
    fireEvent.click(screen.getAllByRole("button", { name: "Add bits" })[0] as HTMLElement);
    const names = (): string[] => store.state.project.value.components.map((c) => c.name);
    expect(names()).toEqual(["Cards", "Bits"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Cards" }));
    expect(names()).toEqual(["Bits"]);
    const toast = await screen.findByText(/Removed “Cards”/);
    expect(toast.getAttribute("role")).toBe("status");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(names()).toEqual(["Cards", "Bits"]);
    expect(screen.queryByText(/Removed “Cards”/)).toBeNull();
  });

  it("dismisses the Undo toast", async () => {
    const { store } = renderApp();
    addCards();
    fireEvent.click(screen.getByRole("button", { name: "Remove Cards" }));
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

  it("shows the selected tray's details once in the 3D tab", async () => {
    renderApp({
      project: withLayoutProject(),
      overrides: {
        viewerProps: { webgl: () => true, loadScene: () => Promise.resolve(stubSceneFactory()) },
      },
    });
    fireEvent.click(screen.getByLabelText("Advanced"));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1,/ }), { key: "Enter" });
    openTab("3D");
    await waitFor(() => expect(screen.getByLabelText("Spread apart")).toBeTruthy());
    expect(screen.getAllByRole("heading", { name: /^#1 / })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Lock size" })).toHaveLength(1);
    expect(document.querySelectorAll(".tray-details")).toHaveLength(1);
  });

  describe("a layout the inputs no longer match", () => {
    const makeStale = (store: ReturnType<typeof renderApp>["store"]): void => {
      store.edit((q) => ({ ...q, settings: { ...q.settings, wall: q.settings.wall + 0.4 } }));
    };

    it("can't be opened as the assembly page, and says why", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      openExport();
      const open = screen.getByRole("button", { name: "Open the assembly page" });
      expect(open.hasAttribute("disabled")).toBe(false);
      makeStale(store);
      expect(
        await screen.findByText(
          "Inputs changed — update the plan before opening the assembly page.",
        ),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Open the assembly page" }).hasAttribute("disabled"),
      ).toBe(true);
    });

    it("turns an open assembly page read-only when it goes stale", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      expect(
        screen.getByRole("button", { name: "Print / save as PDF" }).hasAttribute("disabled"),
      ).toBe(false);
      makeStale(store);
      expect(await screen.findByText(/Inputs changed — update the plan/)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Print / save as PDF" }).hasAttribute("disabled"),
      ).toBe(true);
      expect(
        screen
          .getAllByRole("button", { name: /^Download PNG/ })
          .every((b) => b.hasAttribute("disabled")),
      ).toBe(true);
    });

    it("hints in the tray details that they may not match", async () => {
      const { store } = renderApp({ project: withLayoutProject() });
      fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1,/ }), { key: "Enter" });
      expect(document.querySelector(".tray-details .hint")?.textContent ?? "").not.toMatch(
        /Inputs changed/,
      );
      makeStale(store);
      await waitFor(() =>
        expect(document.querySelector(".tray-details")?.textContent).toMatch(/Inputs changed/),
      );
    });
  });

  it("offers no locks or swaps in the simple plan", () => {
    renderApp({ project: withLayoutProject() });
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1,/ }), { key: "Enter" });
    for (const name of ["Lock size", "Lock position", "Swap with…"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("locks and unlocks a tray's size from the tray details in Advanced", () => {
    const { store } = renderApp({ project: withLayoutProject() });
    fireEvent.click(screen.getByLabelText("Advanced"));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1,/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "size", trayKey: "a:p0:0", w: 100, d: 80, h: 40 },
    ]);
    expect(screen.getByRole("button", { name: /^Tray 1, .*, size locked$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock size" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("opens the assembly page and comes back", () => {
    renderApp({ project: withLayoutProject() });
    openAssemblyPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/— assembly$/);
    fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
    expect(screen.getByRole("tab", { name: "Plan" })).toBeTruthy();
  });

  it("copies a share link built from the current page", async () => {
    const { clipboard } = renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalled());
    expect(clipboard.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/example\.test\/insert-generator\/#1\./,
    );
  });

  it("shows the shortfall of an infeasible run only while its inputs are current", async () => {
    const { store } = renderApp();
    store.state.lastResult.value = makeResult(null, {
      bestAttempt: { trays: [], shortfall: { x: 12.3, y: 0, z: 0 } },
    });
    store.state.lastResultHash.value = store.state.currentHash.value;
    expect(
      await screen.findByText(/Closest attempt so far is short by 12\.3 mm left–right/),
    ).toBeTruthy();
    addCards();
    await waitFor(() => expect(screen.queryByText(/Closest attempt so far/)).toBeNull());
  });

  describe("project menu", () => {
    const menu = (): HTMLDetailsElement =>
      document.querySelector("details.app-menu") as HTMLDetailsElement;
    const open = (): void => {
      menu().open = true;
    };

    it("closes on a click outside it, but not on a click inside", () => {
      renderApp();
      open();
      fireEvent.click(screen.getByLabelText("Project name"));
      expect(menu().open).toBe(true);
      fireEvent.click(screen.getByRole("heading", { level: 2, name: "Results" }));
      expect(menu().open).toBe(false);
    });

    it("closes on Escape and returns focus to its button", () => {
      renderApp();
      open();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(menu().open).toBe(false);
      expect(document.activeElement).toBe(menu().querySelector("summary"));
    });

    it("closes when a project is chosen, and when a new one is made", () => {
      const { store } = renderApp();
      store.newProject();
      open();
      const other = (screen.getByLabelText("Saved projects") as HTMLSelectElement).options[0];
      fireEvent.change(screen.getByLabelText("Saved projects"), {
        target: { value: other?.value },
      });
      expect(menu().open).toBe(false);
      open();
      fireEvent.click(screen.getByRole("button", { name: "New project" }));
      expect(menu().open).toBe(false);
    });

    it("ignores Escape and outside clicks while it is closed", () => {
      renderApp();
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(document.body);
      expect(menu().open).toBe(false);
    });
  });

  it("has no preview banner, whatever the version", () => {
    renderApp();
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.querySelector(".preview-banner")).toBeNull();
    expect(screen.queryByText(/Preview:/)).toBeNull();
  });

  it("offers Update plan for a layout made under older geometry", async () => {
    const p = fixtureProject();
    renderApp({
      project: {
        ...p,
        layout: makeLayout(inputsHash(p), undefined, { geometryVersion: "0.1.0" }),
      },
    });
    expect(await screen.findByRole("button", { name: "Update plan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep searching" })).toBeNull();
    expect(screen.getByText(/This plan is out of date/)).toBeTruthy();
  });

  describe("conflict notices", () => {
    const notice = (message: string) => ({
      level: "info" as const,
      code: CONFLICT_CODE,
      message,
    });

    it("offers no choice on a notice left over from a resolved conflict", async () => {
      const { store } = renderApp();
      store.pushNotice(notice("Your version was kept as a copy."));
      expect(store.state.conflict.value).toBe(false);
      expect(await screen.findByText(/kept as a copy/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Keep my version" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Load the other tab/ })).toBeNull();
    });

    it("can't be dismissed during a real conflict, only after it is resolved", async () => {
      const { store } = renderApp();
      store.state.conflict.value = true;
      store.pushNotice(notice("Another tab saved this project."));
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
      fireEvent.click(await screen.findByRole("button", { name: "Keep my version" }));
      expect(resolve).toHaveBeenLastCalledWith("keepMine");
      fireEvent.click(screen.getByRole("button", { name: "Load the other tab's version" }));
      expect(resolve).toHaveBeenLastCalledWith("loadTheirs");
    });
  });

  describe("export dialog", () => {
    const exportButton = (): HTMLElement =>
      screen.getByRole("button", { name: /^Export all \d+ parts?$/ });

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
      const dialog = screen.getByRole("dialog", { name: "Export all 2 parts" });
      expect(dialog.tagName).toBe("DIALOG");
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Export all 2 parts" }),
      );
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
      fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
      expect(await screen.findByText(/Closing this window also cancels the export/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await flush();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(download).not.toHaveBeenCalled();
    });
  });

  describe("assembly page", () => {
    it("moves the focus to the page and back to its button, and scrolls to the top", () => {
      renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
      // Back where the export was opened from: its button.
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /^Export all \d+ parts?$/ }),
      );
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
      expect(await screen.findByRole("region", { name: "Inputs" })).toBeTruthy();
      store.openProject(project.id);
      expect(await screen.findByRole("tab", { name: "Plan" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to the editor" })).toBeNull();
    });

    it("returns to the editor when another project is opened", async () => {
      const { store, projectStore } = renderApp({ project: withLayoutProject() });
      openAssemblyPage();
      const other = { ...fixtureProject(), id: "other-project", name: "Other" };
      projectStore.save({ ...other, layout: makeLayout(inputsHash(other)) }, EMPTY_FOREIGN);
      store.openProject(other.id);
      expect(await screen.findByRole("region", { name: "Inputs" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to the editor" })).toBeNull();
    });
  });

  it("shows the message of a link that could not be built", async () => {
    renderApp({
      overrides: {
        currentHref: () => {
          throw new Error("no address");
        },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/Couldn't make the link: no address/)).toBeTruthy();
  });

  it("locks the whole stack from the plan's Lock position button", () => {
    const p = fixtureProject();
    const trays = [
      makeTray({ key: "a:p0:0", path: "0", level: 0, z: 0 }),
      makeTray({ key: "b:p0:1", path: "0", level: 1, z: 40 }),
      makeTray({ key: "c:p1:0", path: "1", stack: 1, x: 110 }),
    ];
    const { store } = renderApp({ project: { ...p, layout: makeLayout(inputsHash(p), trays) } });
    fireEvent.click(screen.getByLabelText("Advanced"));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1,/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Lock position" }));
    const locks = store.state.project.value.locks;
    expect(locks.filter((l) => l.kind === "position").map((l) => l.trayKey)).toEqual([
      "a:p0:0",
      "b:p0:1",
    ]);
    expect(locks.some((l) => l.kind === "stack")).toBe(true);
    expect(screen.getByRole("button", { name: "Unlock position" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock position" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("dismisses an app notice", async () => {
    const { store } = renderApp();
    store.pushNotice({ level: "info", code: "test.note", message: "Heads up." });
    expect(await screen.findByText("Heads up.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Heads up." }));
    await waitFor(() => expect(screen.queryByText("Heads up.")).toBeNull());
    expect(store.state.appNotices.value).toEqual([]);
  });

  it("undoes the last layout from the summary", async () => {
    const p = fixtureProject();
    const before = makeLayout(inputsHash(p), [makeTray({ key: "old:p0:0" })]);
    const { store } = renderApp({ project: { ...p, layout: before } });
    store.edit((q) => updateBox(q, { innerHeight: q.box.innerHeight + 2 }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo layout" }));
    expect(store.state.project.value.layout).toEqual(before);
    expect(store.state.project.value.box.innerHeight).toBe(p.box.innerHeight);
    expect(store.canUndo.value).toBe(false);
  });
});
