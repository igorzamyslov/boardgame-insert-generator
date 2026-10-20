import { describe, expect, it } from "vitest";
import { newComponent, newGroup } from "./defaults";
import {
  copiesOf,
  groupById,
  groupOfItem,
  mostFrequentAccess,
  nextGroupName,
  railEntries,
  requirementKeyOf,
} from "./groups";
import type { Group } from "./types";

describe("mostFrequentAccess", () => {
  it("picks the member reached for most often", () => {
    expect(mostFrequentAccess([{ access: "setup" }, { access: "sometimes" }])).toBe("sometimes");
    expect(mostFrequentAccess([{ access: "setup" }])).toBe("setup");
    expect(
      mostFrequentAccess([{ access: "often" }, { access: "often" }, { access: "setup" }]),
    ).toBe("often");
  });

  it("is setup for no members", () => {
    expect(mostFrequentAccess([])).toBe("setup");
  });
});

describe("group lookups", () => {
  const a = newComponent("cards");
  const b = { ...newComponent("bulk"), copies: 3 };
  const c = newComponent("custom");
  const kit: Group = { id: "kit", name: "Kit", copies: 4, access: "often", memberIds: [a.id] };

  it("finds the group an item is in, and none for an item in no group", () => {
    expect(groupOfItem({ groups: [kit] }, a.id)).toBe(kit);
    expect(groupOfItem({ groups: [kit] }, b.id)).toBeUndefined();
    expect(groupOfItem({}, a.id)).toBeUndefined();
  });

  it("keys a requirement by the group's id, else the item's own", () => {
    expect(requirementKeyOf({ groups: [kit] }, a)).toBe("kit");
    expect(requirementKeyOf({ groups: [kit] }, b)).toBe(b.id);
  });

  it("counts copies: the group's if grouped, else the item's, default 1", () => {
    expect(copiesOf({ groups: [kit] }, a)).toBe(4);
    expect(copiesOf({ groups: [kit] }, b)).toBe(3);
    expect(copiesOf({ groups: [kit] }, c)).toBe(1);
    expect(copiesOf({ groups: [{ ...kit, copies: undefined }] }, a)).toBe(1);
  });

  it("makes a new empty group reached for sometimes, with no copies and no members", () => {
    const g = newGroup("Player kit");
    expect(g).toMatchObject({ name: "Player kit", access: "sometimes", memberIds: [] });
    expect("copies" in g).toBe(false);
    expect(g.id).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe("groupById", () => {
  const kit: Group = { id: "kit", name: "Kit", access: "often", memberIds: [] };

  it("finds a group by its id, and none for an id that is not one (an item's, or none)", () => {
    expect(groupById({ groups: [kit] }, "kit")).toBe(kit);
    expect(groupById({ groups: [kit] }, "other")).toBeUndefined();
    expect(groupById({}, "kit")).toBeUndefined();
  });
});

describe("nextGroupName", () => {
  const named = (...names: string[]): { groups: Group[] } => ({
    groups: names.map((name, i) => ({ id: `g${i}`, name, access: "often", memberIds: [] })),
  });

  it("is Group first, then Group 2, Group 3", () => {
    expect(nextGroupName({})).toBe("Group");
    expect(nextGroupName(named())).toBe("Group");
    expect(nextGroupName(named("Group"))).toBe("Group 2");
    expect(nextGroupName(named("Group", "Group 2"))).toBe("Group 3");
  });

  it("takes the first free name, whatever the order, and ignores other names", () => {
    expect(nextGroupName(named("Group 2"))).toBe("Group");
    expect(nextGroupName(named("Group", "Group 3"))).toBe("Group 2");
    expect(nextGroupName(named("Player kit", "Group"))).toBe("Group 2");
  });

  it("counts an unnamed group, which shows as Group, as that name", () => {
    expect(nextGroupName(named(""))).toBe("Group 2");
  });
});

describe("railEntries", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ ...newComponent("cards"), id }));
  const group = (id: string, memberIds: string[]): Group => ({
    id,
    name: id,
    access: "often",
    memberIds,
  });
  const ids = (p: Parameters<typeof railEntries>[0]) =>
    railEntries(p).map((e) => `${e.kind}:${e.id}`);

  it("lists the items in order when there are no groups", () => {
    expect(ids({ components: items })).toEqual(["item:a", "item:b", "item:c", "item:d"]);
    expect(ids({ components: items, groups: [] })).toEqual([
      "item:a",
      "item:b",
      "item:c",
      "item:d",
    ]);
  });

  it("stands a group's card where its first member stands, once", () => {
    const groups = [group("g", ["c", "b"])];
    expect(ids({ components: items, groups })).toEqual(["item:a", "group:g", "item:d"]);
  });

  it("puts empty groups at the end, in the order of `groups`", () => {
    const groups = [group("e1", []), group("g", ["a"]), group("e2", [])];
    expect(ids({ components: items, groups })).toEqual([
      "group:g",
      "item:b",
      "item:c",
      "item:d",
      "group:e1",
      "group:e2",
    ]);
  });

  it("does not move the components: an item moved into a group leaves `components` alone", () => {
    const before = items.map((c) => c.id);
    const groups = [group("g", ["d"])];
    railEntries({ components: items, groups });
    expect(items.map((c) => c.id)).toEqual(before);
    // the card takes the place of its member
    expect(ids({ components: items, groups })).toEqual(["item:a", "item:b", "item:c", "group:g"]);
  });

  it("keeps a group whose members are all gone at the end rather than dropping it", () => {
    const groups = [group("g", ["gone"])];
    expect(ids({ components: items, groups }).at(-1)).toBe("group:g");
  });
});
