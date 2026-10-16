// src/ui/components/EditorPanel.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newComponent, withGrowth } from "../../model/defaults";
import type { CardsComponent, Component, ComponentKind } from "../../model/types";
import { EditorPanel } from "./EditorPanel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function panel(c: Component, over: Partial<Parameters<typeof EditorPanel>[0]> = {}) {
  const h = { onChange: vi.fn(), onBack: vi.fn(), onRemove: vi.fn() };
  const view = render(<EditorPanel component={c} index={0} kindIndex={0} {...h} {...over} />);
  return { ...h, view };
}

const of = <K extends ComponentKind>(kind: K): Extract<Component, { kind: K }> =>
  ({ ...newComponent(kind), id: "x1" }) as Extract<Component, { kind: K }>;

type Label = string | RegExp;

/** A label as the field is named: a number field's unit follows its label, " (mm)". */
function named(label: Label): RegExp {
  if (typeof label !== "string") {
    return label;
  }
  return new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: \\([^)]*\\))?$`);
}

/** What each kind offers: the basics, and what sits under More options. */
const COMMON: Label[] = [
  "How often you reach for it",
  /^Counts are per player/,
  /^Group/,
  "Use its own extra room",
  "Finger cuts",
  "Corner holes",
];
const OPTIONS: Record<
  ComponentKind,
  { basics: Label[]; more: Label[]; component: () => Component }
> = {
  cards: {
    basics: ["Name", "Card size", "Name of deck 1", "Cards in deck 1"],
    more: [
      ...COMMON,
      "Sleeves",
      /^Correct the estimated thickness/,
      /^Measure a stack of cards/,
      "Storage",
      "Room for expansions",
      "Spacer plates",
      "Removable dividers",
    ],
    component: () => of("cards"),
  },
  bulk: {
    basics: ["Name", "Name of item 1", "How to size item 1", "How many of item 1"],
    more: [...COMMON, "Curved floor", "Extra width", "Extra length", "Extra height"],
    component: () => of("bulk"),
  },
  tiles: {
    basics: [
      "Name",
      "Tile shape",
      "Tile width",
      "Tile length",
      "Tile thickness",
      "Number of tiles",
    ],
    more: [...COMMON, "Storage", "Room for expansions", "Spacer plates", "Removable dividers"],
    component: () => of("tiles"),
  },
  minis: {
    basics: ["Name", "Name of figure 1", /^Figure 1 width/, /^Figure 1 height/],
    more: [...COMMON, "Storage", "Curved floor", "Looser pockets: width", "Looser pockets: length"],
    component: () => of("minis"),
  },
  custom: {
    basics: ["Name", "Width", "Length", "Height", "How many"],
    more: [...COMMON, "Curved floor", "Extra width", "Extra length", "Extra height"],
    component: () => of("custom"),
  },
};

describe("EditorPanel", () => {
  it("every option of each kind is reachable", () => {
    for (const kind of Object.keys(OPTIONS) as ComponentKind[]) {
      const { basics, more, component } = OPTIONS[kind];
      const { view } = panel(component());
      const disc = view.container.querySelector("details.pf-disc") as HTMLDetailsElement;
      expect(disc.querySelector("summary")?.textContent, kind).toBe("More options");
      for (const label of basics) {
        const field = screen.getByLabelText(named(label));
        expect(disc.contains(field), `${kind}: ${String(label)} is a basic`).toBe(false);
      }
      for (const label of more) {
        const field = screen.getByLabelText(named(label));
        expect(disc.contains(field), `${kind}: ${String(label)} is under More options`).toBe(true);
      }
      cleanup();
    }
  });

  it("offers how often you reach for it as Often, Sometimes and Only at setup", () => {
    const { onChange } = panel({ ...of("cards"), access: "sometimes" });
    const select = screen.getByLabelText("How often you reach for it") as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(["Often", "Sometimes", "Only at setup"]);
    fireEvent.change(select, { target: { value: "setup" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...of("cards"), access: "setup" });
  });

  it("does not offer Keep it next to yet", () => {
    panel(of("cards"));
    expect(screen.queryByLabelText(/Keep it next to/)).toBeNull();
  });

  it("renames the component", () => {
    const c = { ...of("cards"), name: "Main deck" };
    const { onChange } = panel(c);
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Market" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...c, name: "Market" });
  });

  it("starts with the focus on the component's name as a heading", () => {
    panel({ ...of("cards"), name: "Main deck" });
    const heading = screen.getByRole("heading", { name: "Main deck" });
    expect(document.activeElement).toBe(heading);
  });

  it("leaves for the list from the back link and from Done", () => {
    const { onBack } = panel(of("cards"));
    fireEvent.click(screen.getByRole("button", { name: "What's inside" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("takes its kind's shade", () => {
    const { view } = panel(of("tiles"), { kindIndex: 2 });
    const root = view.container.querySelector(".editor-panel") as HTMLElement;
    expect(root.style.getPropertyValue("--shade-fill")).toMatch(/^light-dark\(#/);
    expect(root.style.getPropertyValue("--shade-ink")).toMatch(/^light-dark\(#/);
  });

  describe("removing", () => {
    it("asks first, in place, and removes only on the answer", () => {
      const c = { ...of("cards"), name: "Main deck" };
      const { onRemove } = panel(c);
      fireEvent.click(screen.getByRole("button", { name: "Remove Main deck…" }));
      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.getByText("Remove “Main deck” from the box?")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Remove Main deck" }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it("keeps the component when asked to keep it", () => {
      const { onRemove } = panel({ ...of("cards"), name: "Main deck" });
      fireEvent.click(screen.getByRole("button", { name: "Remove Main deck…" }));
      fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Remove Main deck…" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Keep it" })).toBeNull();
    });

    it("names an unnamed one, and a repeated name by its position", () => {
      const view = panel({ ...of("cards"), name: "" });
      expect(screen.getByRole("button", { name: "Remove (unnamed)…" })).toBeTruthy();
      view.view.unmount();
      panel({ ...of("cards"), name: "Dial" }, { index: 2, sameName: true });
      expect(screen.getByRole("button", { name: "Remove Dial (item 3)…" })).toBeTruthy();
    });
  });

  describe("notes about a change", () => {
    beforeEach(() => vi.useFakeTimers());

    const grown = (): CardsComponent => withGrowth(of("cards"), "stack", "off");

    it("says what room to grow does, in a status that goes after about four seconds", () => {
      const { onChange } = panel(grown());
      expect(screen.getByRole("status").textContent).toBe("");
      fireEvent.change(screen.getByLabelText("Room for expansions"), { target: { value: "auto" } });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status").textContent).toBe(
        "Leaves room to grow. The deck stands in a wider well.",
      );
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByRole("status").textContent).toBe("");
    });

    it("explains the spacer when the number goes from 0 to 1", () => {
      panel(of("cards"));
      fireEvent.input(screen.getByLabelText("Spacer plates"), { target: { value: "1" } });
      expect(screen.getByRole("status").textContent).toBe("A removable spacer fills the gap.");
    });

    it("says nothing for a name or a count", () => {
      panel(of("cards"));
      fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Other" } });
      fireEvent.input(screen.getByLabelText("Cards in deck 1"), { target: { value: "12" } });
      expect(screen.getByRole("status").textContent).toBe("");
    });
  });
});
