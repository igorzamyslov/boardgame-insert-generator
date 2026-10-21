// src/layout/auto-storage.test.ts
import { describe, expect, it } from "vitest";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { CardsComponent, Project } from "../model/types";
import { size } from "../sizing";
import starRealmsAuto from "../../test/fixtures/star-realms-auto.json";
import starRealmsOwner4 from "../../test/fixtures/star-realms-owner-4.json";
import { DEFAULT_ITERATIONS, optimize } from "./optimize";
import type { LayoutInput } from "./types";

function project(): Project {
  const parsed = parseProject(starRealmsAuto);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.project;
}

type Storage = CardsComponent["storage"];

function inputWith(starter: Storage): LayoutInput {
  const p = project();
  const components = p.components.map((c) =>
    c.kind === "cards" && c.name === "Starter deck" ? { ...c, storage: starter } : c,
  );
  return {
    requirements: size(components, p.settings).requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash({ ...p, components }),
    appVersion: "0.0.0-test",
  };
}

// The owner's report: "when i change starter deck tray from flat to auto - it cannot fit in to
// the box anymore". Flat fits only as three trays (one per deck); auto used to drop that variant.
describe("storage auto never fits worse than one storage alone", { timeout: 60_000 }, () => {
  it("fits the Star Realms box with the Starter deck flat and with it auto", () => {
    for (const storage of ["flat", "auto"] as const) {
      const result = optimize(inputWith(storage), 1, DEFAULT_ITERATIONS);
      expect(result.layout, storage).not.toBeNull();
    }
  });

  it("offers auto every variant flat has", () => {
    const ids = (storage: Storage): string[] =>
      inputWith(storage).requirements[1]?.variants.map((v) => v.id) ?? [];
    expect(ids("flat")).toContain("flat|strip|split3");
    expect(ids("auto")).toEqual(expect.arrayContaining(ids("flat")));
  });
});

// The owner's second report on this box: "3 flat split decks are not going on top of each other,
// even though there seems to be space". The Starter deck fits only split in three; Counter and all
// three of them in one stack, the Trade deck in the other, is feasible (bug-flat-auto §5).
describe("one item's split trays stay in one stack when they can", { timeout: 60_000 }, () => {
  it.each(["flat", "auto"] as const)("stacks the three Starter trays together (%s)", (storage) => {
    const input = inputWith(storage);
    const key = input.requirements[1]?.key ?? "";
    const result = optimize(input, 1, DEFAULT_ITERATIONS);
    const starter = (result.layout?.trays ?? []).filter(
      (t) => t.part === "tray" && t.key.startsWith(`${key}:`),
    );
    expect(starter).toHaveLength(3);
    expect(new Set(starter.map((t) => t.stack)).size).toBe(1);
  });
});

// The owner's fourth project on this box (0.8.1): the Counter deck is 63.5 × 88 like the others,
// not 56 × 87, so keeping the three Starter trays in one stack leaves 2.25 % of the box unused
// rather than 1.5 %. The optimizer parted them (two with the Counter, one on the Trade deck).
describe(
  "one item's split trays stay in one stack on the owner's file",
  { timeout: 60_000 },
  () => {
    function ownerInput(): LayoutInput {
      const parsed = parseProject(starRealmsOwner4);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const p = parsed.project;
      return {
        requirements: size(p.components, p.settings).requirements,
        box: p.box,
        printer: p.printer,
        settings: p.settings,
        locks: p.locks,
        inputsHash: inputsHash(p),
        appVersion: "0.0.0-test",
      };
    }

    it.each([1, 2, 3])("stacks the three Starter trays together (seed %i)", (seed) => {
      const input = ownerInput();
      const key = input.requirements[1]?.key ?? "";
      const result = optimize(input, seed, DEFAULT_ITERATIONS);
      const starter = (result.layout?.trays ?? []).filter(
        (t) => t.part === "tray" && t.key.startsWith(`${key}:`),
      );
      expect(starter).toHaveLength(3);
      expect(new Set(starter.map((t) => t.stack)).size).toBe(1);
    });
  },
);
