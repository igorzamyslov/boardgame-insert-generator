// src/ui/components/changedOptions.test.tsx
// @vitest-environment jsdom
// Tray settings says what changed: a setting whose value differs from its default has a "Back to
// <default>" link, a setting at its default has none, and each row of Tray settings (Reach, Shape,
// Room, Copies and group) says "N changed" for the settings inside it that have a link.
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newComponent } from "../../model/defaults";
import { DEFAULT_SETTINGS } from "../../model/settings";
import type { Component, ComponentKind, Settings } from "../../model/types";
import { SettingsContext } from "../validation";
import { EditorPanel } from "./EditorPanel";
import {
  SETTINGS_GROUP_TITLES,
  changedIn,
  changedOptions,
  groupSummary,
  optionsChanged,
} from "./moreSummary";
import type { OptionId, SettingsGroupId } from "./moreSummary";
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

const GROUPS = Object.keys(SETTINGS_GROUP_TITLES) as SettingsGroupId[];

/** The changed dots in the editor: on a choice and on a chip. */
const dots = (): number => document.querySelectorAll(".ed-dot, .k-chip__dot").length;
const backs = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(".ed-reset"));
/** What a row of Tray settings says on screen ("Room 1 mm around 2 changed"), or "" when it is not drawn. */
const rowText = (id: SettingsGroupId): string =>
  screen.queryByRole("button", { name: new RegExp(`^${SETTINGS_GROUP_TITLES[id]}`) })
    ?.textContent ?? "";
const changedOf = (id: SettingsGroupId): number =>
  Number(/(\d+) changed/.exec(rowText(id))?.[1] ?? 0);
/** The "n changed" of all the rows, added. */
const counted = (): number => GROUPS.reduce((n, id) => n + changedOf(id), 0);

/** What differs from the default in each kind, and which options that is. */
const SCENARIOS: { name: string; component: Component; changed: OptionId[] }[] = [
  {
    name: "cards, everything under Tray settings changed",
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
    for (const id of GROUPS) {
      expect(changedIn(id, cards, DEFAULT_SETTINGS), id).toBe(0);
    }
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

  it("counts per row what the rows add up to, and an item in a group has no access or copies to count", () => {
    for (const { component, changed } of SCENARIOS) {
      const per = GROUPS.map((id) => changedIn(id, component, DEFAULT_SETTINGS));
      expect(per.reduce((n, k) => n + k, 0)).toBe(changed.length);
      expect(optionsChanged(component, DEFAULT_SETTINGS)).toBe(changed.length);
    }
    const c = of("cards", { access: "often", copies: 3 });
    expect(changedIn("reach", c, DEFAULT_SETTINGS)).toBe(1);
    expect(changedIn("copies", c, DEFAULT_SETTINGS)).toBe(1);
    expect(changedIn("reach", c, DEFAULT_SETTINGS, true)).toBe(0);
    expect(changedIn("copies", c, DEFAULT_SETTINGS, true)).toBe(0);
  });

  it("puts each option under the row that holds it", () => {
    const cards = of("cards", {
      access: "often",
      storage: "flat",
      room: 20,
      fingerCuts: false,
      cornerReliefs: true,
      separators: 2,
      thickness: { mode: "preset", scale: 1.1 },
      copies: 4,
      clearance: 3,
    });
    // Shape: storage, finger cuts, corner holes, spacer plates
    expect(changedIn("shape", cards, DEFAULT_SETTINGS)).toBe(4);
    // Room: room for more, thickness, room around
    expect(changedIn("room", cards, DEFAULT_SETTINGS)).toBe(3);
    expect(changedIn("reach", cards, DEFAULT_SETTINGS)).toBe(1);
    expect(changedIn("copies", cards, DEFAULT_SETTINGS)).toBe(1);
    // packing is Room's, curved floor Shape's
    const bulk = of("bulk", { packing: 0.8, curvedFloor: false });
    expect(changedIn("room", bulk, DEFAULT_SETTINGS)).toBe(1);
    expect(changedIn("shape", bulk, DEFAULT_SETTINGS)).toBe(1);
  });
});

