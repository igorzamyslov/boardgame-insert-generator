import { buildable } from "../geometry/buildable";
import { bottomMinimums } from "../model/lip";
import type { Lock, Printer, Settings, TraySpec } from "../model/types";
import {
  MIN_RISER_POCKET,
  MIN_SPARE,
  RISER_SUFFIX,
  UPPER_TRAY_MIN_ABOVE_LIP,
} from "../sizing/constants";
import { roundDownTo, roundMm, roundUpTo, toMm, toU, toUCeil, toUFloor, type U } from "./units";

/** What splitRisers reads from a project. */
export interface RiserInputs {
  settings: Settings;
  printer: Printer;
  locks: readonly Lock[];
}

/**
 * The riser under a stack (spec §3 rule 2): the height its trays give up, as a part of its own
 * with the bottom tray's footprint. It follows the leftover style: a solid block, or an open
 * walled box with a floor (a solid block when it is too small to open: narrower than MIN_SPARE
 * inside, or with a pocket shallower than MIN_RISER_POCKET).
 *
 * With `lipped` it carries the locating lip on its rim, as a lower tray does, and the bottom tray
 * on it has the groove (splitRisers sets `onRiser` on it): the rim between layers holds the first
 * layer as it holds every other. Its wall is then a lipped tray's (the lip and the ledge the tray
 * on it rests on) and the pocket starts inside it. The lip stands above `h`, as a tray's does.
 */
function riserSpec(
  bottom: TraySpec,
  h: number,
  o: { leftover: Settings["leftover"]; lipped: boolean; settings: Settings },
): TraySpec {
  const { wall, floor } = bottom;
  const { lip } = o.settings;
  const inner = o.lipped ? toMm(toUCeil(Math.max(wall, lip.thickness + lip.ledge))) : wall;
  const w = roundMm(bottom.w - 2 * inner);
  const d = roundMm(bottom.d - 2 * inner);
  const solid =
    o.leftover === "solid" || Math.min(w, d) < MIN_SPARE || h - floor < MIN_RISER_POCKET;
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
    lip: o.lipped,
    solid,
    compartments: solid
      ? []
      : [{ x: inner, y: inner, w, d, floorZ: floor, kind: "spare", contents: "", features: [] }],
  };
}

/** What splitStack needs besides the stack's own trays. */
interface Split {
  readonly settings: Settings;
  readonly printer: Printer;
  readonly locked: ReadonlySet<string>;
  /** The printer's layer height, units (at least 1). */
  readonly layer: U;
}

/**
 * The parts one stack becomes with a riser under it, keyed by the stored tray each replaces (a
 * tray becomes itself, shortened and raised, and the bottom one the riser as well; a spacer and an
 * in-level filler follow their tray), or null when the stack gets no riser this way. `trays` is the
 * whole stored layout (spacers and fillers are found in it), `list` the stack's own trays from the
 * bottom.
 *
 * `lipped`: the riser carries the lip and the bottom tray stands on it with a groove, as a tray
 * above level 0 does. The bottom tray is then an upper tray in what it must keep (height at least
 * lip.height + UPPER_TRAY_MIN_ABOVE_LIP and what its groove needs), the riser's lip stands above
 * it within the bed, and every part is one planTray builds: a tray with too thin a wall for a
 * groove (one alone in its stack has the plain 1.6 mm), too low, or with cuts that would leave too
 * little of it, is not offered one (null).
 */
