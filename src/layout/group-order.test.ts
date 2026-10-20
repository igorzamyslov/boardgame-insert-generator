import { describe, expect, it } from "vitest";
import { size } from "../sizing";
import { bulk, cards, inGroup } from "../sizing/test-helpers";
import { fixtureInput } from "./test-fixtures";
import { optimize } from "./optimize";

describe("a group whose member order blocks a finger cut", () => {
  it("is laid out as one tray, without that cut, not as split trays", () => {
    const pile = (id: string, ml: number) =>
      bulk({ id, name: id, items: [{ name: "Pile", volumeMl: ml }] });
    const starter = cards({ id: "c1", name: "Starter deck", decks: [{ name: "Main", count: 1 }] });
    const members = [pile("b1", 100), pile("b2", 20), starter, pile("b3", 20), pile("b4", 20)];
    const base = fixtureInput("cards-heavy");
    const { requirements, notices } = size(members, base.settings, [
      inGroup(members, "g", { name: "Kit" }),
    ]);
    expect(notices.map((n) => n.message)).toEqual([
      "Starter deck has no finger cut here. Move it to the start of Kit for one.",
    ]);
    const result = optimize(
      { ...base, box: { ...base.box, innerHeight: 120 }, requirements, locks: [] },
      1,
      3000,
    );
    const keys = result.layout?.trays.map((t) => t.key).filter((k) => k.startsWith("g:")) ?? [];
    expect(result.layout).not.toBeNull();
    expect(keys).toEqual(["g:p0:0"]);
  });
});
