// src/ui/components/changedOptions.test.tsx
// @vitest-environment jsdom
// More options says what changed: a row whose value differs from its default has the changed dot and
// a "Back to <default>" link, a row at its default has neither, and "N changed" counts the rows with a dot.
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import { DEFAULT_SETTINGS } from "../../model/settings";
import type { Component, ComponentKind, Settings } from "../../model/types";
import { SettingsContext } from "../validation";
import { EditorPanel } from "./EditorPanel";
import { changedOptions, moreSummary, optionsChanged } from "./moreSummary";
import type { OptionId } from "./moreSummary";
import { openRows } from "./test-editors";

afterEach(cleanup);

const of = <K extends ComponentKind>(kind: K, over: Record<string, unknown> = {}) =>
  ({ ...newComponent(kind), id: "x1", ...over }) as Extract<Component, { kind: K }>;

function panel(c: Component, settings: Settings = DEFAULT_SETTINGS) {
  const onChange = vi.fn<(next: Component) => void>();
  render(
    <SettingsContext.Provider value={settings}>
      <EditorPanel
        component={c}
        index={0}
        kindIndex={0}
        onChange={onChange}
        onBack={vi.fn()}
        onRemove={vi.fn()}
      />
    </SettingsContext.Provider>,
  );
  openRows();
  return onChange;
}

/** The changed dots in the editor: on a choice, on a chip and on a row. */
const dots = (): number => document.querySelectorAll(".ed-dot, .k-chip__dot, .k-drow__dot").length;
const backs = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(".ed-reset"));
const summary = (): string =>
  screen.getByRole("button", { name: /^More options/ }).textContent ?? "";
const counted = (): number => Number(/(\d+) changed/.exec(summary())?.[1] ?? 0);

/** What differs from the default in each kind, and which options that is. */
const SCENARIOS: { name: string; component: Component; changed: OptionId[] }[] = [
  {
    name: "cards, everything under More options changed",
    component: of("cards", {
      access: "often",
      storage: "upright-long",
      room: "max",
      fingerCuts: false,
      cornerReliefs: true,
      thickness: { mode: "preset", scale: 1.1 },
      copies: 4,
      clearance: 3,
    }),
    changed: [
      "room",
      "access",
      "storage",
      "fingerCuts",
      "cornerReliefs",
      "thickness",
      "copies",
      "clearance",
    ],
  },
  {
    name: "cards that stand, a measured stack",
    component: of("cards", { thickness: { mode: "measured", cards: 50, stackMm: 20 } }),
    changed: ["thickness"],
  },
  {
    name: "tokens and dice",
    component: of("bulk", {
      access: "setup",
      room: 20,
      curvedFloor: false,
      fingerCuts: true,
      cornerReliefs: true,
      clearance: 0.25,
    }),
    changed: ["room", "access", "curvedFloor", "fingerCuts", "cornerReliefs", "clearance"],
  },
  {
    name: "tiles that lie flat, with some room for more",
    component: of("tiles", { storage: "flat", room: 10 }),
    changed: ["room"],
  },
  {
    name: "miniatures in pockets, looser",
    component: of("minis", { curvedFloor: true }),
    changed: ["curvedFloor"],
  },
  {
    name: "tokens packed tighter than the insert packs them",
    component: of("bulk", { packing: 0.8 }),
    changed: ["packing"],
  },
  {
    name: "tokens whose packing is the insert's own number, however the file wrote it",
    component: of("bulk", { packing: 0.5 }),
    changed: [],
  },
  {
    name: "miniatures loose in a tray, packed snug",
    component: of("minis", { storage: "bulk", packing: 0.65 }),
    changed: ["packing"],
  },
  {
    name: "miniatures in pockets keep a stored packing but show no dot: its row is blocked",
    component: of("minis", { storage: "pockets", packing: 0.65 }),
    changed: [],
  },
  {
    name: "something else with a curved floor on a kind that has none by default",
    component: of("custom", { curvedFloor: true, cornerReliefs: false }),
    changed: ["curvedFloor", "cornerReliefs"],
  },
];

