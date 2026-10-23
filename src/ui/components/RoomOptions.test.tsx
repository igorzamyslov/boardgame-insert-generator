// src/ui/components/RoomOptions.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withRoom } from "../../model/room";
import type { Component, Notice } from "../../model/types";
import { ValidationContext } from "../validation";
import { ItemGroupingContext } from "./GroupRow";
import type { ItemGrouping } from "./GroupRow";
import { RoomOptions, roomLine } from "./RoomOptions";
import { choose, lastOf, pressedIn, of } from "./test-editors";

afterEach(cleanup);

function show(c: Component, onChange = vi.fn()) {
  render(<RoomOptions component={c} index={0} onChange={onChange} />);
  return onChange;
}

/** The lines under the row's choice, whole (the row is the choice; its lines follow it). */
const linesUnder = (label: string): string[] =>
  [
    ...(screen
      .getByRole("group", { name: label })
      .closest(".ed-stack")
      ?.querySelectorAll(".ed-line") ?? []),
  ].map((el) => el.textContent ?? "");

describe("RoomOptions: which items have the row", () => {
  it("names it by what the item holds: cards, tiles, pieces", () => {
    for (const [kind, label] of [
      ["cards", "Room for more cards"],
      ["tiles", "Room for more tiles"],
      ["bulk", "Room for more pieces"],
    ] as const) {
      show(of(kind));
      expect(pressedIn(label), kind).toBe("None");
      cleanup();
    }
  });

  it("has no row for miniatures or for a custom item", () => {
    for (const kind of ["minis", "custom"] as const) {
      const view = render(<RoomOptions component={of(kind)} index={0} onChange={vi.fn()} />);
      expect(view.container.textContent, kind).toBe("");
      cleanup();
    }
  });

  it("offers None, Some and As much as fits, and None is the default", () => {
    show(of("cards"));
    const buttons = [
      ...screen.getByRole("group", { name: "Room for more cards" }).querySelectorAll("button"),
    ];
    expect(buttons.map((b) => b.textContent)).toEqual(["None", "Some", "As much as fits"]);
    expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
    expect(linesUnder("Room for more cards")).toEqual([]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("RoomOptions: Some", () => {
  it.each([
    ["cards", 20],
    ["tiles", 10],
    ["bulk", 25],
  ] as const)("starts %s at %i when Some is picked", (kind, start) => {
    const onChange = show(of(kind));
    choose(`Room for more ${kind === "bulk" ? "pieces" : kind}`, "Some");
    expect(lastOf(onChange).room).toBe(start);
  });

  it("shows the amount, in the unit of what the item holds, and says what it plans", () => {
    show(withRoom(of("cards"), 30));
    expect(pressedIn("Room for more cards")).toBe("Some");
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("30");
    expect(screen.getByText("cards")).toBeTruthy();
    expect(linesUnder("Room for more cards")).toEqual([
      "The tray is planned with room for 30 more cards.",
    ]);
    cleanup();
    show(withRoom(of("tiles"), 12));
    expect(screen.getByText("tiles")).toBeTruthy();
    expect(linesUnder("Room for more tiles")).toEqual([
      "The tray is planned with room for 12 more tiles.",
    ]);
    cleanup();
    show(withRoom(of("bulk"), 40));
    expect(screen.getByText("%")).toBeTruthy();
    expect(linesUnder("Room for more pieces")).toEqual([
      "The tray is planned with room for 40% more pieces.",
    ]);
  });

  it("commits a typed amount", () => {
    const onChange = show(withRoom(of("cards"), 30));
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "45" } });
    expect(lastOf(onChange).room).toBe(45);
  });

  it("refuses an amount the engine would refuse, beside the field", () => {
    const onChange = show(withRoom(of("bulk"), 40));
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "501" } });
    expect(screen.getByRole("alert").textContent).toMatch(/at most 500/i);
    fireEvent.input(screen.getByRole("textbox"), { target: { value: "0" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ room: 501 }));
  });

  it("shows the engine's error at /components/<i>/room beside the field", () => {
    const notice: Notice = {
      level: "error",
      code: "limit.room",
      path: "/components/0/room",
      message: "Room for more cards must be at most 1000.",
    };
    render(
      <ValidationContext.Provider value={[notice]}>
        <RoomOptions component={withRoom(of("cards"), 2000)} index={0} onChange={vi.fn()} />
      </ValidationContext.Provider>,
    );
    expect(screen.getByRole("alert").textContent).toContain("must be at most 1000");
  });
});

describe("RoomOptions: As much as fits", () => {
  it("says what it takes, under the choice", () => {
    const onChange = show(of("tiles"));
    choose("Room for more tiles", "As much as fits");
    expect(lastOf(onChange).room).toBe("max");
    cleanup();
    show(withRoom(of("tiles"), "max"));
    expect(pressedIn("Room for more tiles")).toBe("As much as fits");
    expect(linesUnder("Room for more tiles")).toEqual([
      "Takes the room left over once the layout is chosen.",
    ]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says it fills the group's tray for a member of a group", () => {
    const kit = { id: "g1", name: "Player kit", copies: 4 };
    const grouping: ItemGrouping = {
      group: kit,
      groups: [kit],
      onMoveTo: vi.fn(),
      onNewGroup: vi.fn(),
      onTakeOut: vi.fn(),
      onEditGroup: vi.fn(),
      onCopies: vi.fn(),
    };
    render(
      <ItemGroupingContext.Provider value={grouping}>
        <RoomOptions component={withRoom(of("bulk"), "max")} index={0} onChange={vi.fn()} />
      </ItemGroupingContext.Provider>,
    );
    expect(linesUnder("Room for more pieces")).toEqual([
      "Fills the room left in Player kit's tray. The tray doesn't get bigger.",
    ]);
  });
});

describe("RoomOptions: the way back", () => {
  it("offers Back to None only while a room is set, and puts the item back as it was", () => {
    const onChange = show(withRoom(of("cards"), "max"));
    fireEvent.click(screen.getByRole("button", { name: "Back to None for Room for more cards" }));
    expect("room" in lastOf(onChange)).toBe(false);
  });

  it("stores nothing when None is picked", () => {
    const onChange = show(withRoom(of("cards"), 10));
    choose("Room for more cards", "None");
    expect("room" in lastOf(onChange)).toBe(false);
  });
});

describe("roomLine", () => {
  it("is empty for None", () => {
    expect(roomLine(of("cards"))).toBeUndefined();
    expect(roomLine(of("minis"))).toBeUndefined();
  });
});