describe("groupSummary: what a row of Tray settings holds, in its line", () => {
  const s = DEFAULT_SETTINGS;
  const kit = { name: "Player kit", copies: 4 };

  it("Reach names how often", () => {
    expect(groupSummary("reach", of("cards", { access: "often" }), s)).toBe("Often");
    expect(groupSummary("reach", of("cards"), s)).toBe("Sometimes");
    expect(groupSummary("reach", of("cards", { access: "setup" }), s)).toBe("Only at setup");
  });

  it("Shape lists the shape in words, cards ending with how they stand", () => {
    expect(groupSummary("shape", of("cards"), s)).toBe("Finger cuts, stands either way");
    expect(groupSummary("shape", of("cards", { storage: "flat" }), s)).toBe(
      "Finger cuts, lies flat",
    );
    expect(groupSummary("shape", of("cards", { storage: "upright-long" }), s)).toBe(
      "Finger cuts, stands upright",
    );
    expect(groupSummary("shape", of("cards", { fingerCuts: false, storage: "flat" }), s)).toBe(
      "Lies flat",
    );
    expect(groupSummary("shape", of("bulk", { fingerCuts: false, curvedFloor: false }), s)).toBe(
      "Plain tray",
    );
    expect(groupSummary("shape", of("bulk", { fingerCuts: true }), s)).toContain("Finger cuts");
    expect(groupSummary("shape", of("bulk", { cornerReliefs: true }), s)).toContain("corner holes");
  });

  it("Shape counts the dividers only where the well may grow", () => {
    expect(groupSummary("shape", of("cards", { room: 20, dividers: 1 }), s)).toContain("1 divider");
    expect(groupSummary("shape", of("cards", { room: 20, dividers: 3 }), s)).toContain(
      "3 dividers",
    );
    expect(groupSummary("shape", of("cards", { dividers: 3 }), s)).not.toContain("divider");
  });

  it("Room says the room for more, then the room around", () => {
    expect(groupSummary("room", of("cards"), s)).toBe("1.5 mm around");
    expect(groupSummary("room", of("cards", { room: 20 }), s)).toBe(
      "20 more cards · 1.5 mm around",
    );
    expect(groupSummary("room", of("cards", { room: "max" }), s)).toMatch(
      /, as much as fits · 1\.5 mm around$/,
    );
    expect(groupSummary("room", of("bulk", { room: 20 }), s)).toBe("20% more pieces · 1 mm around");
    expect(groupSummary("room", of("bulk", { clearance: 2.5 }), s)).toBe("2.5 mm around");
    expect(groupSummary("room", of("bulk"), { ...s, fit: 2 })).toBe("2 mm around");
  });

  it("Copies says the copies and where the item is, the group's copies for a member", () => {
    expect(groupSummary("copies", of("cards"), s)).toBe("1 copy · no group");
    expect(groupSummary("copies", of("cards", { copies: 3 }), s)).toBe("3 copies · no group");
    expect(groupSummary("copies", of("cards", { copies: 3 }), s, kit)).toBe(
      "4 copies · in Player kit",
    );
    expect(groupSummary("copies", of("cards"), s, { name: "Solo", copies: 1 })).toBe(
      "1 copy · in Solo",
    );
  });
});

describe("Tray settings: the way back, and what a row says changed", () => {
  it.each(["cards", "bulk", "tiles", "minis", "custom"] as const)(
    "%s at its defaults has no dot, no Back link and no count",
    (kind) => {
      panel(newComponent(kind));
      expect(dots()).toBe(0);
      expect(backs()).toHaveLength(0);
      expect(counted()).toBe(0);
      for (const id of GROUPS) {
        expect(rowText(id)).not.toContain("changed");
      }
    },
  );

  it.each(SCENARIOS)("$name: a Back link for each changed option, counted by its row", (s) => {
    panel(s.component);
    expect(backs()).toHaveLength(s.changed.length);
    expect(counted()).toBe(s.changed.length);
    for (const id of GROUPS) {
      expect(changedOf(id), id).toBe(changedIn(id, s.component, DEFAULT_SETTINGS));
    }
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

  it("marks a row with 'n changed' and nothing on the others", () => {
    panel(of("cards", { copies: 4 }));
    expect(rowText("copies")).toContain("1 changed");
    expect(rowText("copies")).toContain("4 copies");
    for (const id of ["reach", "shape", "room"] as const) {
      expect(rowText(id), id).not.toContain("changed");
    }
  });

  it("marks the Choice of a changed value with a named dot", () => {
    panel(of("cards", { access: "often" }));
    expect(
      screen
        .getByRole("group", { name: "How often you reach for it" })
        .parentElement?.querySelector('.ed-dot[aria-label="Changed"]'),
    ).not.toBeNull();
  });

  it("leaves the dividers to their row: the chip and the row are one change", () => {
    panel(of("cards", { room: 20, dividers: 1 }));
    // the room and the dividers: two rows, two changes
    expect(counted()).toBe(2);
    expect(screen.getByRole("button", { name: "Removable dividers" })).toBeTruthy();
    expect(backs().map((b) => b.textContent)).toEqual(["Back to 0", "Back to None"]);
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
  const rowOf = () => screen.getByRole("button", { name: /^Room/ });

  it("shows the insert's number in the row and the box while the item has none of its own", () => {
    panel(of("bulk"));
    expect(rowOf().textContent).toContain("1 mm around");
    expect((screen.getByLabelText(/^Room around the pieces/) as HTMLInputElement).value).toBe("1");
    expect(rowOf().textContent).not.toContain("changed");
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
    expect(rowOf().textContent).toContain("1 changed");
    expect(
      screen.getByText("This item's own, whatever Fit says. The insert's is 1 mm."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to 1 for Room around the pieces" }));
    expect("clearance" in (onChange.mock.calls[0]?.[0] as object)).toBe(false);
  });
});
