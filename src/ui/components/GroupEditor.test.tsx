// src/ui/components/GroupEditor.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Group } from "../../model/types";
import editorCss from "./editor.css?raw";
import { GroupEditor, movedWords, removeQuestion } from "./GroupEditor";
import type { GroupEditorMember, GroupEditorProps } from "./GroupEditor";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const group = (over: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Player kit",
  copies: 4,
  access: "often",
  memberIds: ["a", "b", "c"],
  ...over,
});

const member = (id: string, name: string): GroupEditorMember => ({
  id,
  kind: "cards",
  name,
  who: name,
  shade: { "--shade-fill": "#ccc", "--shade-line": "#333", "--shade-ink": "#000" },
});

const MEMBERS = [member("a", "Starter deck"), member("b", "Resources"), member("c", "Hero")];

function editor(over: Partial<GroupEditorProps> = {}) {
  const h = {
    onRename: vi.fn(),
    onCopies: vi.fn(),
    onAccess: vi.fn(),
    onMove: vi.fn(),
    onOpenItem: vi.fn(),
    onBack: vi.fn(),
    onRemove: vi.fn(),
    onAnnounce: vi.fn(),
  };
  const view = render(<GroupEditor group={group()} index={0} members={MEMBERS} {...h} {...over} />);
  return { ...h, view };
}

describe("the words", () => {
  it("asks 'Remove the group “Player kit”? Its 3 items stay, with 4 copies each.' (the second clause only with copies)", () => {
    expect(removeQuestion("Player kit", 3, 4)).toBe(
      "Remove the group “Player kit”? Its 3 items stay, with 4 copies each.",
    );
    expect(removeQuestion("Player kit", 3, 1)).toBe(
      "Remove the group “Player kit”? Its 3 items stay.",
    );
    expect(removeQuestion("Hero", 1, 2)).toBe(
      "Remove the group “Hero”? Its 1 item stays, with 2 copies.",
    );
    expect(removeQuestion("Group", 0, 1)).toBe("Remove the group “Group”?");
  });

  it("says a move by names, never by place", () => {
    expect(movedWords("Hero", "Starter deck")).toBe("Hero is now after Starter deck.");
    expect(movedWords("Hero", undefined)).toBe("Hero is now first.");
  });
});

