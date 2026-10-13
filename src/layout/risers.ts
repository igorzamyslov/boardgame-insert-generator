import { chamferMinimums } from "../model/settings";
import type { Lock, Printer, Settings, TraySpec } from "../model/types";
import { MIN_RISER, MIN_SPARE, RISER_SUFFIX, UPPER_TRAY_MIN_ABOVE_LIP } from "../sizing/constants";
import { roundDownTo, roundMm, roundUpTo, toMm, toU, toUFloor, type U } from "./units";

/** What splitRisers reads from a project. */
export interface RiserInputs {
  settings: Settings;
  printer: Printer;
  locks: readonly Lock[];
}

/**
 * The riser under a stack (spec §3 rule 2): the height its trays give up, as a part of its own
 * with the bottom tray's footprint. It follows the leftover style: a solid block, or an open
 * walled box with a floor (a solid block when it is too small to open).
 */
function riserSpec(bottom: TraySpec, h: number, leftover: Settings["leftover"]): TraySpec {
  const { wall, floor } = bottom;
  const w = roundMm(bottom.w - 2 * wall);
  const d = roundMm(bottom.d - 2 * wall);
  const solid = leftover === "solid" || Math.min(w, d) < MIN_SPARE;
  return {
    key: `${bottom.key}${RISER_SUFFIX}`,
    part: "riser",
    path: "",
    stack: bottom.stack,
    level: 0,
    x: bottom.x,
    y: bottom.y,
    z: bottom.z,
    w: bottom.w,
    d: bottom.d,
    h,
    rotated: false,
    wall,
    floor,
    lip: false,
    solid,
    compartments: solid
      ? []
      : [{ x: wall, y: wall, w, d, floorZ: floor, kind: "spare", contents: "", features: [] }],
  };
}

/**
 * The parts to print for a stored layout (spec §3 rule 2, §6.2). The stored layout pads a stack to
 * the top plane with a raised floor in its trays; printed, that height is better a part of its
 * own. A stack whose trays together have at least MIN_RISER of floor raised in every compartment
 * gets a riser under its bottom tray, and the trays lose that floor, so the heights still add up
 * exactly. A riser is derived, not stored: it is a pure function of the stored trays and these
 * inputs, so a stored layout (and a share link) is the same with or without it.
 *
 * Only whole layers move, a tray never goes below the height it needs as a lipped, chamfered
 * upper tray, a size-locked tray keeps its height, and the riser is never taller than the print
 * bed (the layout checks each tray's height, not the sum of their raises). Nothing is split with
 * `fillToTop` off. Spacers follow their tray. Other parts are returned as they are.
 */
export function splitRisers(trays: readonly TraySpec[], o: RiserInputs): TraySpec[] {
  const { settings, printer } = o;
  if (!settings.fillToTop) {
    return [...trays];
  }
  const locked = new Set(o.locks.flatMap((l) => (l.kind === "size" ? [l.trayKey] : [])));
  const layer: U = Math.max(1, toU(printer.layerHeight));
  const limit = roundDownTo(toU(printer.bedZ), layer);
  const out = new Map<TraySpec, TraySpec[]>();
  const stacks = new Set(trays.filter((t) => t.part === "tray").map((t) => t.stack));
  for (const stack of stacks) {
    const list = trays
      .filter((t) => t.part === "tray" && t.stack === stack)
      .sort((a, b) => a.level - b.level);
    const raise = new Map<TraySpec, U>(
      list.map((t) => {
        const upper =
          t.level > 0 && settings.lip.enabled ? settings.lip.height + UPPER_TRAY_MIN_ABOVE_LIP : 0;
        const least = Math.max(chamferMinimums(settings, t.level).h, upper);
        // A spare is filler, not content: it may sit at the tray floor (older layouts) and must not
        // veto the split. It is clamped to the shortened tray's floor below. A tray of nothing but
        // spares has no content to size against, so it is left as it is.
        const content = t.compartments.filter((c) => c.kind !== "spare");
        const free = Math.min(...content.map((c) => c.floorZ - t.floor), t.h - least);
        const u = locked.has(t.key) || content.length === 0 ? 0 : toUFloor(Math.max(0, free));
        return [t, roundDownTo(u, layer)];
      }),
    );
    let total = [...raise.values()].reduce((a, v) => a + v, 0);
    let over = roundUpTo(Math.max(0, total - limit), layer);
    for (const t of [...list].reverse()) {
      const give = Math.min(raise.get(t) ?? 0, over);
      raise.set(t, (raise.get(t) ?? 0) - give);
      over -= give;
      total -= give;
    }
    const bottom = list[0];
    if (!bottom || total < toU(MIN_RISER)) {
      continue;
    }
    let below: U = 0;
    for (const t of list) {
      const cut = raise.get(t) ?? 0;
      const shift = toMm(total - below);
      const parts: TraySpec[] = [
        {
          ...t,
          z: roundMm(t.z + shift),
          h: roundMm(t.h - toMm(cut)),
          compartments: t.compartments.map((c) => ({
            ...c,
            floorZ: roundMm(
              c.kind === "spare" ? Math.max(t.floor, c.floorZ - toMm(cut)) : c.floorZ - toMm(cut),
            ),
          })),
        },
      ];
      for (const s of trays.filter((x) => x.part === "spacer" && x.key === `${t.key}:spacer`)) {
        out.set(s, [{ ...s, z: roundMm(s.z + shift - toMm(cut)) }]);
      }
      if (t === bottom) {
        parts.push(riserSpec(t, toMm(total), settings.leftover));
      }
      out.set(t, parts);
      below += cut;
    }
  }
  return trays.flatMap((t) => out.get(t) ?? [t]);
}
