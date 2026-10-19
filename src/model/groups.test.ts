import { describe, expect, it } from "vitest";
import { newComponent, newGroup } from "./defaults";
import { copiesOf, groupOfItem, mostFrequentAccess, requirementKeyOf } from "./groups";
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