describe("GroupEditor (the rail's panel)", () => {
  it("is the back link, a Group over the name, Copies, access, the order and the foot, in G2's order", () => {
    editor();
    const panel = screen.getByRole("region", { name: "Player kit" });
    const parts = [
      within(panel).getByRole("button", { name: "What's inside" }),
      within(panel).getByText("Group"),
      within(panel).getByText("Copies"),
      within(panel).getByText("Each copy is its own tray."),
      within(panel).getByText("How often you reach for it"),
      within(panel).getByText("Order in the tray"),
      within(panel).getByRole("button", { name: "Remove group…" }),
      within(panel).getByRole("button", { name: "Done" }),
    ];
    parts.reduce((before, next) => {
      expect(before.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      return next;
    });
    expect(panel.textContent).not.toMatch(/Extra room/);
  });

  it("puts the name in a title field named Name, and commits what is typed", () => {
    const { onRename } = editor();
    const name = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(name.value).toBe("Player kit");
    fireEvent.input(name, { target: { value: "Crew" } });
    expect(onRename).toHaveBeenLastCalledWith("Crew");
  });

  it("steps Copies between 1 and 10 and says each copy is its own tray", () => {
    const { onCopies } = editor();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onCopies).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getByRole("button", { name: "Fewer" }));
    expect(onCopies).toHaveBeenLastCalledWith(3);
    cleanup();
    editor({ group: group({ copies: 10 }) });
    expect(screen.getByRole("button", { name: "More" }).getAttribute("aria-disabled")).toBe("true");
    cleanup();
    editor({ group: group({ copies: undefined }) });
    expect((screen.getByRole("textbox", { name: "Copies" }) as HTMLInputElement).value).toBe("1");
    expect(screen.getByRole("button", { name: "Fewer" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("offers Often, Sometimes and Only at setup, the group's own pressed", () => {
    const { onAccess } = editor();
    const seg = screen.getByRole("group", { name: "How often you reach for it" });
    expect(
      within(seg)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Often", "Sometimes", "Only at setup"]);
    expect(within(seg).getByRole("button", { name: "Often" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(within(seg).getByRole("button", { name: "Sometimes" }));
    expect(onAccess).toHaveBeenCalledWith("sometimes");
  });

  it("lists the items in an ol labelled by 'Order in the tray', each with a grip, a swatch, a name button and 44 px move buttons", () => {
    const { onOpenItem } = editor();
    const order = screen.getByRole("list", { name: "Order in the tray" });
    expect(order.tagName).toBe("OL");
    const rows = within(order).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.querySelector(".gc-grip")?.getAttribute("aria-hidden")).toBe("true");
      expect(row.querySelector(".k-row__swatch")).not.toBeNull();
    }
    fireEvent.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Resources" }));
    expect(onOpenItem).toHaveBeenCalledWith("b");
    // the move buttons are the kit's 44 px icon buttons
    const up = screen.getByRole("button", { name: "Move Hero up" });
    expect(up.classList.contains("k-iconbtn")).toBe(true);
    expect(editorCss).toMatch(/\.ed-order__row\s*\{[^}]*min-height:\s*52px/);
  });

  it("moves an item to the place before or after, and says where by names", () => {
    const { onMove, onAnnounce } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Move Hero up" }));
    expect(onMove).toHaveBeenLastCalledWith("c", 1);
    expect(onAnnounce).toHaveBeenLastCalledWith("Hero is now after Starter deck.");
    fireEvent.click(screen.getByRole("button", { name: "Move Resources up" }));
    expect(onMove).toHaveBeenLastCalledWith("b", 0);
    expect(onAnnounce).toHaveBeenLastCalledWith("Resources is now first.");
    fireEvent.click(screen.getByRole("button", { name: "Move Starter deck down" }));
    expect(onMove).toHaveBeenLastCalledWith("a", 1);
    expect(onAnnounce).toHaveBeenLastCalledWith("Starter deck is now after Resources.");
  });

  it("blocks the first item's Up and the last item's Down: focusable, aria-disabled, titled with why, doing nothing", () => {
    const { onMove, onAnnounce } = editor();
    const first = screen.getByRole("button", { name: "Move Starter deck up" });
    const last = screen.getByRole("button", { name: "Move Hero down" });
    expect(first.getAttribute("aria-disabled")).toBe("true");
    expect(first.getAttribute("title")).toBe("Starter deck is already first.");
    expect(last.getAttribute("aria-disabled")).toBe("true");
    expect(last.getAttribute("title")).toBe("Hero is already last.");
    expect(last.hasAttribute("disabled")).toBe(false);
    fireEvent.click(first);
    fireEvent.click(last);
    expect(onMove).not.toHaveBeenCalled();
    expect(onAnnounce).toHaveBeenLastCalledWith("Hero is already last.");
    // a middle item's buttons are not blocked
    expect(
      screen.getByRole("button", { name: "Move Resources up" }).hasAttribute("aria-disabled"),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Move Resources down" }).hasAttribute("title")).toBe(
      false,
    );
  });

  it("draws a blocked chevron in the pale ink of G2 (--line-strong), not the text's --ink-off", () => {
    expect(editorCss).toMatch(
      /\.ed-order \.k-iconbtn\[aria-disabled="true"\]\s*\{[^}]*--k-fg:\s*var\(--line-strong\)/,
    );
  });

  it("tells two items of one name apart in the buttons and the words", () => {
    const { onAnnounce } = editor({
      members: [member("a", "Cards"), { ...member("b", "Cards"), who: "Cards (item 2)" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Move Cards (item 2) up" }));
    expect(onAnnounce).toHaveBeenLastCalledWith("Cards (item 2) is now first.");
  });

  it("shows an empty group's dashed line in place of the order", () => {
    editor({ group: group({ memberIds: [] }), members: [] });
    expect(screen.queryByRole("list", { name: "Order in the tray" })).toBeNull();
    expect(screen.getByText("Drag items here, or use Move to group… in an item.")).toBeTruthy();
  });

  it("shows an unnamed group as Group", () => {
    editor({ group: group({ name: "" }) });
    expect(screen.getByRole("region", { name: "Group" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Group", level: 2 })).toBeTruthy();
  });

  it("names the panel with an h2 that takes the focus, and the page's h1 is the stage's", () => {
    editor();
    const h2 = screen.getByRole("heading", { name: "Player kit", level: 2 });
    expect(document.activeElement).toBe(h2);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("puts the focus on an item's name instead, coming back from its editor", () => {
    editor({ focusItemId: "b" });
    expect(document.activeElement?.textContent).toBe("Resources");
  });

  it("asks before removing, in place: the question, Remove group and Cancel; Cancel hands the focus back", () => {
    vi.useFakeTimers();
    const { onRemove } = editor();
    const open = screen.getByRole("button", { name: "Remove group…" });
    fireEvent.click(open);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getByText("Remove the group “Player kit”? Its 3 items stay, with 4 copies each."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onRemove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Remove group…" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove group…" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove group" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("goes back from the back link and from Done", () => {
    const { onBack } = editor();
    fireEvent.click(screen.getByRole("button", { name: "What's inside" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

describe("GroupEditor on a phone (MobileEdit's sheet)", () => {
  it("has the sheet's bar (Back, the name as the h1, Done), the strip, a Name field and no back link of the rail's", () => {
    editor({ phone: true, strip: <p data-testid="strip">Player kit, 4 trays.</p> });
    const bar = document.querySelector(".ed-bar") as HTMLElement;
    expect(within(bar).getByRole("button", { name: "Back" })).toBeTruthy();
    expect(within(bar).getByRole("heading", { level: 1 }).textContent).toBe("Player kit");
    expect(within(bar).getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByTestId("strip")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "What's inside" })).toBeNull();
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe(
      "Player kit",
    );
    expect(screen.getByRole("list", { name: "Order in the tray" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove group…" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Extra room/);
    // no dragging on a phone (spec §7.8): no grips, Up and Down are the way
    expect(document.querySelector(".gc-grip")).toBeNull();
    expect(screen.getByRole("button", { name: "Move Hero up" })).toBeTruthy();
  });
});
