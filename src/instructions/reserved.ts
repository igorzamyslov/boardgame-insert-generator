// src/instructions/reserved.ts
import type { Box, ReservedSpec, Settings } from "../model/types";
import { planFrame } from "../plan/layers";
import { mm } from "../ui/identity";

/** The closing step for one area kept free on top: the sentence, and what it is called. */
export interface ClosingStep {
  name: string;
  text: string;
}

/**
 * The corner of the box an area lies in: "front left", "front right", "back left" or "back
 * right". The layout puts it in a corner; if it ever touches none, each axis names the wall it is
 * nearer to (a tie goes to the front and to the left).
 */
export function whereItLies(reserved: ReservedSpec, box: Box, settings: Settings): string {
  const f = planFrame(box, settings);
  const toBack = f.usableD - (reserved.y + reserved.d);
  const toRight = f.usableW - (reserved.x + reserved.w);
  return `${reserved.y <= toBack ? "front" : "back"} ${reserved.x <= toRight ? "left" : "right"}`;
}

/** One sentence per area, in the order of the plan's list: where the paper goes on the trays. */
export function closingSteps(
  reserved: readonly ReservedSpec[] | undefined,
  box: Box,
  settings: Settings,
): ClosingStep[] {
  return (reserved ?? []).map((r) => ({
    name: r.name,
    text: `Lay the ${r.name} (${mm(r.w)} × ${mm(r.d)} mm, ${mm(box.headroom)} mm thick) flat on the trays in the ${whereItLies(r, box, settings)} corner.`,
  }));
}
