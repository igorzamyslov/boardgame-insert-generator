// src/app/volume.test.ts
import { describe, expect, it } from "vitest";
import { volumeNote } from "../ui/volumeFit";
import { parseProject } from "../model/schema";
import scytheComplete from "../../test/fixtures/scythe-complete.insert.json";
import scytheCore from "../../test/fixtures/scythe-core.insert.json";
import { harbourKings, loadSeed } from "../test-support/harbourKings";
import { projectVolume } from "./volume";

const fixture = (raw: unknown) => {
  const r = parseProject(raw);
  if (!r.ok) throw new Error(r.error);
  return r.project;
};

const budgetOf = (raw: unknown) => {
  const b = projectVolume(fixture(raw));
  if (b === null) throw new Error("no budget");
  return b;
};

describe("projectVolume", () => {
  it("calls a group by its name and copies, and an item by its name", () => {
    const b = projectVolume(loadSeed("harbour-kings-kit").project);
    expect(b).not.toBeNull();
    expect(b?.items.map((i) => i.label)).toContain("Market deck");
    expect(b?.items.every((i) => i.mm3 > 0)).toBe(true);
  });

  it("finds harbour kings' items well under the box", () => {
    const b = projectVolume(harbourKings());
    expect(b === null ? 1 : b.needMm3 / b.boxMm3).toBeLessThan(0.5);
  });

  it("is null for a project the engine cannot size", () => {
    const p = harbourKings();
    expect(projectVolume({ ...p, components: [{ kind: "nope" } as never] })).toBeNull();
  });

  // The owner's Scythe files (test/fixtures): all the expansions in a box that cannot take them, and
  // the core game in the same box, which can.
  it("says Scythe with every expansion is very tight, and names the factions first", () => {
    const n = volumeNote(budgetOf(scytheComplete), true);
    expect(n.line).toBe(
      "Your items need at least 5.9 L as trays. The box has 6.8 L under the headroom.",
    );
    expect(n.verdict).toBe("tight");
    expect(n.biggest[0]).toMatch(/^Faction ×7 takes 2\.\d L$/);
  });

  it("finds the core game roomy", () => {
    expect(volumeNote(budgetOf(scytheCore), true).verdict).toBe("roomy");
  });
});
