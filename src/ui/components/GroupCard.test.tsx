// src/ui/components/GroupCard.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTray } from "../../app/test-helpers";
import rail from "../../screens/rail.css?raw";
import type { Group } from "../../model/types";
import { GroupCard, groupLine, type GroupMemberView } from "./GroupCard";

afterEach(cleanup);

const group = (over: Partial<Group> = {}): Group => ({
  id: "g",
  name: "Player kit",
  copies: 4,
  access: "often",
  memberIds: ["a", "b", "c"],
  ...over,
});

const member = (id: string, name: string, meta: string): GroupMemberView => ({
  id,
  kind: "cards",
  name,
  who: name,
  meta,
  shade: { "--shade-fill": "#ccc", "--shade-line": "#333", "--shade-ink": "#000" },
  problem: false,
});

const MEMBERS = [
  member("a", "Starter deck", "12 cards"),
  member("b", "Resources", "3 kinds, 30 pieces"),
  member("c", "Hero", "1 figure"),
];

const tray = (key: string) => makeTray({ key, path: key });
const FOUR = ["g:p0:0", "g:p1:0", "g:p2:0", "g:p3:0"].map(tray);

function handlers() {
  return { onEdit: vi.fn(), onEditItem: vi.fn(), onLight: vi.fn() };
}

describe("groupLine", () => {
  it("counts items and trays, singular and plural", () => {
    expect(groupLine({ items: 3, trays: 4 })).toBe("3 items · 4 trays");
    expect(groupLine({ items: 1, trays: 1 })).toBe("1 item · 1 tray");
    expect(groupLine({ items: 2, trays: 1 })).toBe("2 items · 1 tray");
  });

  it("names the layer after the trays, as an item's row does", () => {
    expect(groupLine({ items: 3, trays: 4, layer: "bottom layer" })).toBe(
      "3 items · 4 trays · bottom layer",
    );
  });

  it("counts the items only while there is no plan to count trays in", () => {
    expect(groupLine({ items: 3 })).toBe("3 items");
    expect(groupLine({ items: 3, trays: 0 })).toBe("3 items");
  });

  it("says Empty for no items, and Doesn't fit when a tray of the group does not", () => {
    expect(groupLine({ items: 0 })).toBe("Empty");
    expect(groupLine({ items: 0, trays: 0, layer: "top layer" })).toBe("Empty");
    expect(groupLine({ items: 3, trays: 4, layer: "bottom layer", misfit: true })).toBe(
      "Doesn't fit",
    );
  });
});

