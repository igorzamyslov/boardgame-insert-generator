import { groupOf } from "../model/defaults";
import type { Access, Component, Notice, Settings } from "../model/types";
import { settingsValid } from "../model/validate";
import { displayName, type StorageOption } from "./common";
import { componentOptions, isLoose } from "./component";
import { SlotFitError } from "./errors";
import { minOuter } from "./realize";
import { realizeTray } from "./realize";
import type { RealizeOptions, TrayPartReq, TrayRequirement } from "./types";
import { buildVariants } from "./variants";

const ACCESS_RANK: Record<Access, number> = { often: 0, sometimes: 1, setup: 2 };

interface Member {
  c: Component;
  index: number;
}

interface Usable {
  c: Component;
  index: number;
  options: StorageOption[];
}

export function mostFrequentAccess(members: readonly Component[]): Access {
  let best: Access = "setup";
  for (const c of members) {
    if (ACCESS_RANK[c.access] < ACCESS_RANK[best]) {
      best = c.access;
    }
  }
  return best;
}

const GROUND: RealizeOptions = { lipped: false, level: 0 };

/**
 * The SlotFitError of the first part that realizeTray cannot realize at its minOuter (unlipped,
 * level 0), or null when every part realizes. minOuter is the footprint at which the part's
 * finger slots fit, searched up to fingerPocket.width wider than the layout needs; a part whose
 * slots fit at none of them is refused at every outer (roadmap §4.2, §4.7).
 */
function slotFitError(parts: readonly TrayPartReq[], settings: Settings): SlotFitError | null {
  for (const part of parts) {
    try {
      realizeTray(part, minOuter(part, settings, GROUND), settings, GROUND);
    } catch (error) {
      if (error instanceof SlotFitError) {
        return error;
      }
      throw error;
    }
  }
  return null;
}

/** The warning for a requirement none of whose variants fits its finger slots or cutouts. */
function noFingerSlot(
  error: SlotFitError,
  key: string,
  usable: readonly Usable[],
  settings: Settings,
): Notice {
  const stuck = usable.find((u) => error.componentIds.includes(u.c.id)) ?? usable[0];
  const what = usable.length > 1 ? `the group "${key}"` : "it";
  const name = stuck ? displayName(stuck.c) : key;
  const message =
    error.what === "cutout"
      ? `${name}: no tray arrangement leaves room for a finger cutout by ${error.contents.join(", ")} clear of the rounded outer corners, so ${what} is left out. Try another storage or a smaller bottom chamfer.`
      : `${name}: no tray arrangement leaves room for a finger slot of at least ${error.minWidth} mm by ${error.contents.join(", ")}, even up to ${settings.fingerPocket.width} mm wider, so ${what} is left out. Try another storage or a narrower finger pocket.`;
  return {
    level: "warning",
    code: "sizing.noFingerSlot",
    message,
    path: `/components/${stuck?.index ?? 0}`,
  };
}

export function combineOptions(lists: readonly StorageOption[][]): StorageOption[] {
  const count = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: count }, (_, s) => {
    const picked = lists.flatMap((list) => {
      const option = list[Math.min(s, list.length - 1)];
      return option === undefined ? [] : [option];
    });
    return { id: picked.map((o) => o.id).join("+"), blocks: picked.flatMap((o) => o.blocks) };
  });
}

interface Sized {
  requirement: TrayRequirement;
  usable: Usable[];
}

/** One requirement per bucket, with every variant buildVariants enumerates. */
function sizeBuckets(components: Component[], settings: Settings, notices: Notice[]): Sized[] {
  const buckets = new Map<string, Member[]>();
  components.forEach((c, index) => {
    const key = groupOf(c) ?? c.id;
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [{ c, index }]);
    } else {
      bucket.push({ c, index });
    }
  });

  const sized: Sized[] = [];
  for (const [key, members] of buckets) {
    const usable: Usable[] = [];
    for (const { c, index } of members) {
      const result = componentOptions(c, settings, index);
      notices.push(...result.notices);
      if (result.options.length > 0) {
        usable.push({ c, index, options: result.options });
      }
    }
    if (usable.length === 0) {
      continue;
    }
    // perPlayer is only valid on an ungrouped component, so it is always alone in its bucket.
    const only = usable.length === 1 ? usable[0] : undefined;
    const variants = buildVariants({
      key,
      options: combineOptions(usable.map((u) => u.options)),
      players: only?.c.perPlayer?.players ?? null,
    });
    // Defensive: options without compartments have no variants, and a requirement needs 1–8.
    if (variants.length === 0) {
      continue;
    }
    const requirement: TrayRequirement = {
      key,
      componentIds: usable.map((u) => u.c.id),
      access: mostFrequentAccess(usable.map((u) => u.c)),
      loose: usable.some((u) => isLoose(u.c)),
      variants,
    };
    sized.push({ requirement, usable });
  }
  return sized;
}

/**
 * Sizes components into tray requirements: one per group (or per ungrouped component), in the
 * order each key first appears. Sizing assumes a valid project: with out-of-range settings it
 * returns nothing, and invalid components (including perPlayer inside a group) have no options,
 * so they are left out without notices of their own. Variants whose finger slots do not fit at
 * minOuter (unlipped, level 0) are dropped, the rest keep their order; a requirement left without
 * variants is left out with a `sizing.noFingerSlot` warning (roadmap §4.2, §4.7).
 */
export function size(
  components: Component[],
  settings: Settings,
): { requirements: TrayRequirement[]; notices: Notice[] } {
  if (!settingsValid(settings)) {
    return { requirements: [], notices: [] };
  }
  const notices: Notice[] = [];
  const requirements: TrayRequirement[] = [];
  for (const { requirement, usable } of sizeBuckets(components, settings, notices)) {
    const errors = requirement.variants.map((v) => slotFitError(v.parts, settings));
    const variants = requirement.variants.filter((_, i) => errors[i] === null);
    const preferred = errors[0];
    if (variants.length === 0 && preferred) {
      notices.push(noFingerSlot(preferred, requirement.key, usable, settings));
    } else {
      requirements.push({ ...requirement, variants });
    }
  }
  return { requirements, notices };
}
