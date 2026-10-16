import { chamferMinimums } from "../model/settings";
import { separatorsOf } from "../model/defaults";
import type { Component, Notice, Settings, TraySpec } from "../model/types";
import { MIN_SEPARATOR } from "../sizing/constants";
import { roundMm } from "./units";

/** What splitSeparators reads from a project. */
export interface SeparatorInputs {
  components: readonly Component[];
  settings: Settings;
}

/** The notice code for a plate count cut back to what fits. */
export const SEPARATORS_REDUCED_CODE = "separators.reduced";

/** Tolerance when matching a spacer to the compartment it stands in, mm. */
const EPS = 0.02;

/**
 * The component whose compartment a spacer stands in: the one of the tray named by the spacer's
 * key (minus ":spacer") that holds the spacer's footprint. A tray of a group holds several
 * components, so the tray's key alone does not say; the compartment does. Undefined for a
 * layout stored before compartments carried a component id.
 */
function ownerOf(spacer: TraySpec, tray: TraySpec | undefined): string | undefined {
  return tray?.compartments.find(
    (c) =>
      c.componentId !== undefined &&
      spacer.x >= tray.x + c.x - EPS &&
      spacer.y >= tray.y + c.y - EPS &&
      spacer.x + spacer.w <= tray.x + c.x + c.w + EPS &&
      spacer.y + spacer.d <= tray.y + c.y + c.d + EPS,
  )?.componentId;
}

/**
 * The parts to print for a stored layout, second pass (spec §6.2): a component's stretch spacer,
 * stored as one block, is printed as `separators` thin loose plates of equal thickness (to the
 * 0.01 mm grid, the first ones a hundredth thicker when it doesn't divide) standing in the same
 * space, so one can be pulled as the collection grows. The plates are derived, not stored: the
 * stored layout keeps its one spacer whatever the count, so a share link never grows with it, and
 * the count is no part of the layout's inputs hash.
 *
 * A plate is at least MIN_SEPARATOR thick and at least what its bottom chamfer needs; when the
 * count asked for would leave plates thinner, it is cut back to what fits and an info notice
 * (SEPARATORS_REDUCED_CODE, at the component's `separators` field) says how many and why. One
 * plate keeps the spacer as it is, key included; several are keyed `<trayKey>:spacer:<n>`, from 1.
 * Everything that isn't such a spacer is returned as it is.
 */
export function splitSeparators(
  trays: readonly TraySpec[],
  o: SeparatorInputs,
): { trays: TraySpec[]; notices: Notice[] } {
  const byKey = new Map(trays.filter((t) => t.part === "tray").map((t) => [t.key, t]));
  const leastMm = Math.max(MIN_SEPARATOR, chamferMinimums(o.settings, 0).side);
  const least = Math.ceil(Math.round(leastMm * 1000) / 10);
  // Per component index: the reduced result with the fewest plates.
  const cut = new Map<number, { asked: number; got: number; total: number }>();
  const out = trays.flatMap((t): TraySpec[] => {
    if (t.part !== "spacer" || !t.key.endsWith(":spacer")) {
      return [t];
    }
    const id = ownerOf(t, byKey.get(t.key.slice(0, -":spacer".length)));
    const index = o.components.findIndex((c) => c.id === id);
    const asked = index < 0 ? 1 : separatorsOf(o.components[index] as Component);
    if (asked <= 1) {
      return [t];
    }
    // Along the spacer's length: x, or y when its tray stands turned.
    const total = Math.round((t.rotated ? t.d : t.w) * 100);
    const n = Math.max(1, Math.min(asked, Math.floor(total / least)));
    if (n < asked) {
      const seen = cut.get(index);
      if (seen === undefined || n < seen.got) {
        cut.set(index, { asked, got: n, total });
      }
    }
    if (n === 1) {
      return [t];
    }
    const base = Math.floor(total / n);
    const extra = total - base * n;
    let at = 0;
    return Array.from({ length: n }, (_, i): TraySpec => {
      const thick = base + (i < extra ? 1 : 0);
      const plate: TraySpec = t.rotated
        ? { ...t, key: `${t.key}:${i + 1}`, y: roundMm(t.y + at / 100), d: thick / 100 }
        : { ...t, key: `${t.key}:${i + 1}`, x: roundMm(t.x + at / 100), w: thick / 100 };
      at += thick;
      return plate;
    });
  });
  const notices = [...cut].map(([index, r]): Notice => {
    const name = o.components[index]?.name ?? "";
    const label = name === "" ? "this item" : `"${name}"`;
    return {
      level: "info",
      code: SEPARATORS_REDUCED_CODE,
      message: `Spacer plates for ${label}: you asked for ${r.asked}, but ${r.got === 1 ? "only 1 fits" : `${r.got} fit`}. The spare length of ${roundMm(r.total / 100)} mm can't be split into more plates of at least ${roundMm(least / 100)} mm, the thinnest that print rigid.`,
      path: `/components/${index}/separators`,
    };
  });
  return { trays: out, notices };
}