describe("GroupCard", () => {
  it("is a group named by its name and copies, with a header button of the same name", () => {
    render(
      <GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} {...handlers()} />,
    );
    const frame = screen.getByRole("group", { name: "Player kit, 4 copies" });
    expect(frame.getAttribute("data-region")).toBe("group-card");
    const head = within(frame).getByRole("button", { name: "Player kit, 4 copies" });
    // the line under the name is its description: the name alone is the spec's
    expect(head.textContent).toContain("Player kit");
    expect(head.textContent).toContain("×4");
    expect(head.textContent).toContain("3 items · 4 trays");
    expect(head.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("says one copy as one copy and draws no ×1", () => {
    render(
      <GroupCard
        group={group({ copies: undefined })}
        members={MEMBERS}
        trays={[tray("g:p0:0")]}
        pressed={false}
        {...handlers()}
      />,
    );
    const head = screen.getByRole("button", { name: "Player kit, 1 copy" });
    expect(head.textContent).not.toContain("×");
    expect(head.textContent).toContain("3 items · 1 tray");
  });

  it("shows an unnamed group as Group, and an empty one as 'Group, empty' with the drop area", () => {
    render(
      <GroupCard
        group={group({ name: "", copies: 1, memberIds: [] })}
        members={[]}
        pressed={false}
        {...handlers()}
      />,
    );
    const frame = screen.getByRole("group", { name: "Group, empty" });
    const head = within(frame).getByRole("button", { name: "Group, empty" });
    expect(head.textContent).toBe("GroupEmpty");
    expect(
      within(frame).getByText("Drag items here, or use Move to group… in an item."),
    ).toBeTruthy();
    expect(within(frame).queryByRole("list")).toBeNull();
  });

  it("offers no drag in an empty card on the phone's sheet, only Move to group…", () => {
    render(
      <GroupCard
        group={{ id: "e", name: "Group", access: "sometimes", memberIds: [] }}
        members={[]}
        pressed={false}
        compact
        {...handlers()}
      />,
    );
    const frame = screen.getByRole("group", { name: "Group, empty" });
    expect(within(frame).getByText("Use Move to group… in an item.")).toBeTruthy();
    expect(within(frame).queryByText(/Drag/)).toBeNull();
  });

  it("lists the members at full size, each opening its own editor, and the header opens the group's", () => {
    const h = handlers();
    render(<GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} {...h} />);
    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /^Resources,/ }));
    expect(h.onEditItem).toHaveBeenCalledWith("b");
    expect(h.onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Player kit, 4 copies" }));
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    // a member's line has no layer words: the header has them
    expect(screen.getByRole("button", { name: "Resources, 3 kinds, 30 pieces" })).toBeTruthy();
  });

  it("draws a grip beside each member that is hidden and not a tab stop", () => {
    const { container } = render(
      <GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} {...handlers()} />,
    );
    const grips = container.querySelectorAll(".gc-grip");
    expect(grips).toHaveLength(3);
    for (const grip of grips) {
      expect(grip.getAttribute("aria-hidden")).toBe("true");
      expect(grip.hasAttribute("tabindex")).toBe(false);
      expect(grip.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
    }
  });

  it("presses the header, and only the header, while a tray of the group is selected", () => {
    const { rerender } = render(
      <GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} {...handlers()} />,
    );
    const head = (): HTMLElement => screen.getByRole("button", { name: "Player kit, 4 copies" });
    expect(head().getAttribute("aria-pressed")).toBe("false");
    rerender(<GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed {...handlers()} />);
    expect(head().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Hero,/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("lights every tray of the group while the pointer or the focus is on the header or a member", () => {
    const h = handlers();
    render(<GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} {...h} />);
    const ALL = ["a", "b", "c"];
    const head = screen.getByRole("button", { name: "Player kit, 4 copies" });
    fireEvent.mouseEnter(head);
    expect(h.onLight).toHaveBeenLastCalledWith(ALL);
    fireEvent.mouseLeave(head);
    expect(h.onLight).toHaveBeenLastCalledWith(null);
    fireEvent.focus(head);
    expect(h.onLight).toHaveBeenLastCalledWith(ALL);
    fireEvent.blur(head);
    expect(h.onLight).toHaveBeenLastCalledWith(null);
    const hero = screen.getByRole("button", { name: /^Hero,/ });
    fireEvent.mouseEnter(hero);
    expect(h.onLight).toHaveBeenLastCalledWith(ALL);
    fireEvent.blur(hero);
    expect(h.onLight).toHaveBeenLastCalledWith(null);
  });

  it("lights the member under the pointer or the focus, and the header when asked", () => {
    const h = handlers();
    const { rerender } = render(
      <GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} {...h} />,
    );
    const hero = screen.getByRole("button", { name: /^Hero,/ });
    expect(hero.getAttribute("data-lit")).toBeNull();
    fireEvent.mouseEnter(hero);
    expect(hero.getAttribute("data-lit")).toBe("true");
    expect(screen.getByRole("button", { name: /^Resources,/ }).getAttribute("data-lit")).toBeNull();
    fireEvent.mouseLeave(hero);
    expect(hero.getAttribute("data-lit")).toBeNull();
    fireEvent.focus(hero);
    expect(hero.getAttribute("data-lit")).toBe("true");
    fireEvent.blur(hero);
    const head = (): HTMLElement => screen.getByRole("button", { name: "Player kit, 4 copies" });
    expect(head().getAttribute("data-lit")).toBeNull();
    rerender(
      <GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} lit {...h} />,
    );
    expect(head().getAttribute("data-lit")).toBe("true");
  });

  it("names the layer on the header and says Doesn't fit in place of its line", () => {
    const { rerender } = render(
      <GroupCard
        group={group()}
        members={MEMBERS}
        trays={FOUR}
        layer="bottom layer"
        pressed={false}
        {...handlers()}
      />,
    );
    expect(screen.getByRole("button", { name: "Player kit, 4 copies" }).textContent).toContain(
      "3 items · 4 trays · bottom layer",
    );
    rerender(
      <GroupCard
        group={group()}
        members={MEMBERS}
        trays={FOUR}
        layer="bottom layer"
        misfit
        pressed={false}
        {...handlers()}
      />,
    );
    const head = screen.getByRole("button", { name: "Player kit, 4 copies" });
    expect(head.textContent).toContain("Doesn't fit");
    expect(head.textContent).not.toContain("trays");
  });

  it("names the card once for the frame and once for the header, not again for the members' list", () => {
    render(
      <GroupCard group={group()} members={MEMBERS} trays={FOUR} pressed={false} {...handlers()} />,
    );
    expect(screen.getAllByLabelText("Player kit, 4 copies")).toHaveLength(2);
    expect(screen.getByRole("list").hasAttribute("aria-label")).toBe(false);
  });

  it("warns on a header that doesn't fit as an item's row does: the warn wash, edge and meta", () => {
    const rule = (selector: string): string => {
      let out = "";
      for (const [, selectors = "", body = ""] of rail
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (selectors.split(",").some((one) => one.trim() === selector)) {
          out += body;
        }
      }
      return out;
    };
    expect(rule('.gc-head[data-misfit="true"]')).toMatch(/--k-bg:\s*var\(--warn-bg\)/);
    expect(rule('.gc-head[data-misfit="true"]')).toMatch(/border-color:\s*var\(--warn\)/);
    expect(rule('.gc-head[data-misfit="true"] .k-row__meta')).toMatch(/color:\s*var\(--warn-ink\)/);
    expect(rule(".k-row.is-culprit")).toMatch(/border-color:\s*var\(--warn\)/);
  });

  it("puts the rules' chips beside the header, outside its button", () => {
    render(
      <GroupCard
        group={group()}
        members={MEMBERS}
        trays={FOUR}
        pressed={false}
        chips={<ul aria-label="Rules for Player kit">chips</ul>}
        {...handlers()}
      />,
    );
    const chips = screen.getByRole("list", { name: "Rules for Player kit" });
    expect(screen.getByRole("button", { name: "Player kit, 4 copies" }).contains(chips)).toBe(
      false,
    );
  });
});
