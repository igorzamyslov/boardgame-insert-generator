// src/ui/volumeFit.ts
// The no-fit screen's volume note: what the items need as trays against what the box has under the
// headroom, a judgement when the figures are clear-cut, and the items that take the most.
import type { VolumeBudget } from "../layout/volume";

/** Needing more than the box has cannot be packed, whatever the settings (waste only adds). */
export const OVER_RATIO = 1;
/** Above this the trays' own walls and the gaps between them leave no slack: see DESIGN's decision log. */
export const TIGHT_RATIO = 0.85;

/** How many of the biggest items are named. */
const BIGGEST = 3;
const MM3_PER_L = 1_000_000;

export interface VolumeNote {
  verdict: "over" | "tight" | "roomy";
  /** "Your items need at least 5.9 L as trays. The box has 6.8 L under the headroom." */
  line: string;
  /** The judgement, when the figures are clear-cut. */
  judgement: string | null;
  /** The biggest items, "Faction ×7 takes 2.3 L" (only when it is over or tight). */
  biggest: string[];
  /** The smallest single item whose leaving out brings it under the box. */
  leaveOut: string | null;
}

const litres = (mm3: number): string => (mm3 / MM3_PER_L).toFixed(1);

/** The note for a budget; `headroom` says whether the box reserves any space on top. */
export function volumeNote(b: VolumeBudget, headroom: boolean): VolumeNote {
  const ratio = b.boxMm3 > 0 ? b.needMm3 / b.boxMm3 : b.needMm3 > 0 ? Infinity : 0;
  const verdict = ratio > OVER_RATIO ? "over" : ratio > TIGHT_RATIO ? "tight" : "roomy";
  const line = `Your items need at least ${litres(b.needMm3)} L as trays. The box has ${litres(b.boxMm3)} L${headroom ? " under the headroom" : ""}.`;
  const judgement =
    verdict === "over"
      ? `This can't fit: take something out${headroom ? " or reserve less space on top" : ""}.`
      : verdict === "tight"
        ? "Very tight: expect to change settings."
        : null;
  const biggest =
    verdict === "roomy"
      ? []
      : b.items.slice(0, BIGGEST).map((i) => `${i.label} takes ${litres(i.mm3)} L`);
  const sufficient =
    verdict === "over"
      ? b.items.filter((i) => b.needMm3 - i.mm3 <= b.boxMm3 * OVER_RATIO).at(-1)
      : undefined;
  return {
    verdict,
    line,
    judgement,
    biggest,
    leaveOut:
      sufficient === undefined
        ? null
        : `Leaving out ${sufficient.label} would bring it under the box's ${litres(b.boxMm3)} L.`,
  };
}
