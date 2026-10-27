// src/ui/components/EditorPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import type { CardsComponent, Component, ComponentKind } from "../../model/types";
import { EditorPanel } from "./EditorPanel";
import { choose, openRows } from "./test-editors";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function panel(c: Component, over: Partial<Parameters<typeof EditorPanel>[0]> = {}) {
  const h = { onChange: vi.fn(), onBack: vi.fn(), onRemove: vi.fn(), onNote: vi.fn() };
  const view = render(<EditorPanel component={c} index={0} kindIndex={0} {...h} {...over} />);
  return { ...h, view };
}

const of = <K extends ComponentKind>(kind: K): Extract<Component, { kind: K }> =>
  ({ ...newComponent(kind), id: "x1" }) as Extract<Component, { kind: K }>;

type Label = string | RegExp;

/** A label as the field is named: a hidden word or a unit may follow the words on screen. */
function named(label: Label): RegExp {
  if (typeof label !== "string") {
    return label;
  }
  return new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: .*)?$`);
}

/** What each kind offers: the basics, and what each row of Tray settings holds once it is open. */
type RowTitle = "Reach" | "Shape" | "Room" | "Copies and group";
const COPIES_ROW: Label[] = ["Copies"];
const OPTIONS: Record<
  ComponentKind,
  { basics: Label[]; rows: Partial<Record<RowTitle, Label[]>>; component: () => Component }
> = {
  cards: {
    basics: ["Name", "Card size", "Sleeves", "Number of cards"],
    rows: {
      Reach: ["How often you reach for it"],
      Shape: [
        "Cards stand",
        "Finger cuts",
        "Corner holes",
        "Spacer plates",
        "Removable dividers",
        "Number of dividers",
      ],
      Room: [
        "Room for more cards",
        /^Correct the estimated thickness/,
        /^Measure a stack of cards/,
        "Room around the pieces",
      ],
      "Copies and group": COPIES_ROW,
    },
    component: () => ({ ...of("cards"), room: 20 }),
  },
  bulk: {
    basics: ["Name", "Piece 1", "How many of piece 1", /^Height mm of piece 1/],
    rows: {
      Reach: ["How often you reach for it"],
      Shape: ["Finger cuts", "Corner holes", "Curved floor"],
      Room: ["Room for more pieces", "Room around the pieces", "How tightly it packs"],
      "Copies and group": COPIES_ROW,
    },
    component: () => of("bulk"),
  },
  tiles: {
    basics: ["Name", "Shape", "Side mm", "Thickness (mm)", "Number of tiles", "Tiles stand"],
    rows: {
      Reach: ["How often you reach for it"],
      Shape: ["Finger cuts", "Corner holes", "Spacer plates", "Removable dividers"],
      Room: ["Room for more tiles", "Room around the pieces"],
      "Copies and group": COPIES_ROW,
    },
    component: () => ({ ...of("tiles"), room: 10 }),
  },
  minis: {
    basics: ["Name", "Name of figure 1", /^Wide/, /^Tall/, "How they're stored"],
    rows: {
      Reach: ["How often you reach for it"],
      Shape: ["Finger cuts", "Corner holes", "Curved floor"],
      Room: ["Room around the pieces"],
      "Copies and group": COPIES_ROW,
    },
    component: () => of("minis"),
  },
  custom: {
    basics: ["Name", /^Width mm/, /^Depth mm/, /^Height mm/, "Number of items"],
    rows: {
      Reach: ["How often you reach for it"],
      Shape: ["Finger cuts", "Corner holes", "Curved floor"],
      Room: ["Room around the pieces"],
      "Copies and group": COPIES_ROW,
    },
    component: () => of("custom"),
  },
};

/** Whether anything the label names is on the page: a field, a group of choices, or a button. */
function find(label: Label): HTMLElement | null {
  const re = named(label);
  const byLabel = screen.queryAllByLabelText(re);
  if (byLabel.length > 0) {
    return byLabel[0] as HTMLElement;
  }
  return screen.queryAllByRole("button", { name: re })[0] ?? null;
}

describe("EditorPanel", () => {
  it("every option of each kind is reachable, under the row of Tray settings that holds it", () => {
    for (const kind of Object.keys(OPTIONS) as ComponentKind[]) {
      const { basics, rows, component } = OPTIONS[kind];
      panel(component());
      for (const label of basics) {
        expect(find(label), `${kind}: ${String(label)} is a basic`).not.toBeNull();
      }
      const section = screen.getByRole("region", { name: "Tray settings" });
      const titles = Object.keys(rows) as RowTitle[];
      // the four rows are drawn, closed, and hold nothing until pressed
      for (const title of titles) {
        const row = screen.getByRole("button", { name: new RegExp(`^${title}`) });
        expect(row.getAttribute("aria-expanded"), `${kind}: ${title}`).toBe("false");
        expect(section.contains(row), `${kind}: ${title} is in Tray settings`).toBe(true);
      }
      for (const title of titles) {
        const row = screen.getByRole("button", { name: new RegExp(`^${title}`) });
        fireEvent.click(row);
        expect(row.getAttribute("aria-expanded"), `${kind}: ${title}`).toBe("true");
        const panelEl = document.getElementById(row.getAttribute("aria-controls") ?? "");
        expect(panelEl, `${kind}: ${title} has a panel`).not.toBeNull();
        for (const label of rows[title] ?? []) {
          const found =
            within(panelEl as HTMLElement).queryAllByLabelText(named(label))[0] ??
            within(panelEl as HTMLElement).queryAllByRole("button", { name: named(label) })[0];
          expect(found ?? null, `${kind}: ${String(label)} is under ${title}`).not.toBeNull();
        }
        // and shuts again, taking its settings with it
        fireEvent.click(row);
        expect(document.getElementById(row.getAttribute("aria-controls") ?? "")).toBeNull();
      }
      cleanup();
    }
  });

  it("draws no Reach row for an item in a group, and the other three rows stay", () => {
    panel(of("cards"));
    expect(screen.getByRole("button", { name: /^Reach/ })).toBeTruthy();
    cleanup();
    panel(of("cards"), {
      grouping: {
        group: { id: "g1", name: "Kit", copies: 2 },
        groups: [],
        onMoveTo: vi.fn(),
        onNewGroup: vi.fn(),
        onTakeOut: vi.fn(),
        onEditGroup: vi.fn(),
        onCopies: vi.fn(),
      },
    });
    expect(screen.queryByRole("button", { name: /^Reach/ })).toBeNull();
    for (const title of ["Shape", "Room", "Copies and group"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${title}`) }), title).toBeTruthy();
    }
  });

  it("names the item in an input styled as its title, after the kind's name", () => {
    panel({ ...of("cards"), name: "Market deck" });
    const input = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(input.value).toBe("Market deck");
    const kind = screen.getByText("Cards");
    // the kind's label comes first, then the name
    expect(kind.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says each kind in the board's words", () => {
    const words: Record<ComponentKind, string> = {
      cards: "Cards",
      bulk: "Tokens and dice",
      tiles: "Tiles",
      minis: "Miniatures",
      custom: "Something else",
    };
    for (const kind of Object.keys(words) as ComponentKind[]) {
      panel({ ...of(kind), name: "Mine" });
      expect(screen.getByText(words[kind]), kind).toBeTruthy();
      cleanup();
    }
  });

  it("offers how often you reach for it as Often, Sometimes and Only at setup", () => {
    const { onChange } = panel({ ...of("cards"), access: "sometimes" });
    openRows();
    const group = screen.getByRole("group", { name: "How often you reach for it" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "Often",
      "Sometimes",
      "Only at setup",
    ]);
    choose("How often you reach for it", "Only at setup");
    expect(onChange).toHaveBeenLastCalledWith({ ...of("cards"), access: "setup" });
  });

  it("does not offer Keep it next to yet", () => {
    panel(of("cards"));
    openRows();
    expect(screen.queryByText(/Keep it next to/)).toBeNull();
  });

  it("renames the component", () => {
    const c = { ...of("cards"), name: "Main deck" };
    const { onChange, onNote } = panel(c);
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Market" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...c, name: "Market" });
    expect(onNote).not.toHaveBeenCalled();
  });

  it("starts with the focus on a heading that names the component", () => {
    panel({ ...of("cards"), name: "Main deck" });
    const heading = screen.getByRole("heading", { name: "Main deck" });
    expect(heading.tagName).toBe("H2");
    expect(document.activeElement).toBe(heading);
  });

  it("leaves for the list from the back link and from Done", () => {
    const { onBack } = panel(of("cards"));
    fireEvent.click(screen.getByRole("button", { name: "What's inside" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("holds the back link and the item's name in a head of their own, apart from the form and the foot", () => {
    const { view } = panel({ ...of("cards"), name: "Starter deck" });
    const head = view.container.querySelector(".ed-head") as HTMLElement;
    expect(head).not.toBeNull();
    expect(head.contains(screen.getByRole("button", { name: "What's inside" }))).toBe(true);
    expect(head.contains(screen.getByRole("textbox", { name: /^Name/ }))).toBe(true);
    // the form and the foot are the panel's other children, outside the head
    expect(head.contains(screen.getByRole("button", { name: "Done" }))).toBe(false);
    expect(head.contains(screen.getByRole("button", { name: "Remove Starter deck" }))).toBe(false);
    expect(head.parentElement?.classList.contains("ed")).toBe(true);
  });

  it("takes its kind's shade", () => {
    const { view } = panel(of("tiles"), { kindIndex: 2 });
    const root = view.container.querySelector(".ed") as HTMLElement;
    expect(root.style.getPropertyValue("--shade-fill")).toMatch(/^light-dark\(#/);
    expect(root.style.getPropertyValue("--shade-ink")).toMatch(/^light-dark\(#/);
  });

  describe("removing", () => {
    it("acts at once: one press calls onRemove, with no question and no Cancel", () => {
      const c = { ...of("cards"), name: "Main deck" };
      const { onRemove } = panel(c);
      fireEvent.click(screen.getByRole("button", { name: "Remove Main deck" }));
      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/from the box\?/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    });

    it("names an unnamed one, and a repeated name by its position", () => {
      const view = panel({ ...of("cards"), name: "" });
      expect(screen.getByRole("button", { name: "Remove (unnamed)" })).toBeTruthy();
      view.view.unmount();
      panel({ ...of("cards"), name: "Dial" }, { index: 2, sameName: true });
      expect(screen.getByRole("button", { name: "Remove Dial (item 3)" })).toBeTruthy();
    });

    it("is quiet at the foot: Remove with no more words, and Done beside it", () => {
      panel({ ...of("cards"), name: "Main deck" });
      expect(screen.getByRole("button", { name: "Remove Main deck" }).textContent).toBe("Remove");
    });
  });

  describe("telling the stage what an option change did", () => {
    const grown = (): CardsComponent => of("cards");

    it("says what room to grow does, once, to the owner of the stage's slot", () => {
      const { onChange, onNote } = panel(grown());
      openRows();
      choose("Room for more cards", "Some");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onNote).toHaveBeenCalledTimes(1);
      expect(onNote).toHaveBeenCalledWith("Leaves room to grow. The deck stands in a wider well.");
    });

    it("explains the spacer when the number goes from 0 to 1", () => {
      const { onNote } = panel({ ...of("cards"), room: 20 });
      openRows();
      fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "1" } });
      expect(onNote).toHaveBeenCalledWith("A removable spacer fills the gap.");
    });

    it("says nothing for a name or a count", () => {
      const { onNote } = panel(of("cards"));
      fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Other" } });
      fireEvent.input(screen.getByLabelText("Number of cards"), { target: { value: "12" } });
      expect(onNote).not.toHaveBeenCalled();
    });

    it("says what the sleeves are, when they are chosen", () => {
      const { onNote } = panel({ ...of("cards"), sleeve: "standard" });
      choose("Sleeves", "Premium");
      expect(onNote).toHaveBeenCalledWith(
        "Premium sleeves. The tray leaves room for thicker ones.",
      );
    });
  });

  describe("on a phone", () => {
    it("is MobileEdit's sheet: Back, the name as the h1, Done, then the basics", () => {
      const { onBack } = panel({ ...of("minis"), name: "Heroes" }, { phone: true });
      const h1 = screen.getByRole("heading", { level: 1, name: "Heroes" });
      expect(document.activeElement).toBe(h1);
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onBack).toHaveBeenCalledTimes(2);
      // no back link of the rail's, and no tile with the kind's name
      expect(screen.queryByRole("button", { name: "What's inside" })).toBeNull();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("keeps the name editable, and Remove <name> at the end", () => {
      const c = { ...of("minis"), name: "Heroes" };
      const { onChange, onRemove } = panel(c, { phone: true });
      fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Villains" } });
      expect(onChange).toHaveBeenLastCalledWith({ ...c, name: "Villains" });
      const remove = screen.getByRole("button", { name: "Remove Heroes" });
      expect(remove.textContent).toBe("Remove Heroes");
      fireEvent.click(remove);
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it("draws the strip it is given under the header", () => {
      panel(of("minis"), { phone: true, strip: <div data-testid="strip">small tray</div> });
      expect(screen.getByTestId("strip")).toBeTruthy();
    });
  });
});
