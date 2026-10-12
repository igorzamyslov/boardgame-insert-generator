/** Test helper: loads the synthetic fixture projects (roadmap §5) as LayoutInputs. */
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import { size } from "../sizing";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import smallTiles from "../../test/fixtures/small-tiles.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tinyBox from "../../test/fixtures/tiny-box.json";
import type { LayoutInput } from "./types";

export const FIXTURES = {
  "cards-heavy": cardsHeavy,
  "bits-heavy": bitsHeavy,
  "tiles-minis": tilesMinis,
  "small-tiles": smallTiles,
  "tiny-box": tinyBox,
} as const;

export type FixtureName = keyof typeof FIXTURES;

export function fixtureInput(name: FixtureName): LayoutInput {
  const parsed = parseProject(FIXTURES[name]);
  if (!parsed.ok) {
    throw new Error(`fixture ${name}: ${parsed.error}`);
  }
  const p = parsed.project;
  const { requirements } = size(p.components, p.settings);
  return {
    requirements,
    box: p.box,
    printer: p.printer,
    settings: p.settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: "0.0.0-test",
  };
}