function splitStack(
  trays: readonly TraySpec[],
  list: readonly TraySpec[],
  stack: number,
  lipped: boolean,
  c: Split,
): Map<TraySpec, TraySpec[]> | null {
  const { settings, printer } = c;
  const bottom = list[0];
  if (!bottom) {
    return null;
  }
  const limit = roundDownTo(toU(printer.bedZ) - (lipped ? toU(settings.lip.height) : 0), c.layer);
  // The least height a tray keeps: what its bottom edge asks, and for one standing on a lipped part
  // (above level 0, or the bottom one on a lipped riser) lip.height + UPPER_TRAY_MIN_ABOVE_LIP.
  const leastOf = (t: TraySpec): number => {
    const upper = t.level > 0 || (lipped && t === bottom);
    return Math.max(
      bottomMinimums(settings, upper ? Math.max(1, t.level) : t.level).h,
      upper && settings.lip.enabled ? settings.lip.height + UPPER_TRAY_MIN_ABOVE_LIP : 0,
    );
  };
  const raise = new Map<TraySpec, U>(
    list.map((t) => {
      // A spare is filler, not content: a layout stored before geometry 0.5.1 can hold one in a
      // tray, standing at the tray floor, and it must not veto the split. It is clamped to the shortened tray's floor below. A tray of nothing but
      // spares has no content to size against, so it is left as it is.
      const content = t.compartments.filter((x) => x.kind !== "spare");
      // A divided well's floor keeps the depth of its slots, which no riser may take.
      const slotted = (x: TraySpec["compartments"][number]): number =>
        Math.max(0, ...x.features.map((f) => (f.type === "dividerSlot" ? f.depth : 0)));
      const free = Math.min(
        ...content.map((x) => x.floorZ - t.floor - slotted(x)),
        t.h - leastOf(t),
      );
      const u = c.locked.has(t.key) || content.length === 0 ? 0 : toUFloor(Math.max(0, free));
      return [t, roundDownTo(u, c.layer)];
    }),
  );
  let total = [...raise.values()].reduce((a, v) => a + v, 0);
  let over = roundUpTo(Math.max(0, total - limit), c.layer);
  for (const t of [...list].reverse()) {
    const give = Math.min(raise.get(t) ?? 0, over);
    raise.set(t, (raise.get(t) ?? 0) - give);
    over -= give;
    total -= give;
  }
  if (total < Math.max(toU(settings.minRiser), toU(bottomMinimums(settings, 0).h))) {
    return null;
  }
  // The bottom tray stands on the riser's lip as an upper tray stands on a lower one's, and must
  // be as tall as one (a tray already lower than that cannot be given a groove).
  if (lipped && bottom.h - toMm(raise.get(bottom) ?? 0) < leastOf(bottom) - 1e-9) {
    return null;
  }
  const made = new Map<TraySpec, TraySpec[]>();
  let riser: TraySpec | null = null;
  let below: U = 0;
  for (const t of list) {
    const cut = raise.get(t) ?? 0;
    const shift = toMm(total - below);
    const part: TraySpec = {
      ...t,
      z: roundMm(t.z + shift),
      h: roundMm(t.h - toMm(cut)),
      compartments: t.compartments.map((x) => ({
        ...x,
        floorZ: roundMm(
          x.kind === "spare" ? Math.max(t.floor, x.floorZ - toMm(cut)) : x.floorZ - toMm(cut),
        ),
      })),
    };
    if (t === bottom && lipped) {
      part.onRiser = true;
    }
    const parts: TraySpec[] = [part];
    for (const s of trays.filter((x) => x.part === "spacer" && x.key === `${t.key}:spacer`)) {
      made.set(s, [{ ...s, z: roundMm(s.z + shift - toMm(cut)) }]);
    }
    for (const f of trays.filter(
      (x) => x.part === "leftover" && x.stack === stack && x.level === t.level,
    )) {
      made.set(f, [
        {
          ...f,
          z: roundMm(f.z + shift),
          h: roundMm(f.h - shift),
          compartments: f.compartments.map((x) => ({
            ...x,
            floorZ: roundMm(Math.max(f.floor, x.floorZ - shift)),
          })),
        },
      ]);
    }
    if (t === bottom) {
      riser = riserSpec(t, toMm(total), { leftover: settings.leftover, lipped, settings });
      parts.push(riser);
    }
    made.set(t, parts);
    below += cut;
  }
  if (lipped && riser && !buildable([riser, ...(made.get(bottom)?.slice(0, 1) ?? [])], settings)) {
    return null;
  }
  return made;
}

/**
 * The parts to print for a stored layout (spec §3 rule 2, §6.2). The stored layout pads a stack to
 * the top plane with a raised floor in its trays; printed, that height is better a part of its
 * own. A stack whose trays together have at least `settings.minRiser` of floor raised in every
 * compartment (and at least what a level 0 part with the bottom chamfer can be high) gets a riser
 * under its bottom tray, and the trays lose that floor, so the heights still add up exactly. A
 * riser is derived, not stored: it is a pure function of the stored trays and these inputs, so a
 * stored layout (and a share link) is the same with or without it.
 *
 * With the lip on the riser carries it, and the bottom tray on it has the groove (`onRiser`): the
 * rim between layers is the same between the riser and the first tray as between any two trays.
 * Where the bottom tray cannot take a groove (see splitStack) the riser stays plain and the tray
 * as it was, which is the only way a tray alone in its stack can have one: its 1.6 mm wall has no
 * room for a groove, and the wells are fixed by the stored layout.
 *
 * Only whole layers move, a tray never goes below the height it needs as a lipped, chamfered
 * upper tray, a size-locked tray keeps its height, and the riser (and its lip) is never taller
 * than the print bed (the layout checks each tray's height, not the sum of their raises). Nothing
 * is split with `fillToTop` off. Spacers follow their tray, and so does a filler standing beside it
 * in the same stack level (part "leftover" with its tray's stack and a level above 0): it stands
 * from that level's floor to the top of the stack, so it moves up with the tray and gives up the
 * height of every level from its own up, keeping its top on the plane; it neither blocks nor
 * changes the split, whatever its own compartments hold. Other parts are returned as they are.
 */
export function splitRisers(trays: readonly TraySpec[], o: RiserInputs): TraySpec[] {
  const { settings, printer } = o;
  if (!settings.fillToTop) {
    return [...trays];
  }
  const c: Split = {
    settings,
    printer,
    locked: new Set(o.locks.flatMap((l) => (l.kind === "size" ? [l.trayKey] : []))),
    layer: Math.max(1, toU(printer.layerHeight)),
  };
  const out = new Map<TraySpec, TraySpec[]>();
  const stacks = new Set(trays.filter((t) => t.part === "tray").map((t) => t.stack));
  for (const stack of stacks) {
    const list = trays
      .filter((t) => t.part === "tray" && t.stack === stack)
      .sort((a, b) => a.level - b.level);
    for (const lipped of settings.lip.enabled ? [true, false] : [false]) {
      const made = splitStack(trays, list, stack, lipped, c);
      if (made) {
        made.forEach((parts, t) => out.set(t, parts));
        break;
      }
    }
  }
  return trays.flatMap((t) => out.get(t) ?? [t]);
}
