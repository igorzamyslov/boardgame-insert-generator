// src/app/App.phone.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import workspaceCss from "../screens/workspace.css?raw";
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
/** The selected tray's dock: the one bar, under the plan, as on a desktop. */
const dock = (): HTMLElement => screen.getByRole("region", { name: "Selected tray" });
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

  it("folds the list to one row of chips, and the grip opens it and the title folds it", () => {
    phone();
    renderApp({ project: project() });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(sheet().getAttribute("data-chips")).toBe("true");
    // folded: the chips and the Add pill are in reach, the list itself is not, and there is no title row
    expect(grip().getAttribute("aria-expanded")).toBe("false");
    expect(sheet().querySelector(".k-sheet__handle")).toBeNull();
    expect(within(sheet()).getByRole("list", { name: "Items" }).closest("[inert]")).toBeNull();
    expect(within(sheet()).getByRole("button", { name: "Add" }).closest("[inert]")).toBeNull();
    expect(sheet().querySelector(".k-sheet__body")?.closest("[inert]")).not.toBeNull();
    fireEvent.click(grip());
    expect(grip().getAttribute("aria-expanded")).toBe("true");
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(within(sheet()).queryByRole("list", { name: "Items" })).toBeNull();
    expect(rowIn(/^The box,/).closest("[inert]")).toBeNull();
    fireEvent.click(handle());
    expect(grip().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(grip());
    expect(handle().getAttribute("aria-expanded")).toBe("true");
  });

  it("peeks the sheet at 76 px with one chip per item, in the list's order", () => {
    phone();
    renderApp({ project: project() });
    expect(workspaceCss).toMatch(/--sheet-peek:\s*76px/);
    const chips = within(within(sheet()).getByRole("list", { name: "Items" })).getAllByRole(
      "button",
    );
    expect(chips.map((c) => c.textContent)).toEqual(project().components.map((c) => c.name));
    expect(chips.every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("opens the full list with a swipe up on the folded sheet", () => {
    phone();
    renderApp({ project: project() });
    const bar = sheet().querySelector(".k-sheet__bar") as HTMLElement;
    fireEvent.pointerDown(bar, { clientY: 600, pointerId: 1, isPrimary: true });
    fireEvent.pointerUp(bar, { clientY: 500, pointerId: 1, isPrimary: true });
    expect(grip().getAttribute("aria-expanded")).toBe("true");
  });

  describe("the page behind a dialog that fills the screen", () => {
    // a native modal dialog is what makes the page inert (jsdom has none: its showModal is stubbed)
    const modal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    beforeEach(() => {
      modal.mockClear();
      HTMLDialogElement.prototype.showModal = modal;
    });
    afterEach(() => {
      Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    });

    it("is made inert by Download and Settings, not by a tray's dock", async () => {
      phone(true, true);
      renderApp({ project: project() });
      fireEvent.keyDown(document.querySelector('.plan-tile[data-key="m:p0:0"]') as Element, {
        key: "Enter",
      });
      // the dock is not a dialog: nothing modal opens for a tray
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(modal).not.toHaveBeenCalled();
      fireEvent.click(within(dock()).getByRole("button", { name: "Close" }));
      // the focus goes back to the tile on the next frame: let it, so it cannot land in a later test
      await waitFor(() => expect(document.activeElement?.getAttribute("data-key")).toBe("m:p0:0"));

      const header = document.querySelector('[data-region="header"]') as HTMLElement;
      fireEvent.click(within(header).getByRole("button", { name: "Download" }));
      expect(screen.getByRole("dialog", { name: "Ready to print" }).tagName).toBe("DIALOG");
      expect(modal).toHaveBeenCalledTimes(1);
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Ready to print" })).getByRole("button", {
          name: "Close",
        }),
      );

      fireEvent.click(screen.getByRole("button", { name: "Project menu" }));
      fireEvent.click(
        within(screen.getByRole("group", { name: "Project" })).getByRole("button", {
          name: "Settings",
        }),
      );
      expect(screen.getByRole("dialog", { name: "Settings" }).tagName).toBe("DIALOG");
      expect(modal).toHaveBeenCalledTimes(2);
      // leave the app as it was found
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Settings" })).getByRole("button", {
          name: "Done",
        }),
      );
      await flush();
    });
  });

  it("says how many items there are beside the title, once the list is open", () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(grip());
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
    fireEvent.click(rowIn(/^Edit Market$/));
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(sheet().contains(h1s[0] as HTMLElement)).toBe(true);
    expect(h1s[0]?.textContent).toBe("Market");
  });

  it("has one h1 in the box editor: the sheet's name", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(grip());
    fireEvent.click(rowIn(/^The box,/));
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(sheet().contains(h1s[0] as HTMLElement)).toBe(true);
    expect(h1s[0]?.textContent).toBe("The box");
    // the side view is under the fields, with its label (not a heading)
    expect(within(sheet()).getByText("Side view of the box")).toBeTruthy();
    expect(within(sheet()).getByText("Kept free, 8 mm")).toBeTruthy();
    expect(within(sheet()).getByText("Trays fill the 62 mm below.")).toBeTruthy();
  });

  it("opens an editor from a row of the folded sheet, and unfolds the sheet for it", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(rowIn(/^Edit Market$/));
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

  it("opens the sheet on the editor when the dock's Edit is pressed", async () => {
    phone();
    const { store } = renderApp({ project: project() });
    fireEvent.keyDown(document.querySelector('.plan-tile[data-key="m:p0:0"]') as Element, {
      key: "Enter",
    });
    fireEvent.click(within(dock()).getByRole("button", { name: "Edit" }));
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(sheet().getAttribute("data-full")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 1, name: "Market" })).toBeTruthy();
    // folding the editor comes back to the list: the tray is still selected, and its dock is still there
    fireEvent.click(handle());
    expect(grip().getAttribute("aria-expanded")).toBe("false");
    expect(store.state.selection.value).toBe("m:p0:0");
    expect(dock()).toBeTruthy();
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
      fireEvent.click(within(dock()).getByRole("button", { name: "Edit" }));
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
      fireEvent.click(grip());
      expect(behind().some((el) => el.hasAttribute("inert"))).toBe(false);
      fireEvent.click(rowIn(/^The box,/));
      expect(behind().every((el) => el.hasAttribute("inert"))).toBe(true);
      // the box brings its own header (Back, the h1, Done), as an editor does
      expect(sheet().getAttribute("data-editing")).toBe("true");
    });
  });

  it("fills the screen for the box, and folds back to the list when closed", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(grip());
    expect(sheet().getAttribute("data-full")).toBeNull();
    fireEvent.click(rowIn(/^The box,/));
    expect(sheet().getAttribute("data-full")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 1, name: "The box" })).toBeTruthy();
    fireEvent.keyDown(handle(), { key: "Escape" });
    expect(grip().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(grip());
    expect(sheet().getAttribute("data-full")).toBeNull();
    expect(rowIn(/^The box,/)).toBeTruthy();
  });

  it("folds an editor back to the list too", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(rowIn(/^Edit Market$/));
    await within(sheet()).findByRole("heading", { level: 1, name: "Market" });
    fireEvent.click(handle());
    expect(sheet().getAttribute("data-editing")).toBeNull();
    expect(within(sheet()).queryByRole("heading", { level: 1 })).toBeNull();
    expect(rowIn(/^Market,/)).toBeTruthy();
  });

  it("offers Try another arrangement in the pinned strip when the trays do not fit", async () => {
    phone();
    const { store, stub } = renderApp({ project: project() });
    expect(within(sheet()).getByRole("button", { name: "Add" })).toBeTruthy();
    act(() => {
      store.state.lastResult.value = makeResult(null, {
        bestAttempt: { trays: [], shortfall: { x: 12.3, y: 0, z: 0 } },
      });
      store.state.lastResultHash.value = store.state.currentHash.value;
    });
    // the sheet stays the list (no card of its own); the strip over the plan has the button
    expect(screen.queryByRole("region", { name: "Ways to make it fit" })).toBeNull();
    expect(within(sheet()).getByRole("button", { name: "Add" })).toBeTruthy();
    // one button, the strip's: the row's own icon is gone
    const keep = screen.getByRole("button", { name: "Try another arrangement" });
    expect(keep.closest(".stage-fit")).not.toBeNull();
    expect(keep.closest("[inert]")).toBeNull();
    fireEvent.click(keep);
    await waitFor(() => expect(stub.calls).toHaveLength(1));
    // the strip went with the search; the row's icon is blocked while it runs
    expect(
      screen.getByRole("button", { name: "Try another arrangement" }).getAttribute("aria-disabled"),
    ).toBe("true");
    // the button went with the search: Stop, which took its place, has the focus
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop" }));
  });

  describe("a tray picked on the plan", () => {
    const pick = (): void => {
      fireEvent.keyDown(document.querySelector('.plan-tile[data-key="m:p0:0"]') as Element, {
        key: "Enter",
      });
    };

    it("shows the tray's dock under the plan: no dialog, no sheet of its own", () => {
      phone();
      renderApp({ project: project() });
      expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
      pick();
      expect(screen.queryByRole("dialog")).toBeNull();
      const bar = dock();
      expect(bar.closest(".tray-dock")).not.toBeNull();
      expect(bar.closest(".plan-col")).not.toBeNull();
      expect(within(bar).getByText("Market")).toBeTruthy();
      expect(within(bar).getByRole("button", { name: "Edit" })).toBeTruthy();
      expect(within(bar).getByRole("button", { name: "More about this tray" })).toBeTruthy();
      expect(sheet().closest("[inert]")).toBeNull();
    });

    it("presses the chip of the picked tray's item", () => {
      phone();
      renderApp({ project: project() });
      const chip = (): HTMLElement =>
        within(within(sheet()).getByRole("list", { name: "Items" })).getByRole("button", {
          name: "Market",
        });
      expect(chip().getAttribute("aria-pressed")).toBe("false");
      pick();
      expect(chip().getAttribute("aria-pressed")).toBe("true");
    });

    it("selects the item's tray when its chip is tapped, and clears it when tapped again", () => {
      phone();
      const { store } = renderApp({ project: project() });
      const chip = (): HTMLElement =>
        within(within(sheet()).getByRole("list", { name: "Items" })).getByRole("button", {
          name: "Market",
        });
      fireEvent.click(chip());
      expect(store.state.selection.value).toBe("m:p0:0");
      expect(dock()).toBeTruthy();
      fireEvent.click(chip());
      expect(store.state.selection.value).toBeNull();
    });

    it("puts the Layer switch under the plan", () => {
      phone();
      renderApp({ project: project() });
      const segs = document.querySelector(".stage-segs--phone") as HTMLElement;
      expect(segs.parentElement?.classList.contains("plan-col")).toBe(true);
    });

    it("closes with Close, and clears the selection", () => {
      phone();
      const { store } = renderApp({ project: project() });
      pick();
      fireEvent.click(within(dock()).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("region", { name: "Selected tray" })).toBeNull();
      expect(store.state.selection.value).toBeNull();
    });

    it("gives the focus back to the tile when Close is pressed", async () => {
      phone();
      renderApp({ project: project() });
      const tile = document.querySelector('.plan-tile[data-key="m:p0:0"]') as HTMLElement;
      // picked without the focus on it, so only the bar's own hand-back can put it there
      pick();
      expect(document.activeElement).not.toBe(tile);
      fireEvent.click(within(dock()).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(document.activeElement).toBe(tile));
    });

    it("keeps the plan in reach while a swap is chosen, and the swap is made by picking the tray", () => {
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
      fireEvent.click(within(dock()).getByRole("button", { name: "More about this tray" }));
      fireEvent.click(screen.getByRole("button", { name: /^Swap places with…/ }));
      expect(store.state.swapFrom.value).toBe("a:p0:0");
      expect(screen.getByText(/Choose the tray to swap with/)).toBeTruthy();
      fireEvent.keyDown(document.querySelector('.plan-tile[data-key="b:p0:0"]') as Element, {
        key: "Enter",
      });
      expect(store.state.project.value.locks).toHaveLength(2);
      expect(store.state.swapFrom.value).toBeNull();
      expect(dock()).toBeTruthy();
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

  describe("the Download dialog", () => {
    const openDownload = (): HTMLElement => {
      const header = document.querySelector('[data-region="header"]') as HTMLElement;
      fireEvent.click(within(header).getByRole("button", { name: "Download" }));
      return screen.getByRole("dialog", { name: "Ready to print" });
    };

    it("is MobileDownload's on a phone: Close, the guide, Send file and Download in the foot", () => {
      phone();
      renderApp({ project: project() });
      const dialog = openDownload();
      expect(dialog.classList.contains("export-dialog--phone")).toBe(true);
      expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Packing guide" })).toBeTruthy();
      expect(
        dialog
          .querySelector(".export-foot")
          ?.contains(within(dialog).getByRole("button", { name: "Download the 3MF file" })),
      ).toBe(true);
    });

    it("has Send file, which hands the file to the share sheet", async () => {
      phone();
      const share = vi.fn<ShareFile>(() => Promise.resolve("shared"));
      renderApp({ project: project(), overrides: { share } });
      fireEvent.click(within(openDownload()).getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect((share.mock.calls[0]?.[0] as File).name).toMatch(/\.insert\.json$/);
    });

    it("has no Send file on a desktop", () => {
      phone(false);
      renderApp({ project: project() });
      const dialog = openDownload();
      expect(dialog.classList.contains("export-dialog--phone")).toBe(false);
      expect(within(dialog).queryByRole("button", { name: "Send file" })).toBeNull();
    });
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
