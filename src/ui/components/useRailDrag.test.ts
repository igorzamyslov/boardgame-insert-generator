// src/ui/components/useRailDrag.test.ts
// The rail's drag (0.7.0 Task 14, spec §7.3): the pure parts. The pointer part is in
// ComponentList.drag.test.tsx and App.drag.test.tsx.
import { describe, expect, it } from "vitest";
import type { Group } from "../../model/types";
import {
  dragLineAt,
  dropChange,
  hitTest,
  nextScroll,
  pastThreshold,
  type RailGeometry,
} from "./useRailDrag";

const rect = (top: number, bottom: number, left = 0, right = 300) => ({ top, bottom, left, right });

/**
 * A list 300 wide, 0..600 high: a card "kit" (header 0..60, members a, b, c at 64..108, 110..154,
 * 156..200, frame 0..204), a card "spare" (empty, dashed area 260..320, frame 208..324), and a loose
 * row from 330.
 */
const geometry: RailGeometry = {
  list: rect(0, 600),
  groups: [
    {
      id: "kit",
      rect: rect(0, 204),
      bodyTop: 64,
      rows: [
        { id: "a", rect: rect(64, 108) },
        { id: "b", rect: rect(110, 154) },
        { id: "c", rect: rect(156, 200) },
      ],
    },
    { id: "spare", rect: rect(208, 324), bodyTop: 260, rows: [] },
  ],
};

describe("hitTest", () => {
  it("is between two members of a group: the place is how many other members lie above the pointer", () => {
    expect(hitTest(geometry, { x: 100, y: 109 }, "x")).toEqual({ groupId: "kit", index: 1 });
    expect(hitTest(geometry, { x: 100, y: 155 }, "x")).toEqual({ groupId: "kit", index: 2 });
  });

  it("is the first place above the first member's middle, the header too, and the last below the last middle", () => {
    expect(hitTest(geometry, { x: 100, y: 70 }, "x")).toEqual({ groupId: "kit", index: 0 });
    expect(hitTest(geometry, { x: 100, y: 20 }, "x")).toEqual({ groupId: "kit", index: 0 });
    expect(hitTest(geometry, { x: 100, y: 190 }, "x")).toEqual({ groupId: "kit", index: 3 });
    expect(hitTest(geometry, { x: 100, y: 202 }, "x")).toEqual({ groupId: "kit", index: 3 });
  });

  it("does not count the dragged member: the place is among the others", () => {
    // over b's own place, b is dragged: a lies above, c below
    expect(hitTest(geometry, { x: 100, y: 132 }, "b")).toEqual({ groupId: "kit", index: 1 });
    // below c's middle with c dragged: both others lie above
    expect(hitTest(geometry, { x: 100, y: 190 }, "c")).toEqual({ groupId: "kit", index: 2 });
    // above a's middle with a dragged: no other lies above
    expect(hitTest(geometry, { x: 100, y: 70 }, "a")).toEqual({ groupId: "kit", index: 0 });
  });

  it("is an empty group's area: into it, at the first place", () => {
    expect(hitTest(geometry, { x: 150, y: 290 }, "x")).toEqual({ groupId: "spare", index: 0 });
    expect(hitTest(geometry, { x: 150, y: 215 }, "x")).toEqual({ groupId: "spare", index: 0 });
  });

  it("is out anywhere else in the list: between the cards, among the loose rows", () => {
    expect(hitTest(geometry, { x: 100, y: 206 }, "x")).toEqual({ out: true });
    expect(hitTest(geometry, { x: 100, y: 400 }, "x")).toEqual({ out: true });
  });

  it("is nothing outside the list: the drop cancels", () => {
    expect(hitTest(geometry, { x: 100, y: -5 }, "x")).toBeNull();
    expect(hitTest(geometry, { x: 100, y: 700 }, "x")).toBeNull();
    expect(hitTest(geometry, { x: 400, y: 100 }, "x")).toBeNull();
    expect(hitTest(geometry, { x: -1, y: 100 }, "x")).toBeNull();
  });
});

describe("dragLineAt", () => {
  it("lies in the gap between two members, across the card", () => {
    expect(dragLineAt(geometry, { groupId: "kit", index: 1 }, "x")).toEqual({
      y: 109,
      left: 4,
      right: 296,
    });
  });

  it("lies just above the first member and just below the last", () => {
    expect(dragLineAt(geometry, { groupId: "kit", index: 0 }, "x")?.y).toBe(63);
    expect(dragLineAt(geometry, { groupId: "kit", index: 3 }, "x")?.y).toBe(201);
  });

  it("skips the dragged member, whose place stays in the card", () => {
    // b dragged: between a and c is the gap under a (108) and over c (156)
    expect(dragLineAt(geometry, { groupId: "kit", index: 1 }, "b")?.y).toBe(132);
  });

  it("lies at the top of an empty group's dashed area", () => {
    expect(dragLineAt(geometry, { groupId: "spare", index: 0 }, "x")?.y).toBe(260);
  });

  it("is none for out and for a group that is not there", () => {
    expect(dragLineAt(geometry, { out: true }, "x")).toBeNull();
    expect(dragLineAt(geometry, { groupId: "nope", index: 0 }, "x")).toBeNull();
  });
});

describe("dropChange", () => {
  const groups: Group[] = [
    { id: "kit", name: "Player kit", access: "often", memberIds: ["a", "b", "c"] },
    { id: "spare", name: "Spare", access: "sometimes", memberIds: [] },
  ];

  it("is into a group for an item from the list or from another group", () => {
    expect(dropChange(groups, "loose", { groupId: "kit", index: 1 })).toBe("into");
    expect(dropChange(groups, "a", { groupId: "spare", index: 0 })).toBe("into");
  });

  it("is out for a member dropped on the list, and nothing for a loose item dropped there", () => {
    expect(dropChange(groups, "a", { out: true })).toBe("out");
    expect(dropChange(groups, "loose", { out: true })).toBe("none");
  });

  it("is an order within the group, and nothing when the place is the one it has", () => {
    expect(dropChange(groups, "a", { groupId: "kit", index: 2 })).toBe("order");
    expect(dropChange(groups, "c", { groupId: "kit", index: 0 })).toBe("order");
    expect(dropChange(groups, "b", { groupId: "kit", index: 1 })).toBe("none");
    expect(dropChange(groups, "a", { groupId: "kit", index: 0 })).toBe("none");
    expect(dropChange(groups, "c", { groupId: "kit", index: 2 })).toBe("none");
  });

  it("is nothing for a group that is not there", () => {
    expect(dropChange(groups, "a", { groupId: "nope", index: 0 })).toBe("none");
  });
});

describe("pastThreshold", () => {
  it("starts a drag at 4 px of movement, not at 3", () => {
    expect(pastThreshold({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
    expect(pastThreshold({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(pastThreshold({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
    expect(pastThreshold({ x: 10, y: 10 }, { x: 10, y: 14 })).toBe(true);
    expect(pastThreshold({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
  });
});

describe("nextScroll", () => {
  const list = rect(100, 500);

  it("scrolls up near the top edge, and down near the bottom one, faster the nearer", () => {
    expect(nextScroll(list, 105)).toBeLessThan(0);
    expect(nextScroll(list, 495)).toBeGreaterThan(0);
    expect(Math.abs(nextScroll(list, 101))).toBeGreaterThan(Math.abs(nextScroll(list, 130)));
  });

  it("does not scroll in the middle", () => {
    expect(nextScroll(list, 300)).toBe(0);
  });
});
