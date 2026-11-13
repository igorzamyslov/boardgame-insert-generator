// src/screens/FirstVisit.test.tsx
// @vitest-environment jsdom
// The first visit (UI rebuild Task 9): Empty on a desktop, MobileStart on a phone.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFLICT_CODE } from "../app/persistence";
import { renderApp, renderWorkspace } from "../app/test-app";
import { DEFAULT_BOX } from "../model/defaults";
import { ValidationContext } from "../ui/validation";
import { FirstVisit } from "./FirstVisit";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A phone: the width query the app asks (below 760 px) answers yes. */
function phone(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(width < 760px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

const KINDS = ["Cards", "Tokens and dice", "Tiles", "Miniatures", "Something else"];
const H1 = "Let's build an insert for your game";

const rail = (): HTMLElement => document.querySelector('[data-region="rail"]') as HTMLElement;
const stage = (): HTMLElement => document.querySelector('[data-region="stage"]') as HTMLElement;
const header = (): HTMLElement => document.querySelector('[data-region="header"]') as HTMLElement;
const height = (): HTMLInputElement => screen.getByLabelText(/^Height/) as HTMLInputElement;

/** The names of the buttons under `root`: their words, or their label when they have none (an icon). */
const buttonNames = (root: HTMLElement): (string | null)[] =>
  within(root)
    .getAllByRole("button")
    .map((b) => b.textContent || b.getAttribute("aria-label"));

/** The editor in the rail removes at once: the Remove button. */
function removeFromEditor(name: string): void {
  fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
}

describe("the first visit", () => {
  it("is the page's one h1, and the wordmark is not a heading", () => {
    renderApp();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(H1);
    expect(screen.queryByRole("heading", { name: "Insert Generator" })).toBeNull();
    expect(within(header()).getByText("Insert Generator").localName).toBe("span");
    expect(within(stage()).getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("offers only Open file and the project menu in the header", () => {
    renderApp();
    const banner = screen.getByRole("banner");
    expect(buttonNames(banner)).toEqual(["Open file", "Project menu"]);
    for (const name of ["Undo", "Redo", "Download", "Send file"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  describe("the project menu", () => {
    const openMenu = (): HTMLElement => {
      const button = screen.getByRole("button", { name: /^Project menu/ });
      fireEvent.click(button);
      return button;
    };

    it("opens on the first visit, with Your inserts and Settings in it", () => {
      renderApp();
      openMenu();
      const panel = screen.getByRole("group", { name: "Project" });
      expect(within(panel).getByRole("button", { name: /^Your inserts/ })).toBeTruthy();
      fireEvent.click(within(panel).getByRole("button", { name: "Settings" }));
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    });

    it("blocks New insert, which would only pile up another empty one, and hides Open file…", () => {
      const { store } = renderApp();
      const id = store.state.project.value.id;
      openMenu();
      const item = screen.getByRole("button", { name: "New insert" });
      expect(item.getAttribute("aria-disabled")).toBe("true");
      const reason = document.getElementById(item.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe("This insert is empty");
      fireEvent.click(item);
      expect(store.state.project.value.id).toBe(id);
      // the menu stays open: nothing was chosen
      expect(screen.getByRole("group", { name: "Project" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Open file…" })).toBeNull();
    });

    it("wears the dot, and says how many notices wait, when the menu has a note", () => {
      const { store } = renderApp();
      expect(document.querySelector(".k-iconbtn__dot")).toBeNull();
      act(() => {
        store.state.conflict.value = true;
        store.pushNotice({ level: "warning", code: CONFLICT_CODE, message: "Another tab saved." });
      });
      const button = within(screen.getByRole("banner")).getByRole("button", {
        name: "Project menu, 1 notice",
      });
      expect(button.querySelector(".k-iconbtn__dot")).not.toBeNull();
      openMenu();
      expect(screen.getByRole("button", { name: "Keep this version" })).toBeTruthy();
    });

    it("takes the focus back to its button after Escape", () => {
      renderApp();
      const button = openMenu();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("group", { name: "Project" })).toBeNull();
      expect(document.activeElement).toBe(button);
    });

    it("has the focus on the menu button when New insert, from the workspace, lands here", () => {
      const { store } = renderWorkspace();
      const before = store.state.project.value.id;
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "New insert" }));
      expect(store.state.project.value.id).not.toBe(before);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(H1);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Project menu/ }));
    });
  });

  it("Open file asks for the file chooser the app keeps", () => {
    renderApp();
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Open file" }));
    expect(click).toHaveBeenCalledTimes(1);
    const input = click.mock.instances[0] as unknown as HTMLInputElement;
    expect(input.type).toBe("file");
  });

  it("has two steps, each with its badge, and the kinds, an example and where it is saved", () => {
    renderApp();
    const steps = within(rail()).getAllByRole("heading", { level: 2 });
    expect(steps.map((h) => h.textContent)).toEqual(["Measure the box", "Add what goes inside"]);
    // the badges are steps, not tray numbers (a ruling): 1 is the one being done
    const badges = [...rail().querySelectorAll(".k-step")];
    expect(badges.map((b) => b.textContent)).toEqual(["1", "2"]);
    expect(badges.map((b) => b.hasAttribute("data-active"))).toEqual([true, false]);
    const kinds = within(rail()).getByRole("group", { name: "Add what goes inside" });
    expect(
      within(kinds)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(KINDS);
    expect(screen.getByRole("button", { name: "Start from an example game" })).toBeTruthy();
    expect(screen.getByText("Your inserts are saved in this browser.")).toBeTruthy();
    expect(screen.getByText("Inside the box, at the narrowest point.")).toBeTruthy();
    // the rail's Add pill is not there yet, and the box has its three fields and no more
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(within(rail()).getAllByRole("textbox")).toHaveLength(3);
    expect(screen.queryByLabelText(/^Keep space free on top/)).toBeNull();
    expect(document.querySelectorAll("#box-innerWidth")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/\bbits?\b/i);
  });

  it("draws the empty box with its two size chips and says which side is the front", () => {
    renderApp();
    const box = within(stage());
    expect(box.getByText("Trays appear in the box as you add items.")).toBeTruthy();
    expect(box.getByText("Empty box")).toBeTruthy();
    expect(box.getByText("Width 285 mm")).toBeTruthy();
    expect(box.getByText("Length 285 mm")).toBeTruthy();
    expect(box.getByText("Front of the box")).toBeTruthy();
    // the harness measures it as it measures the workspace's box
    expect(stage().querySelector('[data-region="plan-box"]')?.textContent).toBe("Empty box");
    // the chips follow the fields
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "250" } });
    fireEvent.input(screen.getByLabelText(/^Length/), { target: { value: "190,5" } });
    expect(box.getByText("Width 250 mm")).toBeTruthy();
    expect(box.getByText("Length 190.5 mm")).toBeTruthy();
  });

  it("shows a box error as a card, with no suggested value", () => {
    const { store } = renderApp();
    fireEvent.input(height(), { target: { value: "0" } });
    const card = screen.getByRole("alert");
    expect(card.textContent).toBe("Must be more than 0.");
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    // the field is red and points at the card; the card is under the three fields, in the rail
    expect(height().getAttribute("aria-invalid")).toBe("true");
    expect(height().getAttribute("aria-describedby")).toBe(card.id);
    expect(rail().contains(card)).toBe(true);
    expect(screen.queryByRole("button", { name: /^Use \d+ mm$/ })).toBeNull();
    // nothing wrong was committed
    expect(store.state.project.value.box.innerHeight).toBe(DEFAULT_BOX.innerHeight);
    // putting a good number back takes the card away
    fireEvent.input(height(), { target: { value: "70" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(height().getAttribute("aria-invalid")).toBeNull();
  });

  it("says what the engine says about a box it refuses, in the same card", () => {
    render(
      <ValidationContext.Provider
        value={[
          {
            level: "error",
            code: "field.length",
            path: "/box/innerHeight",
            message: "Box height must be greater than 0.",
          },
        ]}
      >
        <FirstVisit
          box={{ ...DEFAULT_BOX, innerHeight: 0 }}
          phone={false}
          onBoxChange={vi.fn()}
          onPick={vi.fn()}
          onExample={vi.fn()}
          onOpenFile={vi.fn()}
          menu={() => null}
          menuDot={false}
        />
      </ValidationContext.Provider>,
    );
    const card = screen.getByRole("alert");
    expect(card.textContent).toBe("Box height must be greater than 0.");
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    expect(height().getAttribute("aria-describedby")).toBe(card.id);
  });

  it("adding the first item opens its editor", async () => {
    const { stub } = renderApp();
    fireEvent.input(screen.getByLabelText(/^Width/), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    // the editor is open in the rail, over the list, and the box kept what was typed
    const heading = screen.getByRole("heading", { level: 2, name: "Cards" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole("button", { name: "What's inside" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "What's inside" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Start from an example game" })).toBeNull();
    await waitFor(() => expect(stub.calls).toHaveLength(1));
    // back to the list, and the box card shows the size
    fireEvent.click(screen.getByRole("button", { name: "What's inside" }));
    expect(screen.getByTitle("250 × 285 × 70 mm")).toBeTruthy();
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
    expect(screen.queryByRole("heading", { level: 2, name: "Cards" })).toBeNull();
  });

  it("returns to the first visit when the last item goes, with the focus on a kind", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    removeFromEditor("Cards");
    expect(screen.getByRole("button", { name: "Start from an example game" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cards" }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("does not take the focus when it first opens", () => {
    renderApp();
    expect(document.activeElement).toBe(document.body);
  });

  it("makes no plan and shows no status while nothing is added", () => {
    const { stub } = renderApp();
    expect(stub.calls).toHaveLength(0);
    expect(document.querySelector('[data-region="status"]')).toBeNull();
    expect(document.querySelector('[data-region="plan"]')).toBeNull();
  });
});

describe("the first visit on a phone", () => {
  it("is the h1, then the two steps, then the foot; the box hint says how Width runs", () => {
    phone();
    renderApp();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(H1);
    expect(
      screen.getByText(
        "Inside the box, at the narrowest point. Width is left to right, seen from the front.",
      ),
    ).toBeTruthy();
    expect(
      within(rail())
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Measure the box", "Add what goes inside"]);
    expect(screen.getByRole("button", { name: "Start from an example game" })).toBeTruthy();
    expect(screen.getByText("Your inserts are saved in this browser.")).toBeTruthy();
    // MobileStart draws no empty box and no chips; the header is the same one button
    expect(screen.queryByText("Empty box")).toBeNull();
    expect(screen.queryByText("Trays appear in the box as you add items.")).toBeNull();
    expect(screen.queryByText("Front of the box")).toBeNull();
    expect(buttonNames(screen.getByRole("banner"))).toEqual(["Open file", "Project menu"]);
  });

  it("adding the first item opens its editor in the sheet", () => {
    phone();
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Tiles" }));
    expect(screen.getByRole("heading", { level: 1, name: "Tiles" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "The box and what's inside" })).toBeTruthy();
  });

  it("keeps the focus on a kind when the last item goes", () => {
    phone();
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    act(() => undefined);
    removeFromEditor("Cards");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cards" }));
  });
});