describe("changedOptions", () => {
  it.each(SCENARIOS)("$name", ({ component, changed }) => {
    expect([...changedOptions(component, DEFAULT_SETTINGS)].sort()).toEqual([...changed].sort());
  });

  it("is empty for a new component of every kind", () => {
    for (const kind of ["cards", "bulk", "tiles", "minis", "custom"] as const) {
      expect(changedOptions(newComponent(kind), DEFAULT_SETTINGS).size, kind).toBe(0);
    }
  });

  it("leaves the spacer plates out while dividers take their place, and counts them again without", () => {
    const both = of("cards", { room: 20, dividers: 2, separators: 3 });
    expect([...changedOptions(both, DEFAULT_SETTINGS)]).toEqual(["room", "dividers"]);
    expect([...changedOptions(of("cards", { room: 20, separators: 3 }), DEFAULT_SETTINGS)]).toEqual(
      ["room", "separators"],
    );
  });

  it("has no dividers or spacer plates row on a deck with no room for more, so counts neither", () => {
    expect([
      ...changedOptions(of("cards", { dividers: 2, separators: 3 }), DEFAULT_SETTINGS),
    ]).toEqual([]);
  });

  it("does not count a value that was written equal to its default", () => {
    const cards = of("cards", {
      access: "sometimes",
      storage: "auto",
      fingerCuts: true,
      cornerReliefs: false,
      curvedFloor: false,
      separators: 0,
      dividers: 0,
      thickness: { mode: "preset", scale: 1 },
      clearance: 1.5,
    });
    expect([...changedOptions(cards, DEFAULT_SETTINGS)]).toEqual([]);
    expect(optionsChanged(cards, DEFAULT_SETTINGS)).toBe(0);
    expect(moreSummary(cards, DEFAULT_SETTINGS)).not.toContain("changed");
  });

  it("takes the default of an own extra room from the insert: Fit scales it, and cards have their own", () => {
    const bulk = of("bulk", { clearance: 1 });
    // a piece's clearance is 1 mm at Fit 1: its own 1 mm is no change
    expect(changedOptions(bulk, DEFAULT_SETTINGS).has("clearance")).toBe(false);
    // at Fit 2 the insert gives 2 mm, so 1 mm is the item's own
    expect(changedOptions(bulk, { ...DEFAULT_SETTINGS, fit: 2 }).has("clearance")).toBe(true);
    expect(changedOptions(of("cards", { clearance: 1 }), DEFAULT_SETTINGS).has("clearance")).toBe(
      true,
    );
  });

  it("counts a room for more once, whatever it is set to, and not an item that offers none", () => {
    for (const room of [5, "max"] as const) {
      expect([...changedOptions(of("cards", { room }), DEFAULT_SETTINGS)]).toEqual(["room"]);
    }
    expect([...changedOptions(of("bulk", { room: 50 }), DEFAULT_SETTINGS)]).toEqual(["room"]);
    // minis and custom items have no row: a room a file wrote there is no news
    for (const kind of ["minis", "custom"] as const) {
      expect([...changedOptions(of(kind, { room: 20 } as never), DEFAULT_SETTINGS)]).toEqual([]);
    }
  });

  it("says room to grow in the summary only while a room is set", () => {
    expect(moreSummary(of("cards"), DEFAULT_SETTINGS)).not.toContain("room to grow");
    expect(moreSummary(of("tiles", { room: 10 }), DEFAULT_SETTINGS)).toContain("room to grow");
    expect(moreSummary(of("bulk", { room: "max" }), DEFAULT_SETTINGS)).toContain("room to grow");
  });

  it("counts what the summary says", () => {
    for (const { component, changed } of SCENARIOS) {
      expect(optionsChanged(component, DEFAULT_SETTINGS)).toBe(changed.length);
      expect(moreSummary(component, DEFAULT_SETTINGS)).toMatch(
        changed.length === 0 ? /^[^·]*$/ : new RegExp(`· ${changed.length} changed$`),
      );
    }
  });
});

