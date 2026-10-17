// src/viewer/transform.ts
import { parentKey } from "../instructions/numbering";
import { effective } from "../model/settings";
import type { Box, Settings, TraySpec } from "../model/types";
import type { BoxOutline } from "./types";

export const EXPLODE_MM = 40;

/** How far apart trays move sideways at full explode, as a share of their distance from the centre. */
export const EXPLODE_SPREAD = 0.5;

/**
 * How near the centre a part's own spread displacement (mm) may be before it counts as too
 * little to read as moving, and drops instead. Well under the spread of any tray that sits
 * visibly off the middle, so those are untouched.
 */
export const CENTRED_SPREAD_MM = 10;

/** How far a card spacer rises out of its tray at full explode; well under one level's lift. */
export const SPACER_LIFT_MM = 20;

/**
 * A tray's position at `explode` (0..1). Upper layers lift by EXPLODE_MM per level, and every
 * tray also moves away from `center` (the box's middle in x, y) so that a single layer, which
 * has nothing to lift, comes apart too. Without a centre only the lift applies.
 *
 * `anchor` is the part the sideways move is measured from, and defaults to the part itself. A
 * card spacer passes its tray, because the move grows with the distance from the box centre:
 * measured from its own centre a spacer drifts relative to the tray it sits in and slides
 * through its wall. Measured from the tray, the two keep station, and the spacer instead rises
 * clear so it still reads as a separate part.
 *
 * The sideways move is proportional to the distance from the centre, so a part centred on the
 * box does not move sideways, and on the bottom level it does not lift either: it would stay put
 * while everything else separates. A merged filler that wraps around the trays is exactly that
 * (its bounding box is nearly the whole footprint). Such a part drops by up to EXPLODE_MM
 * instead, one level's step below the floor, which is how an exploded diagram shows the frame
 * the rest sits in; sideways is no way out, as it surrounds the other parts. The drop is keyed
 * to the geometry, not to `merged`: it is EXPLODE_MM at no spread, fades out linearly as the
 * spread displacement (measured from the anchor) grows to CENTRED_SPREAD_MM, and is zero beyond,
 * so a part that already spreads visibly moves exactly as before and nothing jumps. Upper levels
 * already lift, so only level 0 drops, and nothing at all moves at `explode` 0.
 */
export function trayPosition(
  spec: TraySpec,
  explode: number,
  center?: readonly [number, number],
  anchor?: TraySpec,
): [number, number, number] {
  const from = anchor ?? spec;
  const dx = center ? from.x + from.w / 2 - center[0] : 0;
  const dy = center ? from.y + from.d / 2 - center[1] : 0;
  const lift = spec.part === "spacer" || spec.part === "divider" ? SPACER_LIFT_MM * explode : 0;
  const spread = Math.hypot(dx, dy) * EXPLODE_SPREAD;
  const centred = center && spec.level === 0 ? Math.max(0, 1 - spread / CENTRED_SPREAD_MM) : 0;
  return [
    spec.x + dx * explode * EXPLODE_SPREAD,
    spec.y + dy * explode * EXPLODE_SPREAD,
    spec.z + spec.level * explode * EXPLODE_MM + lift - centred * explode * EXPLODE_MM,
  ];
}

export function isVisible(spec: TraySpec, maxLevel: number | null): boolean {
  return maxLevel === null || spec.level <= maxLevel;
}

/** Tray coordinates start after boxClearance, so the inner box starts at −boxClearance. */
export function boxOutline(box: Box, settings: Settings): BoxOutline {
  const bc = effective(settings).boxClearance;
  return { min: [-bc, -bc, 0], size: [box.innerWidth, box.innerDepth, box.innerHeight] };
}

/** The middle of the box in x, y: the point trays move away from when they spread apart. */
export function outlineCenter(o: BoxOutline): [number, number] {
  return [o.min[0] + o.size[0] / 2, o.min[1] + o.size[1] / 2];
}

/**
 * The part `spec` is spread apart with (the `anchor` of trayPosition): a card spacer or divider
 * travels with the tray it stands in, everything else with itself. Needed wherever trays are
 * arranged, so the 3D view and the assembly page's exploded picture agree.
 */
export function anchorOf(spec: TraySpec, byKey: ReadonlyMap<string, TraySpec>): TraySpec {
  return spec.part === "spacer" || spec.part === "divider"
    ? (byKey.get(parentKey(spec)) ?? spec)
    : spec;
}

/** The glow of the selected tray: the one tray the bar is for. */
export const SELECTED_EMISSIVE = 0x444444;

/** The softer glow of a tray whose rail row is pointed at or focused: quieter than the selected one. */
export const LIT_EMISSIVE = 0x383838;

/**
 * A tray's emissive colour: the selected tray's own glow, else the lit one while its component's
 * rail row is pointed at, else none. The selected tray keeps its stronger glow while lit.
 */
export function emissiveOf(key: string, selected: string | null, lit: ReadonlySet<string>): number {
  if (key === selected) {
    return SELECTED_EMISSIVE;
  }
  return lit.has(key) ? LIT_EMISSIVE : 0x000000;
}
