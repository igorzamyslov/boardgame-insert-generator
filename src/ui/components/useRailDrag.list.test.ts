// src/ui/components/useRailDrag.list.test.ts
// The rail's drag to a place in the list itself (`{ out: true, index }`): the pure parts.
import { describe, expect, it } from "vitest";
import type { Group } from "../../model/types";
import { dragLineAt, dropChange, hitTest, type RailGeometry } from "./useRailDrag";

const rect = (top: number, bottom: number, left = 0, right = 300) => ({ top, bottom, left, right });

/** A list 0..600: item a 0..40, card kit 50..200 (members m1, m2), item b 210..250, item c 260..300. */
const geometry: RailGeometry = {
  list: rect(0, 600),
  groups: [
    {
      id: "kit",
      rect: rect(50, 200),
      bodyTop: 90,
      rows: [
        { id: "m1", rect: rect(90, 130) },
        { id: "m2", rect: rect(140, 180) },
      ],
    },
  ],
  entries: [
    { id: "a", rect: rect(0, 40) },
    { id: "kit", rect: rect(50, 200) },
    { id: "b", rect: rect(210, 250) },
    { id: "c", rect: rect(260, 300) },
  ],
};
const kit: Group = { id: "kit", name: "Kit", access: "often", memberIds: ["m1", "m2"] };

describe("hitTest in the list", () => {
  it("counts the entries whose middle lies above the pointer, the dragged one's own left out", () => {
    expect(hitTest(geometry, { x: 100, y: 5 }, "b")).toEqual({ out: true, index: 0 });
    expect(hitTest(geometry, { x: 100, y: 45 }, "b")).toEqual({ out: true, index: 1 });
    // below b's middle: a and kit are above; b itself is not counted
    expect(hitTest(geometry, { x: 100, y: 255 }, "b")).toEqual({ out: true, index: 2 });
    expect(hitTest(geometry, { x: 100, y: 500 }, "b")).toEqual({ out: true, index: 3 });
  });

  it("is a place for a member too, among all the entries", () => {
    expect(hitTest(geometry, { x: 100, y: 205 }, "m1")).toEqual({ out: true, index: 2 });
    expect(hitTest(geometry, { x: 100, y: 500 }, "m1")).toEqual({ out: true, index: 4 });
  });

  it("is still a group's own when over its card, and nothing outside the list", () => {
    expect(hitTest(geometry, { x: 100, y: 100 }, "a")).toEqual({ groupId: "kit", index: 0 });
    expect(hitTest(geometry, { x: 900, y: 100 }, "a")).toBeNull();
  });

  it("without entries only leaves the group (no index)", () => {
    const bare: RailGeometry = { list: geometry.list, groups: geometry.groups };
    expect(hitTest(bare, { x: 100, y: 500 }, "m1")).toEqual({ out: true });
  });
});

describe("dragLineAt in the list", () => {
  it("lies in the gap between the neighbours, inset by 4 each side", () => {
    expect(dragLineAt(geometry, { out: true, index: 1 }, "b")).toEqual({
      y: 45,
      left: 4,
      right: 296,
    });
    // between kit and c with b lifted out
    expect(dragLineAt(geometry, { out: true, index: 2 }, "b")).toEqual({
      y: 230,
      left: 4,
      right: 296,
    });
  });

  it("lies just above the first entry and just below the last", () => {
    expect(dragLineAt(geometry, { out: true, index: 0 }, "b")?.y).toBe(-1);
    expect(dragLineAt(geometry, { out: true, index: 3 }, "b")?.y).toBe(301);
  });

  it("is none for a drop that only leaves a group, or without entries", () => {
    expect(dragLineAt(geometry, { out: true }, "m1")).toBeNull();
    const bare: RailGeometry = { list: geometry.list, groups: geometry.groups };
    expect(dragLineAt(bare, { out: true, index: 1 }, "b")).toBeNull();
  });
});

describe("dropChange to the list", () => {
  it("is place for an ungrouped item that lands elsewhere, none where it stands", () => {
    expect(dropChange([kit], "b", { out: true, index: 0 }, 2)).toBe("place");
    expect(dropChange([kit], "b", { out: true, index: 2 }, 2)).toBe("none");
  });

  it("is none without a place to compare, or without an index", () => {
    expect(dropChange([kit], "b", { out: true }, 2)).toBe("none");
    // no known place: any index is a change
    expect(dropChange([kit], "b", { out: true, index: 0 })).toBe("place");
  });

  it("is out for a member, whatever the place", () => {
    expect(dropChange([kit], "m1", { out: true, index: 0 })).toBe("out");
    expect(dropChange([kit], "m1", { out: true })).toBe("out");
  });

  it("is still into for a group of another's, and order within its own", () => {
    expect(dropChange([kit], "b", { groupId: "kit", index: 0 }, 2)).toBe("into");
    expect(dropChange([kit], "m1", { groupId: "kit", index: 1 })).toBe("order");
    expect(dropChange([kit], "m1", { groupId: "kit", index: 0 })).toBe("none");
  });
});
