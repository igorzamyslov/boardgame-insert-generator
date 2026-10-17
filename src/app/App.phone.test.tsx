// src/app/App.phone.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import type { ShareFile } from "./sendFile";
import { fixtureProject, flush, makeLayout, makeResult, makeTray } from "./test-helpers";
import { renderApp, renderWorkspace } from "./test-app";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A phone: the width query the app asks (below 760 px) answers yes; `narrow` adds below 600 px. */
function phone(on = true, narrow = false): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: on && (query === "(width < 760px)" || (narrow && query === "(width < 600px)")),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function project(): Project {
  const p = fixtureProject();
  const market = makeTray({
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
  return { ...p, layout: makeLayout(inputsHash(p), [market]) };
}

const sheet = (): HTMLElement => screen.getByRole("region", { name: "The box and what's inside" });
// The title's button; the editor has its own way back named "What's inside" too, so it is found by its class.
const handle = (): HTMLElement => sheet().querySelector(".k-sheet__handle") as HTMLElement;
const grip = (): HTMLElement => within(sheet()).getByRole("button", { name: "Show everything" });
const rowIn = (name: RegExp): HTMLElement => within(sheet()).getByRole("button", { name });

describe("the phone layout", () => {
  it("keeps the list in the rail on a wider screen", () => {
    phone(false);
    renderApp({ project: project() });
    expect(screen.queryByRole("region", { name: "The box and what's inside" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "What's inside" })).toBeTruthy();
  });

  it("still has exactly one Download button on a phone", () => {
    phone();
    renderApp({ project: project() });
    expect(
      screen.queryAllByRole("button", { name: /^(?:Download|Fix the fit to download)$/ }),
    ).toHaveLength(1);
  });

  it("puts the list in a sheet that peeks while folded, and the grip and the title open it", () => {
    phone();
    renderApp({ project: project() });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(sheet().getAttribute("data-peek")).toBe("true");
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    // folded, the rows and the Add pill are still in reach
    expect(rowIn(/^The box,/).closest("[inert]")).toBeNull();
    expect(within(sheet()).getByRole("button", { name: "Add" }).closest("[inert]")).toBeNull();
    fireEvent.click(handle());
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(grip());
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(grip());
    expect(grip().getAttribute("aria-expanded")).toBe("true");
  });

  it("says how many items there are beside the title", () => {
    phone();
    renderApp({ project: project() });
    expect(handle().textContent).toBe(`What's inside${project().components.length}`);
  });

  it("lists The box first in the sheet", () => {
    phone();
    renderApp({ project: project() });
    const rows = within(within(sheet()).getByRole("list", { name: "What's inside" })).getAllByRole(
      "listitem",
    );
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: /^The box, / })).toBeTruthy();
    expect(rows).toHaveLength(project().components.length + 1);
  });

  it("has one h1 while editing: the sheet's name", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(grip());
    fireEvent.click(rowIn(/^Market/));
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(sheet().contains(h1s[0] as HTMLElement)).toBe(true);
    expect(h1s[0]?.textContent).toBe("Market");
  });

  it("opens an editor from a row of the folded sheet, and unfolds the sheet for it", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(rowIn(/^Market,/));
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(sheet().getAttribute("data-full")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 1, name: "Market" })).toBeTruthy();
    // no Add pill over an editor
    expect(within(sheet()).queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("adds from the sheet's Add pill: the picker opens over it, and the new item opens", async () => {
    phone();
    const { store } = renderApp({ project: project() });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Add" }));
    const picker = screen.getByRole("group", { name: "Add something inside" });
    expect(picker.parentElement?.getAttribute("data-placement")).toBe("above");
    fireEvent.click(within(picker).getByRole("button", { name: "Tiles" }));
    expect(store.state.project.value.components.map((c) => c.kind)).toContain("tiles");
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 1, name: "Tiles" })).toBeTruthy();
  });

  it("opens the sheet on the editor when a tray's Edit is pressed", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.keyDown(document.querySelector('.plan-tile[data-key="m:p0:0"]') as Element, {
      key: "Enter",
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Edit Market" }),
    );
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(sheet().getAttribute("data-full")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 1, name: "Market" })).toBeTruthy();
    // the tray's sheet gives way to the editor, and comes back with the list: the tray is still selected
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(handle());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  describe("what is behind a sheet that fills the screen", () => {
    const behind = (): Element[] => [
      document.querySelector('[data-region="header"]') as Element,
      screen.getByRole("main"),
    ];

    function openEditor(): void {
      fireEvent.keyDown(document.querySelector('.plan-tile[data-key="m:p0:0"]') as Element, {
        key: "Enter",
      });
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Edit Market" }),
      );
    }

    it("is out of reach of Tab and screen readers (inert) below 600 px, and the sheet is not", () => {
      phone(true, true);
      renderApp({ project: project() });
      expect(behind().some((el) => el.hasAttribute("inert"))).toBe(false);
      openEditor();
      expect(behind().every((el) => el.hasAttribute("inert"))).toBe(true);
      expect(sheet().closest("[inert]")).toBeNull();
      expect(sheet().getAttribute("data-editing")).toBe("true");
      // folding the sheet gives the page back
      fireEvent.click(handle());
      expect(behind().some((el) => el.hasAttribute("inert"))).toBe(false);
    });

    it("stays within reach while the sheet is a part of the screen (600 to 760 px)", () => {
      phone(true, false);
      renderApp({ project: project() });
      openEditor();
      expect(sheet().getAttribute("data-full")).toBe("true");
      expect(behind().some((el) => el.hasAttribute("inert"))).toBe(false);
    });

    it("also holds for the box section", () => {
      phone(true, true);
      renderApp({ project: project() });
      fireEvent.click(handle());
      expect(behind().some((el) => el.hasAttribute("inert"))).toBe(false);
      fireEvent.click(rowIn(/^The box,/));
      expect(behind().every((el) => el.hasAttribute("inert"))).toBe(true);
      expect(sheet().getAttribute("data-editing")).toBeNull();
    });
  });

  it("fills the screen for the box, and folds back to the list when closed", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(handle());
    expect(sheet().getAttribute("data-full")).toBeNull();
    fireEvent.click(rowIn(/^The box,/));
    expect(sheet().getAttribute("data-full")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 3, name: "The box" })).toBeTruthy();
    fireEvent.keyDown(handle(), { key: "Escape" });
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(handle());
    expect(sheet().getAttribute("data-full")).toBeNull();
    expect(rowIn(/^The box,/)).toBeTruthy();
  });

  it("folds an editor back to the list too", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(rowIn(/^Market,/));
    await within(sheet()).findByRole("heading", { level: 1, name: "Market" });
    fireEvent.click(handle());
    expect(sheet().getAttribute("data-editing")).toBeNull();
    expect(within(sheet()).queryByRole("heading", { level: 1 })).toBeNull();
    expect(rowIn(/^Market,/)).toBeTruthy();
  });

  it("offers Keep searching beside the handle when the trays do not fit", async () => {
    phone();
    const { store, stub } = renderApp({ project: project() });
    expect(within(sheet()).queryByRole("button", { name: "Keep searching" })).toBeNull();
    expect(within(sheet()).getByRole("button", { name: "Add" })).toBeTruthy();
    act(() => {
      store.state.lastResult.value = makeResult(null, {
        bestAttempt: { trays: [], shortfall: { x: 12.3, y: 0, z: 0 } },
      });
      store.state.lastResultHash.value = store.state.currentHash.value;
    });
    // folded, and still in reach
    const keep = within(sheet()).getByRole("button", { name: "Keep searching" });
    expect(keep.closest("[inert]")).toBeNull();
    fireEvent.click(keep);
    await waitFor(() => expect(stub.calls).toHaveLength(1));
    expect(within(sheet()).queryByRole("button", { name: "Keep searching" })).toBeNull();
    expect(document.activeElement).toBe(handle());
  });

  describe("a tray picked on the plan", () => {
    const pick = (): void => {
      fireEvent.keyDown(document.querySelector('.plan-tile[data-key="m:p0:0"]') as Element, {
        key: "Enter",
      });
    };

    it("opens the tray's sheet: a modal dialog named by the tray, and no bar in the stage", () => {
      phone();
      renderApp({ project: project() });
      expect(screen.queryByRole("dialog")).toBeNull();
      pick();
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { level: 2, name: "Market" })).toBeTruthy();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
      // only one element is the sheet: the list's sheet behind it lets go of the name
      expect(document.querySelectorAll('[data-region="sheet"]')).toHaveLength(1);
      expect(document.querySelector('[data-region="sheet"]')).toBe(dialog);
    });

    it("keeps the plan where it is: the slot has no room for a bar the sheet replaces", () => {
      phone();
      renderApp({ project: project() });
      const slot = (): Element | null => document.querySelector(".stage-slot");
      expect(slot()?.classList.contains("visually-hidden")).toBe(true);
      pick();
      expect(slot()?.classList.contains("visually-hidden")).toBe(true);
    });

    it("closes with Close, and clears the selection", () => {
      phone();
      const { store } = renderApp({ project: project() });
      pick();
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(store.state.selection.value).toBeNull();
    });

    it("gives the focus back to the tile when Escape closes the sheet", async () => {
      phone();
      const { store } = renderApp({ project: project() });
      const tile = document.querySelector('.plan-tile[data-key="m:p0:0"]') as HTMLElement;
      // picked without the focus on it, so only the bar's own hand-back can put it there
      pick();
      expect(document.activeElement).not.toBe(tile);
      act(() => {
        screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(store.state.selection.value).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(tile));
    });

    it("gives the focus back to the tile when a press behind the sheet closes it", async () => {
      phone();
      const { store } = renderApp({ project: project() });
      const tile = document.querySelector('.plan-tile[data-key="m:p0:0"]') as HTMLElement;
      pick();
      fireEvent.click(screen.getByRole("dialog"));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(store.state.selection.value).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(tile));
    });

    it("lets go of the plan while a swap is chosen, and takes it back when it is made", () => {
      phone();
      const p = fixtureProject();
      const trays = [
        makeTray({ key: "a:p0:0", path: "0", stack: 0, x: 0, y: 0 }),
        makeTray({ key: "b:p0:0", path: "1", stack: 1, x: 110, y: 0 }),
      ];
      const { store } = renderApp({ project: { ...p, layout: makeLayout(inputsHash(p), trays) } });
      fireEvent.keyDown(document.querySelector('.plan-tile[data-key="a:p0:0"]') as Element, {
        key: "Enter",
      });
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "More" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "Swap with…" }));
      expect(store.state.swapFrom.value).toBe("a:p0:0");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText(/Choose the tray to swap with/)).toBeTruthy();
      fireEvent.keyDown(document.querySelector('.plan-tile[data-key="b:p0:0"]') as Element, {
        key: "Enter",
      });
      expect(store.state.project.value.locks).toHaveLength(2);
      expect(store.state.swapFrom.value).toBeNull();
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
  });

  it("has no footer on a phone: the licences are the project menu's last line", () => {
    phone();
    renderApp({ project: project() });
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByText(/Third-party licenses/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
    expect(screen.getAllByRole("link", { name: "Licences" })).toHaveLength(1);
  });

  it("has no footer on the first visit either", () => {
    phone();
    renderApp();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByRole("link", { name: /licen[cs]es/i })).toBeNull();
  });

  describe("the phone header", () => {
    it("has Undo and Send file, the menu button and Download, and no Redo", () => {
      phone();
      renderApp({ project: project() });
      const header = document.querySelector('[data-region="header"]') as HTMLElement;
      for (const name of ["Undo", "Send file", "Project menu", "Download"]) {
        expect(within(header).getByRole("button", { name })).toBeTruthy();
      }
      expect(within(header).queryByRole("button", { name: "Redo" })).toBeNull();
    });

    it("puts Redo first in the project menu, and Send file is not there", () => {
      phone();
      renderApp({ project: project() });
      fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
      const panel = screen.getByRole("group", { name: "Project" });
      expect(panel.querySelector("button")?.textContent).toBe("Redo");
      expect(within(panel).queryByRole("button", { name: "Send file" })).toBeNull();
    });

    it("Send file hands the file to the share sheet", async () => {
      phone();
      const share = vi.fn<ShareFile>(() => Promise.resolve("shared"));
      const { download } = renderWorkspace({ overrides: { share } });
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const file = share.mock.calls[0]?.[0] as File;
      expect(file.name).toMatch(/\.insert\.json$/);
      expect(download).not.toHaveBeenCalled();
    });

    it("Send file saves the file where the share sheet can't take it", async () => {
      phone();
      const share = vi.fn<ShareFile>(() => Promise.resolve("unsupported"));
      const { download } = renderWorkspace({ overrides: { share } });
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    });

    it("Send file does nothing more when the sheet is dismissed", async () => {
      phone();
      const share = vi.fn<ShareFile>(() => Promise.resolve("cancelled"));
      const { download } = renderWorkspace({ overrides: { share } });
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      await flush();
      expect(download).not.toHaveBeenCalled();
    });
  });
});
