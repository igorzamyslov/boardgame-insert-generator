/** Test helper: loads the synthetic fixture projects (roadmap §5) as LayoutInputs. */
import { inputsHash } from "../model/hash";
import { parseProject } from "../model/schema";
import { size } from "../sizing";
import bedLip from "../../test/fixtures/layout-bed-lip.json";
import bitsHeavy from "../../test/fixtures/bits-heavy.json";
import cardsHeavy from "../../test/fixtures/cards-heavy.json";
import smallTiles from "../../test/fixtures/small-tiles.json";
import tilesMinis from "../../test/fixtures/tiles-minis.json";
import tightMinis from "../../test/fixtures/tight-minis.json";
import tightStarRealms from "../../test/fixtures/tight-star-realms.json";
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

/**
 * Boxes whose parts only fit as one exact partition into stacks (the heights fill the top plane
 * with no slack to spare): a real project that took about 4 000 000 iterations to solve cold,
 * and a three-stack box of seven card trays with 1.7 mm of slack over the three stacks.
 * Kept apart from FIXTURES: they are about search strength, not about sizing.
 */
export const TIGHT_FIXTURES = {
  "tight-star-realms": tightStarRealms,
  "tight-minis": tightMinis,
} as const;

export type TightFixtureName = keyof typeof TIGHT_FIXTURES;

const OLD_CARD_CLEARANCES = { cardClearance: 1.5, cardStackClearance: 1 };

export function fixtureInput(name: FixtureName | TightFixtureName): LayoutInput {
  const source: unknown =
    name in FIXTURES ? FIXTURES[name as FixtureName] : TIGHT_FIXTURES[name as TightFixtureName];
  const parsed = parseProject(source);
  if (!parsed.ok) {
    throw new Error(`fixture ${name}: ${parsed.error}`);
  }
  const p = parsed.project;
  // The tight boxes were cut to the old Standard card clearances (1.5 and 1 mm; the defaults are now
  // 3 and 2 and schema 0.4.0 migrates stored ones), so they keep them: the tests on them are about
  // how the search copes with an exact fit, not about card sizing. (tight-minis.json is 0.7 mm
  // higher than it was, for the 5% thicker tile stacks and the bigger minis pockets.)
  const settings = name in TIGHT_FIXTURES ? { ...p.settings, ...OLD_CARD_CLEARANCES } : p.settings;
  const { requirements } = size(p.components, settings, p.groups);
  return {
    requirements,
    box: p.box,
    printer: p.printer,
    settings,
    locks: p.locks,
    inputsHash: inputsHash(p),
    appVersion: "0.0.0-test",
  };
}

/**
 * Captured random inputs where a part fits the print bed plain but not with the lip's thicker
 * walls, so it cannot carry a tray above it (case0, case3: genuinely too small a box; case1: a
 * feasible box the search used to miss on some seeds). Stored as plain LayoutInputs.
 */
export type BedLipCase = keyof typeof bedLip;

export function bedLipInput(name: BedLipCase): LayoutInput {
  return bedLip[name] as unknown as LayoutInput;
}
