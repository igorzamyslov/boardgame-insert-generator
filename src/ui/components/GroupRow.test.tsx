// src/ui/components/GroupRow.test.tsx
// @vitest-environment jsdom
// An item's editor in a group's terms (0.7.0 Task 12, spec §7.3 and §7.5): the Group row, Copies, and
// what a member's editor leaves out.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomEditor } from "./CustomEditor";
import { ItemGroupingContext } from "./GroupRow";
import type { ItemGrouping } from "./GroupRow";
import { of, openMore } from "./test-editors";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const KIT = { id: "g1", name: "Player kit", copies: 4 };
const LOOSE = { id: "g2", name: "Group", copies: 1 };

function grouping(over: Partial<ItemGrouping> = {}): ItemGrouping {
  return {
    group: undefined,
    groups: [KIT, LOOSE],
    onMoveTo: vi.fn(),
    onNewGroup: vi.fn(),
    onTakeOut: vi.fn(),
    onEditGroup: vi.fn(),
    onCopies: vi.fn(),
    ...over,
  };
}

function editor(g: ItemGrouping, onChange = vi.fn()) {
  const view = render(
    <ItemGroupingContext.Provider value={g}>
      <CustomEditor component={{ ...of("custom"), name: "Hero" }} index={0} onChange={onChange} />
    </ItemGroupingContext.Provider>,
  );
  openMore();
  return { view, onChange };
}

const row = (name: RegExp | string) => screen.getByRole("button", { name });
const later = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