describe("More options: the dot and the way back", () => {
  it.each(["cards", "bulk", "tiles", "minis", "custom"] as const)(
    "%s at its defaults has no dot, no Back link and no count",
    (kind) => {
      panel(newComponent(kind));
      expect(dots()).toBe(0);
      expect(backs()).toHaveLength(0);
      expect(summary()).not.toContain("changed");
    },
  );

  it.each(SCENARIOS)("$name: a dot and a Back link for each changed row, counted", (s) => {
    panel(s.component);
    expect(dots()).toBe(s.changed.length);
    expect(backs()).toHaveLength(s.changed.length);
    expect(counted()).toBe(s.changed.length);
    // the link says where it goes: Back to <default>
    for (const back of backs()) {
      expect(back.textContent).toMatch(/^Back to .+/);
      expect(back.getAttribute("aria-label")).toMatch(/^Back to .+ for .+/);
    }
  });

  it.each(SCENARIOS)("$name: each Back puts back just its row, in one change", (s) => {
    for (let i = 0; i < s.changed.length; i += 1) {
      const onChange = panel(s.component);
      const back = backs()[i] as HTMLElement;
      fireEvent.click(back);
      // one change is one step of Undo
      expect(onChange, back.textContent ?? "").toHaveBeenCalledTimes(1);
      const next = onChange.mock.calls[0]?.[0] as Component;
      const after = changedOptions(next, DEFAULT_SETTINGS);
      expect(after.size, `${back.getAttribute("aria-label")}`).toBe(s.changed.length - 1);
      cleanup();
    }
  });

  it("names the defaults in the links, and nowhere else", () => {
    panel(
      of("cards", {
        access: "often",
        storage: "flat",
        room: 20,
        fingerCuts: false,
        cornerReliefs: true,
        separators: 2,
        thickness: { mode: "preset", scale: 1.1 },
        copies: 4,
        clearance: 3,
      }),
    );
    expect(backs().map((b) => b.textContent)).toEqual(
      expect.arrayContaining([
        "Back to None",
        "Back to Sometimes",
        "Back to Auto",
        "Back to finger cuts on",
        "Back to corner holes off",
        "Back to 0",
        "Back to the sleeve table",
        "Back to 1",
        "Back to 1.5",
      ]),
    );
    expect(document.body.textContent).not.toMatch(/is the default/);
  });

  it("puts each value back to what the kind has, so the stored file loses the key", () => {
    const onChange = panel(of("bulk", { curvedFloor: false, fingerCuts: true }));
    fireEvent.click(screen.getByRole("button", { name: "Back to curved floor on for Tray shape" }));
    expect("curvedFloor" in (onChange.mock.calls[0]?.[0] as object)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Back to finger cuts off for Tray shape" }));
    expect("fingerCuts" in (onChange.mock.calls[1]?.[0] as object)).toBe(false);
  });

  it("marks the chip, and says so to a reader", () => {
    panel(of("bulk", { fingerCuts: true }));
    const chip = screen.getByRole("button", { name: "Finger cuts, changed" });
    expect(chip.querySelector(".k-chip__dot")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Corner holes" }).querySelector(".k-chip__dot")).toBe(
      null,
    );
  });

  it("marks a row with a named dot", () => {
    panel(of("cards", { copies: 4 }));
    const row = screen.getByRole("button", { name: /^Copies/ });
    expect(row.querySelector('.k-drow__dot[aria-label="Changed"]')).not.toBeNull();
  });

  it("leaves the dividers to their row: the chip and the row are one change", () => {
    panel(of("cards", { room: 20, dividers: 1 }));
    // the room and the dividers: two rows, two changes
    expect(counted()).toBe(2);
    expect(dots()).toBe(2);
    expect(screen.getByRole("button", { name: "Removable dividers" })).toBeTruthy();
    expect(backs().map((b) => b.textContent)).toEqual(["Back to None", "Back to 0"]);
  });

  it("keeps the keyboard on the control after a Back that removes the link", async () => {
    vi.useFakeTimers();
    try {
      const c = of("cards", { access: "often" });
      const onChange = vi.fn<(next: Component) => void>();
      const view = render(
        <EditorPanel
          component={c}
          index={0}
          kindIndex={0}
          onChange={onChange}
          onBack={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
      openRows();
      fireEvent.click(
        screen.getByRole("button", { name: "Back to Sometimes for How often you reach for it" }),
      );
      view.rerender(
        <EditorPanel
          component={onChange.mock.calls[0]?.[0] as Component}
          index={0}
          kindIndex={0}
          onChange={onChange}
          onBack={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
      vi.runAllTimers();
      const group = screen.getByRole("group", { name: "How often you reach for it" });
      expect(group.contains(document.activeElement)).toBe(true);
      expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Room around the pieces: the insert's number, and the item's own", () => {
  const rowOf = () => screen.getByRole("button", { name: /^Room around the pieces/ });

  it("shows the insert's number in the row and the box while the item has none of its own", () => {
    panel(of("bulk"));
    expect(rowOf().textContent).toContain("1 mm");
    expect((screen.getByLabelText(/^Room around the pieces/) as HTMLInputElement).value).toBe("1");
    expect(rowOf().querySelector(".k-drow__dot")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
  });

  it("follows Fit and the kind: a piece's clearance times Fit, a card's own number for cards", () => {
    panel(of("bulk"), { ...DEFAULT_SETTINGS, fit: 2 });
    expect((screen.getByLabelText(/^Room around the pieces/) as HTMLInputElement).value).toBe("2");
    cleanup();
    panel(of("cards"), { ...DEFAULT_SETTINGS, cardClearance: 3 });
    expect((screen.getByLabelText(/^Room around the pieces/) as HTMLInputElement).value).toBe("3");
  });

  it("says whose number it is, and puts the insert's back", () => {
    const onChange = panel(of("bulk", { clearance: 2.5 }));
    expect(rowOf().textContent).toContain("2.5 mm");
    expect(rowOf().querySelector(".k-drow__dot")).not.toBeNull();
    expect(
      screen.getByText("This item's own, whatever Fit says. The insert's is 1 mm."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to 1 for Room around the pieces" }));
    expect("clearance" in (onChange.mock.calls[0]?.[0] as object)).toBe(false);
  });
});
