// src/app/App.phone.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import type { ShareFile } from "./sendFile";
import { fixtureProject, flush, makeLayout, makeResult, makeTray } from "./test-helpers";
import { renderApp } from "./test-app";

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
    expect(rows[0]?.textContent).toMatch(/^The box,/);
    expect(rows).toHaveLength(project().components.length + 1);
  });

  it("opens an editor from a row of the folded sheet, and unfolds the sheet for it", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(rowIn(/^Market,/));
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(sheet().getAttribute("data-full")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 3, name: "Market" })).toBeTruthy();
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
    expect(await within(sheet()).findByRole("heading", { level: 3, name: "Tiles" })).toBeTruthy();
  });

  it("opens the sheet on the editor when a tray's Edit is pressed", async () => {
    phone();
    renderApp({ project: project() });
    fireEvent.keyDown(document.querySelector('.plan-tray[data-key="m:p0:0"]') as Element, {
      key: "Enter",
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Selected tray" })).getByRole("button", {
        name: "Edit",
      }),
    );
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(sheet().getAttribute("data-full")).toBe("true");
    expect(await within(sheet()).findByRole("heading", { level: 3, name: "Market" })).toBeTruthy();
  });

  describe("what is behind a sheet that fills the screen", () => {
    const behind = (): Element[] => [
      document.querySelector('[data-region="header"]') as Element,
      screen.getByRole("main"),
    ];

    function openEditor(): void {
      fireEvent.keyDown(document.querySelector('.plan-tray[data-key="m:p0:0"]') as Element, {
        key: "Enter",
      });
      fireEvent.click(
        within(screen.getByRole("group", { name: "Selected tray" })).getByRole("button", {
          name: "Edit",
        }),
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
    await within(sheet()).findByRole("heading", { level: 3, name: "Market" });
    fireEvent.click(handle());
    expect(sheet().getAttribute("data-editing")).toBeNull();
    expect(within(sheet()).queryByRole("heading", { level: 3 })).toBeNull();
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

  it("brings the tray bar into view above the handle when a tray is selected", () => {
    phone();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderApp({ project: project() });
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.keyDown(document.querySelector('.plan-tray[data-key="m:p0:0"]') as Element, {
      key: "Enter",
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollIntoView.mock.contexts[0]).toBe(
      screen.getByRole("group", { name: "Selected tray" }),
    );
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
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
      const { download } = renderApp({ overrides: { share } });
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const file = share.mock.calls[0]?.[0] as File;
      expect(file.name).toMatch(/\.insert\.json$/);
      expect(download).not.toHaveBeenCalled();
    });

    it("Send file saves the file where the share sheet can't take it", async () => {
      phone();
      const share = vi.fn<ShareFile>(() => Promise.resolve("unsupported"));
      const { download } = renderApp({ overrides: { share } });
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    });

    it("Send file does nothing more when the sheet is dismissed", async () => {
      phone();
      const share = vi.fn<ShareFile>(() => Promise.resolve("cancelled"));
      const { download } = renderApp({ overrides: { share } });
      fireEvent.click(screen.getByRole("button", { name: "Send file" }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      await flush();
      expect(download).not.toHaveBeenCalled();
    });
  });
});
