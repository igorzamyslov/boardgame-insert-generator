import { describe, expect, it } from "vitest";
import { placeInList } from "../app/actions";
import { newComponent, newGroup, newProject } from "./defaults";
import { listOrderWith, railEntries } from "./groups";
import { noForeign, parseProject, serializeProject, toSerializable } from "./schema";
import type { Component, Group, Project } from "./types";

const item = (id: string, name: string): Component => ({
  ...newComponent("cards"),
  id,
  name,
});
const kit: Group = {
  ...newGroup("kit"),
  id: "kit",
  name: "Kit",
  copies: 2,
  memberIds: ["m1", "m2"],
};
const three = [item("a", "Alpha"), item("b", "Beta"), item("c", "Gamma")];
const withKit = [item("a", "Alpha"), item("m1", "Mkt"), item("b", "Beta"), item("m2", "Gem")];
const keys = (es: ReturnType<typeof railEntries>): string[] => es.map((e) => e.id);

describe("railEntries with a listOrder", () => {
  it("lists the items in the order given, and the unlisted ones last in components order", () => {
    expect(keys(railEntries({ components: three, listOrder: ["c", "a"] }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("ignores ids that name nothing and repeated ones", () => {
    expect(keys(railEntries({ components: three, listOrder: ["zz", "b", "b", "a"] }))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("is the components' own order without one, or with an empty one", () => {
    expect(keys(railEntries({ components: three }))).toEqual(["a", "b", "c"]);
    expect(keys(railEntries({ components: three, listOrder: [] }))).toEqual(["a", "b", "c"]);
  });

  it("stands a group's card where its first member (in list order) stands", () => {
    const es = railEntries({ components: withKit, groups: [kit] });
    expect(keys(es)).toEqual(["a", "kit", "b"]);
    const reordered = railEntries({
      components: withKit,
      groups: [kit],
      listOrder: ["b", "m2", "a", "m1"],
    });
    // m2 is the first member in list order: the card stands after b
    expect(keys(reordered)).toEqual(["b", "kit", "a"]);
    expect(reordered.map((e) => e.kind)).toEqual(["item", "group", "item"]);
  });

  it("puts an empty group after everything", () => {
    const empty: Group = { ...kit, id: "none", memberIds: [] };
    expect(keys(railEntries({ components: three, groups: [empty], listOrder: ["c"] }))).toEqual([
      "c",
      "a",
      "b",
      "none",
    ]);
  });
});

describe("listOrderWith", () => {
  it("puts an item at a place among the other entries", () => {
    expect(listOrderWith({ components: three }, "c", 0)).toEqual(["c", "a", "b"]);
    expect(listOrderWith({ components: three }, "a", 1)).toEqual(["b", "a", "c"]);
    expect(listOrderWith({ components: three }, "a", 2)).toEqual(["b", "c", "a"]);
  });

  it("clamps the place", () => {
    expect(listOrderWith({ components: three }, "a", 99)).toEqual(["b", "c", "a"]);
    expect(listOrderWith({ components: three }, "c", -5)).toEqual(["c", "a", "b"]);
  });

  it("counts a group's card as one entry and keeps its members together in memberIds order", () => {
    const p = { components: withKit, groups: [kit] };
    // entries without b: a, kit
    expect(listOrderWith(p, "b", 1)).toEqual(["a", "b", "m1", "m2"]);
    expect(listOrderWith(p, "b", 2)).toEqual(["a", "m1", "m2", "b"]);
    expect(listOrderWith(p, "b", 0)).toEqual(["b", "a", "m1", "m2"]);
    expect(listOrderWith(p, "a", 1)).toEqual(["m1", "m2", "a", "b"]);
  });

  it("keeps every component exactly once, the unlisted ones included", () => {
    const out = listOrderWith({ components: three, listOrder: ["b"] }, "c", 0);
    expect([...out].sort()).toEqual(["a", "b", "c"]);
    expect(out[0]).toBe("c");
  });
});

describe("placeInList", () => {
  const project = (over: Partial<Project> = {}): Project =>
    ({
      components: withKit,
      groups: [kit],
      locks: [],
      ...over,
    }) as unknown as Project;

  it("sets listOrder for an ungrouped item and touches no component", () => {
    const p = project();
    const r = placeInList(p, "b", 0);
    expect(r.project.listOrder).toEqual(["b", "a", "m1", "m2"]);
    expect(r.project.components).toBe(p.components);
    expect(r.notes).toEqual([]);
  });

  it("takes a member out of its group first, with the note, and puts it at the place", () => {
    const p = project();
    const r = placeInList(p, "m1", 2);
    expect(r.project.groups?.[0]?.memberIds).toEqual(["m2"]);
    expect(r.notes).toEqual(["Mkt is out of Kit."]);
    // out of the group it is an entry of the list: without it a, b, kit; place 2 is between b and kit
    expect(r.project.listOrder).toEqual(["a", "b", "m1", "m2"]);
    expect(keys(railEntries(r.project))).toEqual(["a", "b", "m1", "kit"]);
    expect(r.project.components.find((c) => c.id === "m1")?.copies).toBe(2);
  });

  it("changes nothing for an unknown item", () => {
    const p = project();
    expect(placeInList(p, "nope", 0)).toEqual({ project: p, notes: [] });
  });
});

describe("listOrder in the file", () => {
  const withOrder = (listOrder?: string[]): Project => {
    const p: Project = { ...newProject(), components: three };
    if (listOrder !== undefined) {
      p.listOrder = listOrder;
    }
    return p;
  };

  it("round-trips through serialize and parse", () => {
    const text = serializeProject(withOrder(["c", "a", "b"]), noForeign());
    expect(JSON.parse(text).listOrder).toEqual(["c", "a", "b"]);
    const r = parseProject(JSON.parse(text));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.listOrder).toEqual(["c", "a", "b"]);
    }
  });

  it("does not write an empty one, and a file without one parses to none", () => {
    expect("listOrder" in toSerializable(withOrder([]), noForeign())).toBe(false);
    const text = serializeProject(withOrder(), noForeign());
    expect(text).not.toContain("listOrder");
    const r = parseProject(JSON.parse(text));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.listOrder).toBeUndefined();
    }
  });

  it("drops entries that are not ids when reading", () => {
    const raw = JSON.parse(serializeProject(withOrder(["c"]), noForeign())) as Record<
      string,
      unknown
    >;
    raw.listOrder = ["c", 7, null, "a"];
    const r = parseProject(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.listOrder).toEqual(["c", "a"]);
    }
  });
});
