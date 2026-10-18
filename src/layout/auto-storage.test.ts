// src/layout/auto-storage.test.ts
import { describe, expect, it } from "vitest";
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import type { CardsComponent, Project } from "../model/types";
import { size } from "../sizing";
import starRealmsAuto from "../../test/fixtures/star-realms-auto.json";
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
