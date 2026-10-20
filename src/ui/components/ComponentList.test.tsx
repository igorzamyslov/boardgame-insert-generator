// src/ui/components/ComponentList.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTray } from "../../app/test-helpers";
import { newComponent } from "../../model/defaults";
import { hoveredComponent, hoveredMembers } from "../../screens/hover";
import type { Component, ComponentKind, Group, Lock } from "../../model/types";
import { ValidationContext } from "../validation";
import { ComponentList } from "./ComponentList";

afterEach(() => {
  cleanup();
  hoveredComponent.value = null;
  hoveredMembers.value = null;
});

const KINDS: ComponentKind[] = ["cards", "bulk", "tiles", "minis", "custom"];

function handlers() {
  return { onOpen: vi.fn(), onUnpin: vi.fn(), onUnlockSize: vi.fn() };
}

const named = (kind: ComponentKind, id: string, name: string): Component => ({
  ...newComponent(kind),
  id,
  name,
});

const pin = (trayKey: string, rotated = false): Lock => ({
  kind: "position",
  trayKey,
  path: "0",
  rotated,
});

describe("ComponentList", () => {
  it("draws no list while there is nothing inside", () => {
    const { container } = render(<ComponentList components={[]} {...handlers()} />);
    expect(container.querySelector("ul")).toBeNull();
  });

  it("has a row for every kind, in the kind's colour, and opens it on a click", () => {
    const comps = KINDS.map((k, i) => named(k, `id${i}`, `Thing ${i}`));
    const h = handlers();
    const { container } = render(<ComponentList components={comps} {...h} />);
    expect(container.querySelectorAll(".k-rowwrap")).toHaveLength(5);
    expect(
      (container.querySelector(".k-rowwrap") as HTMLElement).style.getPropertyValue("--shade-fill"),
    ).toMatch(/^light-dark\(#/);
    fireEvent.click(screen.getByRole("button", { name: /^Thing 2,/ }));
    expect(h.onOpen).toHaveBeenCalledWith("id2");
  });

  it("gives two components of one kind their own shades", () => {
    const comps = [named("cards", "a", "Main"), named("cards", "b", "Market")];
    const { container } = render(<ComponentList components={comps} {...handlers()} />);
    const fill = (row: Element) => (row as HTMLElement).style.getPropertyValue("--shade-fill");
    const [first, second] = [...container.querySelectorAll(".k-rowwrap")];
    expect(fill(first as Element)).not.toBe(fill(second as Element));
  });

  it("shows the name, what is in it and a stand-in for an empty name", () => {
    const c = { ...named("cards", "a", "Main deck") };
    const blank = named("custom", "b", "");
    render(<ComponentList components={[c, blank]} {...handlers()} />);
    const row = screen.getByRole("button", { name: /^Main deck,/ });
    expect(within(row).getByText(/^50 cards/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^\(unnamed\),/ })).toBeTruthy();
  });

  it("says Needs attention on the row of a component with an error", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    render(
      <ValidationContext.Provider
        value={[{ level: "error", code: "x", message: "Bad", path: "/components/1/items/0/w" }]}
      >
        <ComponentList components={comps} {...handlers()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("button", { name: /^Gems,\s*Needs attention/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Main,\s*50 cards/ })).toBeTruthy();
  });

  it("keeps a 40-character name on one line, with the whole name in its title", () => {
    const long = "The Very Long Name Of A Card Deck Here 40";
    expect(long).toHaveLength(41);
    render(<ComponentList components={[named("cards", "a", long)]} {...handlers()} />);
    const text = screen.getByText(long);
    expect(text.classList.contains("ellipsis")).toBe(true);
    expect(text.getAttribute("title")).toBe(long);
  });

  it("presses the row of the selected component, and no other", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    render(<ComponentList components={comps} selectedIds={["b"]} {...handlers()} />);
    expect(screen.getByRole("button", { name: /^Gems,/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: /^Main,/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("tells what the pointer or the focus is on, and when it leaves", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    const onHover = vi.fn();
    render(<ComponentList components={comps} onHover={onHover} {...handlers()} />);
    const gems = screen.getByRole("button", { name: /^Gems,/ });
    fireEvent.mouseEnter(gems);
    expect(onHover).toHaveBeenLastCalledWith("b");
    fireEvent.mouseLeave(gems);
    expect(onHover).toHaveBeenLastCalledWith(null);
    fireEvent.focus(screen.getByRole("button", { name: /^Main,/ }));
    expect(onHover).toHaveBeenLastCalledWith("a");
    fireEvent.blur(screen.getByRole("button", { name: /^Main,/ }));
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("lights the row of the component the plan is pointing at", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    render(<ComponentList components={comps} {...handlers()} />);
    const lit = (name: RegExp): string | null =>
      screen.getByRole("button", { name }).getAttribute("data-lit");
    expect(lit(/^Gems,/)).toBeNull();
    act(() => {
      hoveredComponent.value = "b";
    });
    expect(lit(/^Gems,/)).toBe("true");
    expect(lit(/^Main,/)).toBeNull();
    // lit is not pressed: only a selected component's row is
    expect(screen.getByRole("button", { name: /^Gems,/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    act(() => {
      hoveredComponent.value = null;
    });
    expect(lit(/^Gems,/)).toBeNull();
  });

  it("lights nothing once the list goes, as when an editor opens in its place", () => {
    const comps = [named("cards", "a", "Main")];
    const onHover = vi.fn();
    const view = render(<ComponentList components={comps} onHover={onHover} {...handlers()} />);
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^Main,/ }));
    expect(onHover).toHaveBeenLastCalledWith("a");
    act(() => {
      view.unmount();
    });
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  it("names the layer of a component's first tray when it has trays on two", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    const trays = [
      makeTray({ key: "a:p0:0", level: 1, compartments: [{ ...well("a") }] }),
      makeTray({ key: "a:p1:0", level: 0, compartments: [{ ...well("a") }] }),
      makeTray({ key: "b:p0:0", level: 0, compartments: [{ ...well("b") }] }),
    ];
    render(<ComponentList components={comps} trays={trays} {...handlers()} />);
    expect(screen.getByRole("button", { name: /^Main,.*top layer$/ })).toBeTruthy();
  });

  describe("on the phone's sheet", () => {
    it("lists a compact row a component, after the row it is given first", () => {
      const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
      const { container } = render(
        <ComponentList
          compact
          components={comps}
          first={
            <li>
              <button type="button">The box</button>
            </li>
          }
          {...handlers()}
        />,
      );
      const rows = within(screen.getByRole("list", { name: "What's inside" })).getAllByRole(
        "listitem",
      );
      expect(rows[0]?.textContent).toBe("The box");
      expect(container.querySelectorAll(".k-row--compact")).toHaveLength(2);
      // the sheet's rows are links into editors, not toggles
      expect(screen.getByRole("button", { name: /^Main,/ }).hasAttribute("aria-pressed")).toBe(
        false,
      );
    });

    it("leaves the layer to the box: the row says what is in it", () => {
      const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
      const trays = [
        makeTray({ key: "a:p0:0", level: 0, compartments: [{ ...well("a") }] }),
        makeTray({ key: "b:p0:0", level: 1, compartments: [{ ...well("b") }] }),
      ];
      render(<ComponentList compact components={comps} trays={trays} {...handlers()} />);
      expect(screen.queryByText(/layer/)).toBeNull();
    });
  });

  it("names the layer of each row once the plan has more than one", () => {
    const comps = [named("cards", "a", "Main"), named("bulk", "b", "Gems")];
    const trays = [
      makeTray({ key: "a:p0:0", level: 0, compartments: [{ ...well("a") }] }),
      makeTray({ key: "b:p0:0", level: 1, compartments: [{ ...well("b") }] }),
    ];
    render(<ComponentList components={comps} trays={trays} {...handlers()} />);
    expect(screen.getByRole("button", { name: /^Main,.*bottom layer$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Gems,.*top layer$/ })).toBeTruthy();
  });

  it("names no layer without a plan, or with a single layer", () => {
    const comps = [named("cards", "a", "Main")];
    const trays = [makeTray({ key: "a:p0:0", compartments: [{ ...well("a") }] })];
    const view = render(<ComponentList components={comps} trays={trays} {...handlers()} />);
    expect(screen.queryByText(/layer$/)).toBeNull();
    view.rerender(<ComponentList components={comps} {...handlers()} />);
    expect(screen.queryByText(/layer$/)).toBeNull();
  });

  describe("chips", () => {
    const comps = [named("cards", "a", "Main deck"), named("bulk", "b", "Gems")];

    it("shows Pinned, Pinned, turned and Size locked on the component they belong to", () => {
      const locks: Lock[] = [
        pin("a:p0:0"),
        pin("b:p0:0", true),
        { kind: "size", trayKey: "a:p0:0", w: 1, d: 1, h: 1 },
      ];
      render(<ComponentList components={comps} locks={locks} {...handlers()} />);
      const main = screen.getByRole("listitem", { name: "Main deck" });
      expect(within(main).getByText("Pinned")).toBeTruthy();
      expect(within(main).getByText("Size locked")).toBeTruthy();
      const gems = screen.getByRole("listitem", { name: "Gems" });
      expect(within(gems).getByText("Pinned, turned")).toBeTruthy();
      expect(within(gems).queryByText("Size locked")).toBeNull();
    });

    it("shows one chip for a component whose trays are all pinned", () => {
      const locks: Lock[] = [pin("a:p0:0"), pin("a:p1:0")];
      render(<ComponentList components={comps} locks={locks} {...handlers()} />);
      expect(screen.getAllByText("Pinned")).toHaveLength(1);
    });

    it("removing a Pinned chip unpins the stack", () => {
      const locks: Lock[] = [pin("a:p0:0"), pin("a:p1:0"), pin("b:p0:0")];
      const h = handlers();
      render(<ComponentList components={comps} locks={locks} {...h} />);
      fireEvent.click(screen.getByRole("button", { name: "Unpin Main deck" }));
      expect(h.onUnpin).toHaveBeenCalledWith(["a:p0:0", "a:p1:0"]);
      expect(h.onUnlockSize).not.toHaveBeenCalled();
      expect(h.onOpen).not.toHaveBeenCalled();
    });

    it("says a stack goes with its pin, when the stack has several trays", () => {
      const locks: Lock[] = [
        pin("a:p0:0"),
        pin("b:p0:0"),
        { kind: "stack", trayKeys: ["a:p0:0", "b:p0:0"] },
      ];
      render(<ComponentList components={comps} locks={locks} {...handlers()} />);
      expect(screen.getByRole("button", { name: "Unpin Main deck and its stack" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Unpin Gems and its stack" })).toBeTruthy();
    });

    it("keeps a lone pin's button plainly Unpin", () => {
      render(<ComponentList components={comps} locks={[pin("a:p0:0")]} {...handlers()} />);
      expect(screen.getByRole("button", { name: "Unpin Main deck" })).toBeTruthy();
    });

    it("moves the focus to the next chip of the row when a chip goes, else to the row", () => {
      const locks: Lock[] = [pin("a:p0:0"), { kind: "size", trayKey: "a:p0:0", w: 1, d: 1, h: 1 }];
      const h = handlers();
      const view = render(<ComponentList components={comps} locks={locks} {...h} />);
      const unpin = screen.getByRole("button", { name: "Unpin Main deck" });
      unpin.focus();
      fireEvent.click(unpin);
      view.rerender(<ComponentList components={comps} locks={[locks[1] as Lock]} {...h} />);
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Unlock size of Main deck" }),
      );
      fireEvent.click(document.activeElement as HTMLElement);
      view.rerender(<ComponentList components={comps} locks={[]} {...h} />);
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Main deck,/ }));
    });

    it("forgets a pressed × when its chip stays, so a later change does not steal the focus", () => {
      const locks: Lock[] = [pin("a:p0:0")];
      const h = handlers();
      const view = render(<ComponentList components={comps} locks={locks} {...h} />);
      fireEvent.click(screen.getByRole("button", { name: "Unpin Main deck" }));
      // The click changed nothing here (a blocked change, say): the list renders, chip still there.
      view.rerender(<ComponentList components={comps} locks={[pin("a:p0:0")]} {...h} />);
      (document.activeElement as HTMLElement).blur();
      // Later the pin goes for another reason (another tab, an undo): the focus is not moved.
      view.rerender(<ComponentList components={comps} locks={[]} {...h} />);
      expect(document.activeElement).toBe(document.body);
    });

    it("removing a Size locked chip lifts the size lock", () => {
      const locks: Lock[] = [{ kind: "size", trayKey: "b:p0:0", w: 1, d: 1, h: 1 }];
      const h = handlers();
      render(<ComponentList components={comps} locks={locks} {...h} />);
      fireEvent.click(screen.getByRole("button", { name: "Unlock size of Gems" }));
      expect(h.onUnlockSize).toHaveBeenCalledWith(["b:p0:0"]);
    });

    it("follows a group's key: the group's card shows the pin once, on its header", () => {
      const a = named("bulk", "a", "Cubes");
      const b = named("bulk", "b", "Dice");
      const tokens: Group = {
        id: "tokens",
        name: "Tokens",
        access: "sometimes",
        memberIds: ["a", "b"],
      };
      render(
        <ComponentList
          components={[a, b]}
          groups={[tokens]}
          locks={[pin("tokens:p0:0")]}
          {...handlers()}
        />,
      );
      // one chip for the group's tray, not one for each member
      expect(screen.getAllByText("Pinned")).toHaveLength(1);
      expect(screen.getByRole("list", { name: "Rules for Tokens" })).toBeTruthy();
    });
  });
});

describe("ComponentList, a row that does not fit", () => {
  const comps = [named("cards", "a", "Market deck"), named("minis", "b", "Heroes")];

  it("is lit in the warn style and says it in the meta, in place of what it holds", () => {
    render(<ComponentList components={comps} culprits={new Set(["b"])} {...handlers()} />);
    const row = screen.getByRole("button", { name: /^Heroes, / });
    expect(row.classList.contains("is-culprit")).toBe(true);
    expect(row.getAttribute("aria-label")).toBe("Heroes, Doesn't fit");
    expect(row.querySelector(".k-row__meta")?.textContent).toBe("Doesn't fit");
    const other = screen.getByRole("button", { name: /^Market deck, / });
    expect(other.classList.contains("is-culprit")).toBe(false);
    expect(other.querySelector(".k-row__meta")?.textContent).not.toBe("Doesn't fit");
  });

  it("keeps its rule chips", () => {
    render(
      <ComponentList
        components={comps}
        culprits={new Set(["a"])}
        locks={[pin("a:p0:0")]}
        {...handlers()}
      />,
    );
    expect(screen.getByRole("button", { name: "Unpin Market deck" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Market deck, / }).classList).toContain(
      "is-culprit",
    );
  });

  it("says Needs attention before it says Doesn't fit: an error in the editor comes first", () => {
    const notices = [
      { level: "error" as const, code: "x", message: "m", path: "/components/1/figures/0/h" },
    ];
    render(
      <ValidationContext.Provider value={notices}>
        <ComponentList components={comps} culprits={new Set(["b"])} {...handlers()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "Heroes, Needs attention" })).toBeTruthy();
  });

  it("says it in the phone sheet's compact row too", () => {
    render(<ComponentList compact components={comps} culprits={new Set(["b"])} {...handlers()} />);
    const row = screen.getByRole("button", { name: "Heroes, Doesn't fit" });
    expect(row.classList.contains("is-culprit")).toBe(true);
  });
});

describe("ComponentList, groups", () => {
  const items = [
    named("cards", "m", "Market deck"),
    named("cards", "s", "Starter deck"),
    named("bulk", "r", "Resources"),
    named("minis", "h", "Hero"),
    named("tiles", "t", "Hex tiles"),
  ];
  const kit: Group = {
    id: "g",
    name: "Player kit",
    copies: 4,
    access: "often",
    memberIds: ["s", "r", "h"],
  };
  const empty: Group = { id: "e", name: "Group", access: "sometimes", memberIds: [] };
  const trayOf = (key: string, level = 0) =>
    makeTray({
      key,
      level,
      compartments: [well("s"), well("r"), well("h")],
    });
  const kitTrays = (level = 0) =>
    ["g:p0:0", "g:p1:0", "g:p2:0", "g:p3:0"].map((key) => trayOf(key, level));
  const marketTray = makeTray({ key: "m:p0:0", compartments: [well("m")] });

  it("stands the card where its first member stands, members inside it, other rows as they were", () => {
    render(<ComponentList components={items} groups={[kit]} {...handlers()} />);
    const top = [...(document.querySelector(".rail-list")?.children ?? [])].map(
      (li) =>
        li.querySelector("[role=group]")?.getAttribute("aria-label") ??
        li.getAttribute("aria-label"),
    );
    expect(top).toEqual(["Market deck", "Player kit, 4 copies", "Hex tiles"]);
    const card = screen.getByRole("group", { name: "Player kit, 4 copies" });
    expect(
      within(card)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual(["Starter deck", "Resources", "Hero"]);
  });

  it("puts an empty group last, as 'Group, empty'", () => {
    render(<ComponentList components={items} groups={[empty, kit]} {...handlers()} />);
    const top = [...(document.querySelector(".rail-list")?.children ?? [])];
    expect(top.at(-1)?.querySelector("[role=group]")?.getAttribute("aria-label")).toBe(
      "Group, empty",
    );
    // the list has something to draw even when every item is out of the list
    cleanup();
    render(<ComponentList components={[]} groups={[empty]} {...handlers()} />);
    expect(screen.getByRole("group", { name: "Group, empty" })).toBeTruthy();
  });

  it("counts the group's trays and names its layer on the header only", () => {
    render(
      <ComponentList
        components={items}
        groups={[kit]}
        trays={[marketTray, ...kitTrays(1)]}
        {...handlers()}
      />,
    );
    const head = screen.getByRole("button", { name: "Player kit, 4 copies" });
    expect(head.textContent).toContain("3 items · 4 trays · top layer");
    // a member's own line has no layer
    expect(screen.getByRole("button", { name: /^Hero,/ }).textContent).not.toContain("layer");
  });

  it("opens the item's editor from a member and the group's from the header", () => {
    const onOpen = vi.fn();
    const onEditGroup = vi.fn();
    render(
      <ComponentList components={items} groups={[kit]} onOpen={onOpen} onEditGroup={onEditGroup} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Hero,/ }));
    expect(onOpen).toHaveBeenCalledWith("h");
    fireEvent.click(screen.getByRole("button", { name: "Player kit, 4 copies" }));
    expect(onEditGroup).toHaveBeenCalledWith("g");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("presses the header when a tray of the group is selected, not the members", () => {
    render(
      <ComponentList
        components={items}
        groups={[kit]}
        selectedIds={["s", "r", "h"]}
        {...handlers()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Player kit, 4 copies" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: /^Hero,/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: /^Market deck,/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("says Doesn't fit on the header when the culprit is in the group", () => {
    render(
      <ComponentList components={items} groups={[kit]} culprits={new Set(["s"])} {...handlers()} />,
    );
    expect(screen.getByRole("button", { name: "Player kit, 4 copies" }).textContent).toContain(
      "Doesn't fit",
    );
    expect(screen.getByRole("button", { name: /^Starter deck, 50 cards/ })).toBeTruthy();
  });

  it("tells every member's id when the header or a member is pointed at", () => {
    const onLight = vi.fn();
    const onHover = vi.fn();
    render(
      <ComponentList
        components={items}
        groups={[kit]}
        onLight={onLight}
        onHover={onHover}
        {...handlers()}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^Resources,/ }));
    expect(onLight).toHaveBeenLastCalledWith(["s", "r", "h"]);
    // an item outside the group lights by itself, as before
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^Hex tiles,/ }));
    expect(onHover).toHaveBeenLastCalledWith("t");
    expect(onLight).toHaveBeenCalledTimes(1);
  });

  it("lights the header, not the members, while the group's trays are lit", () => {
    render(<ComponentList components={items} groups={[kit]} {...handlers()} />);
    const lit = (name: string | RegExp): string | null =>
      screen.getByRole("button", { name }).getAttribute("data-lit");
    expect(lit("Player kit, 4 copies")).toBeNull();
    act(() => {
      hoveredMembers.value = ["s", "r", "h"];
    });
    expect(lit("Player kit, 4 copies")).toBe("true");
    expect(lit(/^Starter deck,/)).toBeNull();
    expect(lit(/^Market deck,/)).toBeNull();
    act(() => {
      hoveredMembers.value = null;
      // the plan pointing at a group's tray names one member: the card lights as one
      hoveredComponent.value = "r";
    });
    expect(lit("Player kit, 4 copies")).toBe("true");
    expect(lit(/^Resources,/)).toBeNull();
    act(() => {
      hoveredComponent.value = "t";
    });
    expect(lit("Player kit, 4 copies")).toBeNull();
  });

  it("lights nothing once the list goes", () => {
    const onLight = vi.fn();
    const view = render(
      <ComponentList components={items} groups={[kit]} onLight={onLight} {...handlers()} />,
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: /^Hero,/ }));
    act(() => {
      view.unmount();
    });
    expect(onLight).toHaveBeenLastCalledWith(null);
  });

  describe("rules", () => {
    const locks: Lock[] = [
      pin("g:p0:0"),
      pin("g:p2:0", true),
      pin("g:p3:0"),
      { kind: "size", trayKey: "g:p1:0", w: 190, d: 71, h: 38 },
      pin("m:p0:0"),
    ];

    it("shows one chip per rule beside the header, none on the members or the other rows", () => {
      render(<ComponentList components={items} groups={[kit]} locks={locks} {...handlers()} />);
      const chips = screen.getByRole("list", { name: "Rules for Player kit" });
      expect(
        within(chips)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Pinned", "Pinned, turned", "Size locked"]);
      // Market deck's own pin is its own chip, and only one list per owner
      expect(screen.getAllByRole("list", { name: /^Rules for/ })).toHaveLength(2);
      expect(screen.queryByRole("list", { name: "Rules for Hero" })).toBeNull();
      expect(screen.getByRole("button", { name: "Player kit, 4 copies" }).contains(chips)).toBe(
        false,
      );
    });

    it("lifts a rule from every tray of the group with one call", () => {
      const h = handlers();
      render(<ComponentList components={items} groups={[kit]} locks={locks} {...h} />);
      const chips = within(screen.getByRole("list", { name: "Rules for Player kit" }));
      fireEvent.click(chips.getByText("Pinned"));
      expect(h.onUnpin).toHaveBeenCalledTimes(1);
      expect(h.onUnpin).toHaveBeenCalledWith(["g:p0:0", "g:p3:0"]);
      fireEvent.click(chips.getByRole("button", { name: "Unlock size of Player kit" }));
      expect(h.onUnlockSize).toHaveBeenCalledWith(["g:p1:0"]);
    });

    it("keeps the focus in the card when a chip goes", () => {
      const only: Lock[] = [pin("g:p0:0")];
      const h = handlers();
      const view = render(<ComponentList components={items} groups={[kit]} locks={only} {...h} />);
      const chip = screen.getByRole("button", { name: "Unpin Player kit" });
      chip.focus();
      fireEvent.click(chip);
      view.rerender(<ComponentList components={items} groups={[kit]} locks={[]} {...h} />);
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Player kit, 4 copies" }),
      );
    });
  });

  it("draws the card on the phone's sheet too, with compact member rows", () => {
    const { container } = render(
      <ComponentList compact components={items} groups={[kit]} {...handlers()} />,
    );
    expect(screen.getByRole("group", { name: "Player kit, 4 copies" })).toBeTruthy();
    expect(container.querySelectorAll(".gc-member .k-row--compact")).toHaveLength(3);
  });

  it("gives the phone's header a swatch, the name, ×4 and '3 items' on the right, and no grips", () => {
    const { container } = render(
      <ComponentList compact components={items} groups={[kit]} {...handlers()} />,
    );
    const head = screen.getByRole("button", { name: "Player kit, 4 copies" });
    expect(head.classList.contains("k-row--compact")).toBe(true);
    expect(head.querySelector(".k-row__swatch--group")).not.toBeNull();
    expect(head.querySelector(".k-tile")).toBeNull();
    expect(head.querySelector(".gc-head__copies")?.textContent).toBe("×4");
    expect(head.querySelector(".k-row__meta")?.textContent).toBe("3 items");
    expect(head.hasAttribute("aria-pressed")).toBe(false);
    expect(container.querySelector(".gc--compact")).not.toBeNull();
    expect(container.querySelector(".gc-grip, [data-grip]")).toBeNull();
  });

  it("says 'Empty' and, for a tray that does not fit, 'Doesn't fit' on the phone's header", () => {
    render(<ComponentList compact components={items} groups={[empty]} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Group, empty" }).textContent).toContain("Empty");
    cleanup();
    render(
      <ComponentList
        compact
        components={items}
        groups={[kit]}
        culprits={new Set(["r"])}
        {...handlers()}
      />,
    );
    expect(screen.getByRole("button", { name: "Player kit, 4 copies" }).textContent).toContain(
      "Doesn't fit",
    );
  });
});

function well(componentId: string) {
  return {
    x: 1.6,
    y: 1.6,
    w: 50,
    d: 50,
    floorZ: 1.2,
    kind: "well" as const,
    contents: "x",
    features: [],
    componentId,
  };
}
