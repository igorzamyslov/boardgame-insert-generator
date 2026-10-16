// src/app/App.phone.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { fixtureProject, makeLayout, makeResult, makeTray } from "./test-helpers";
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
// The editor has its own way back named "What's inside" too, so the handle is found by its class.
const handle = (): HTMLElement => sheet().querySelector(".pf-sheet__handle") as HTMLElement;

describe("the phone layout", () => {
  it("keeps the list in the rail on a wider screen", () => {
    phone(false);
    renderApp({ project: project() });
    expect(screen.queryByRole("region", { name: "The box and what's inside" })).toBeNull();
    expect(screen.getByRole("region", { name: "Inputs" })).toBeTruthy();
  });

  it("still has exactly one Download button on a phone", () => {
    phone();
    renderApp({ project: project() });
    expect(
      screen.queryAllByRole("button", { name: /^(?:Download|Fix the fit to download)$/ }),
    ).toHaveLength(1);
  });

  it("puts the list in a folded sheet whose handle opens it", () => {
    phone();
    renderApp({ project: project() });
    expect(screen.queryByRole("region", { name: "Inputs" })).toBeNull();
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(handle());
    expect(handle().getAttribute("aria-expanded")).toBe("true");
    expect(within(sheet()).getByRole("button", { name: "Add cards" })).toBeTruthy();
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
      const box = sheet().querySelector("#section-box") as HTMLDetailsElement;
      box.open = true;
      fireEvent(box, new Event("toggle"));
      expect(behind().every((el) => el.hasAttribute("inert"))).toBe(true);
      expect(sheet().getAttribute("data-editing")).toBeNull();
    });
  });

  it("fills the screen for the box, and folds back to the list when closed", () => {
    phone();
    renderApp({ project: project() });
    fireEvent.click(handle());
    expect(sheet().getAttribute("data-full")).toBeNull();
    // jsdom does not open a <details> by itself: do what the browser does
    const box = sheet().querySelector("#section-box") as HTMLDetailsElement;
    box.open = true;
    fireEvent(box, new Event("toggle"));
    expect(sheet().getAttribute("data-full")).toBe("true");
    fireEvent.keyDown(handle(), { key: "Escape" });
    expect(handle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(handle());
    expect(sheet().getAttribute("data-full")).toBeNull();
  });

  it("offers Keep searching beside the handle when the trays do not fit", async () => {
    phone();
    const { store, stub } = renderApp({ project: project() });
    expect(within(sheet()).queryByRole("button", { name: "Keep searching" })).toBeNull();
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

  it("ends the first visit with the licenses link, once", () => {
    phone();
    renderApp();
    expect(screen.queryByRole("region", { name: "The box and what's inside" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Third-party licenses" })).toHaveLength(1);
  });

  it("keeps the project's licenses link in the sheet, out of the way of the handle", () => {
    phone();
    renderApp({ project: project() });
    expect(within(sheet()).getByRole("link", { name: "Third-party licenses" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Third-party licenses" })).toHaveLength(1);
  });
});