describe("an item that is in no group", () => {
  it("has the Group row, closed on 'None', and no free-text Group box", () => {
    editor(grouping());
    expect(row(/^Group/).textContent).toContain("None");
    expect(row(/^Group/).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText(/^Group/)).toBeNull();
  });

  it("has Copies (a stepper from 1 to 10) with 'Each copy is its own tray.', and neither Per player nor Counts are per player", () => {
    const g = grouping();
    editor(g);
    fireEvent.click(row(/^Copies/));
    const stepper = screen.getByRole("textbox", { name: "Copies" }) as HTMLInputElement;
    expect(stepper.value).toBe("1");
    expect(screen.getByText("Each copy is its own tray.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Per player|Counts are per player|Players/);
    const steps = within(stepper.closest(".k-stepper-box") as HTMLElement);
    fireEvent.click(steps.getByRole("button", { name: "More" }));
    expect(g.onCopies).toHaveBeenCalledWith(2);
    expect(steps.getByRole("button", { name: "Fewer" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("stops the stepper at 10", () => {
    const g = grouping();
    render(
      <ItemGroupingContext.Provider value={g}>
        <CustomEditor component={{ ...of("custom"), copies: 10 }} index={0} onChange={vi.fn()} />
      </ItemGroupingContext.Provider>,
    );
    openMore();
    fireEvent.click(row(/^Copies/));
    const steps = within(
      screen.getByRole("textbox", { name: "Copies" }).closest(".k-stepper-box") as HTMLElement,
    );
    expect(steps.getByRole("button", { name: "More" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("opens 'Move to group…' on each group by name with ×N, then 'New group'", () => {
    const g = grouping();
    editor(g);
    fireEvent.click(row(/^Group/));
    fireEvent.click(row(/^Move to group…/));
    const panel = screen.getByRole("group", { name: "Move to group…" });
    expect(
      within(panel)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Player kit ×4", "Group ×1", "New group"]);
    fireEvent.click(within(panel).getByRole("button", { name: /^Player kit/ }));
    expect(g.onMoveTo).toHaveBeenCalledWith("g1");
    expect(screen.queryByRole("group", { name: "Move to group…" })).toBeNull();
  });

  it("'New group' makes a group of this item", () => {
    const g = grouping({ groups: [] });
    editor(g);
    fireEvent.click(row(/^Group/));
    fireEvent.click(row(/^Move to group…/));
    fireEvent.click(row("New group"));
    expect(g.onNewGroup).toHaveBeenCalledOnce();
    expect(g.onMoveTo).not.toHaveBeenCalled();
  });

  it("closes the panel on Escape, the focus back on 'Move to group…'", () => {
    editor(grouping());
    fireEvent.click(row(/^Group/));
    const button = row(/^Move to group…/);
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("group", { name: "Move to group…" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Move to group…" })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("keeps Copies and 'How often you reach for it' where they are", () => {
    editor(grouping());
    expect(screen.getByRole("group", { name: "How often you reach for it" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/are set on/);
  });
});

describe("an item that is in a group", () => {
  const inKit = (over: Partial<ItemGrouping> = {}) => grouping({ group: KIT, ...over });

  it("closes the Group row on the group's name; opened, it says 'In Player kit' with Edit and Take out of group", () => {
    const g = inKit();
    editor(g);
    expect(row(/^Group/).textContent).toContain("Player kit");
    fireEvent.click(row(/^Group/));
    expect(screen.getByText("In Player kit")).toBeTruthy();
    fireEvent.click(row("Edit Player kit"));
    expect(g.onEditGroup).toHaveBeenCalledWith("g1");
    fireEvent.click(row("Take out of group"));
    expect(g.onTakeOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /^Move to group/ })).toBeNull();
  });

  it("draws neither Copies nor 'How often you reach for it': one line says where they are set", () => {
    editor(inKit());
    expect(screen.queryByRole("button", { name: /^Copies/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Copies" })).toBeNull();
    expect(screen.queryByRole("group", { name: "How often you reach for it" })).toBeNull();
    expect(
      screen.getAllByText("Copies and how often you reach for it are set on Player kit."),
    ).toHaveLength(1);
  });

  it("keeps the line where Copies stood: between the shape chips and the Group row", () => {
    editor(inKit());
    const line = screen.getByText("Copies and how often you reach for it are set on Player kit.");
    const group = row(/^Group/);
    expect(line.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // and Room around the pieces is after the Group row, as it is for an item in no group
    expect(
      group.compareDocumentPosition(row(/^Room around the pieces/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not count the hidden Copies or access in the 'changed' summary", () => {
    render(
      <ItemGroupingContext.Provider value={inKit()}>
        <CustomEditor
          component={{ ...of("custom"), access: "often", copies: 3 }}
          index={0}
          onChange={vi.fn()}
        />
      </ItemGroupingContext.Provider>,
    );
    expect(row(/^More options/).textContent).not.toMatch(/changed/);
  });

  it("puts the focus on the first button of the row after a move in, a take out or a new group", async () => {
    const g = grouping();
    const view = editor(g).view;
    fireEvent.click(row(/^Group/));
    fireEvent.click(row(/^Move to group…/));
    fireEvent.click(row(/^Player kit/));
    // the app answers: the item is in the group now
    view.rerender(
      <ItemGroupingContext.Provider value={{ ...g, group: KIT }}>
        <CustomEditor component={{ ...of("custom"), name: "Hero" }} index={0} onChange={vi.fn()} />
      </ItemGroupingContext.Provider>,
    );
    await later();
    expect(document.activeElement).toBe(row("Edit Player kit"));
    fireEvent.click(row("Take out of group"));
    view.rerender(
      <ItemGroupingContext.Provider value={{ ...g, group: undefined }}>
        <CustomEditor component={{ ...of("custom"), name: "Hero" }} index={0} onChange={vi.fn()} />
      </ItemGroupingContext.Provider>,
    );
    await later();
    expect(document.activeElement).toBe(row(/^Move to group…/));
  });

  it("does not take the focus when the group changes by itself (an Undo)", async () => {
    const g = grouping();
    const view = editor(g).view;
    fireEvent.click(row(/^Group/));
    const before = document.activeElement;
    view.rerender(
      <ItemGroupingContext.Provider value={{ ...g, group: KIT }}>
        <CustomEditor component={{ ...of("custom"), name: "Hero" }} index={0} onChange={vi.fn()} />
      </ItemGroupingContext.Provider>,
    );
    await later();
    expect(document.activeElement).toBe(before);
  });
});

describe("the item's room row", () => {
  it("is 'Room around the pieces', and 'Extra room' is the group's alone", () => {
    editor(grouping());
    fireEvent.click(row(/^Room around the pieces/));
    expect(screen.getByLabelText(/^Room around the pieces/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Extra room/);
  });
});
