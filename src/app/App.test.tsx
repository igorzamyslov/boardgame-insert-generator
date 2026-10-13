// src/app/App.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import { APP_VERSION } from "../model/version";
import { encodeHash } from "../share";
import type { SceneFactory, SceneHandle } from "../viewer/types";
import { CONFLICT_CODE } from "./persistence";
import { EMPTY_FOREIGN, fixtureProject, makeLayout, makeResult, makeTray } from "./test-helpers";
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
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return () => handle;
}

function withLayoutHash(): string {
  const p = fixtureProject();
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", stack: 0, x: 0, y: 0 }),
    makeTray({ key: "b:p0:0", path: "1", stack: 1, x: 110, y: 0 }),
  ];
  return encodeHash({ ...p, layout: makeLayout(inputsHash(p), trays) }, EMPTY_FOREIGN);
}

/** Switches the view sheet to a tab; only the selected view's panel is mounted. */
function openTab(name: "Plan" | "3D"): void {
  fireEvent.click(screen.getByRole("tab", { name }));
}

/** The empty state and the rail both offer the Add buttons; either one adds. */
function addCards(): void {
  fireEvent.click(screen.getAllByRole("button", { name: "Add cards" })[0] as HTMLElement);
}

/** The export panel replaces the tab panel; its button shows it. */
function openExport(): void {
  fireEvent.click(screen.getByRole("button", { name: /^Export all \d+ trays$/ }));
}

/** The assembly page's button lives in the export panel. */
function openAssemblyPage(): void {
  openExport();
  fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
}

describe("App", () => {
  it("lays out the title, inputs then results with the preview banner and footer", () => {
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
    expect(screen.getByText(/shared links may break/)).toBeTruthy();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(`v${APP_VERSION}`);
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
    const { store, stub } = renderApp(withLayoutHash());
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
    expect(screen.getByRole("region", { name: "Export" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3MF per part (.zip)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← Back to the plan" }));
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
    const { store } = renderApp(withLayoutHash());
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
    renderApp(withLayoutHash());
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
    renderApp(withLayoutHash(), {
      viewerProps: { webgl: () => true, loadScene: () => Promise.resolve(stubSceneFactory()) },
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
      const { store } = renderApp(withLayoutHash());
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
      const { store } = renderApp(withLayoutHash());
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
      const { store } = renderApp(withLayoutHash());
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
    renderApp(withLayoutHash());
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1,/ }), { key: "Enter" });
    for (const name of ["Lock size", "Lock position", "Swap with…"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("locks and unlocks a tray's size from the tray details in Advanced", () => {
    const { store } = renderApp(withLayoutHash());
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
    renderApp(withLayoutHash());
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
    expect(await screen.findByText(/Doesn't fit: short by 12\.3 mm left–right/)).toBeTruthy();
    addCards();
    await waitFor(() => expect(screen.queryByText(/Doesn't fit/)).toBeNull());
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

  describe("assembly page", () => {
    it("moves the focus to the page and back to its button, and scrolls to the top", () => {
      renderApp(withLayoutHash());
      openAssemblyPage();
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Open the assembly page" }),
      );
    });

    it("hands its downloads to the app's download function", async () => {
      const { download } = renderApp(withLayoutHash());
      openAssemblyPage();
      fireEvent.click(screen.getByRole("button", { name: /^Download PNG of layer 1/ }));
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      expect(download.mock.calls[0]?.[1]).toMatch(/-layer-1\.png$/);
    });

    it("returns to the editor when the layout goes away, and stays there when one comes back", async () => {
      const { store } = renderApp(withLayoutHash());
      openAssemblyPage();
      store.newProject();
      expect(await screen.findByRole("region", { name: "Inputs" })).toBeTruthy();
      store.openFromHash(withLayoutHash());
      expect(await screen.findByRole("tab", { name: "Plan" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to the editor" })).toBeNull();
    });

    it("returns to the editor when another project is opened", async () => {
      const { store } = renderApp(withLayoutHash());
      openAssemblyPage();
      const other = { ...fixtureProject(), id: "other-project", name: "Other" };
      store.openFromHash(
        encodeHash({ ...other, layout: makeLayout(inputsHash(other)) }, EMPTY_FOREIGN),
      );
      expect(await screen.findByRole("region", { name: "Inputs" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to the editor" })).toBeNull();
    });
  });

  it("shows the message of a link that could not be built", async () => {
    renderApp("", {
      currentHref: () => {
        throw new Error("no address");
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
    const hash = encodeHash({ ...p, layout: makeLayout(inputsHash(p), trays) }, EMPTY_FOREIGN);
    const { store } = renderApp(hash);
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
    const { store } = renderApp(
      encodeHash({ ...p, layout: makeLayout(inputsHash(p)) }, EMPTY_FOREIGN),
    );
    store.state.undoSlot.value = { layout: before };
    fireEvent.click(await screen.findByRole("button", { name: "Undo layout" }));
    expect(store.state.project.value.layout).toBe(before);
    expect(store.state.undoSlot.value).toBeNull();
  });
});
