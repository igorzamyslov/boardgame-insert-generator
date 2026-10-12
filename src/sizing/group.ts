import { groupOf } from "../model/defaults";
import { POST_MM } from "../model/settings";
import type { Access, Component, Notice, Settings } from "../model/types";
import { settingsValid } from "../model/validate";
import { displayName, type StorageOption } from "./common";
import { componentOptions, isLoose } from "./component";
import { CutFitError } from "./errors";
import { bulkFallback } from "./fallback";
import { minOuter } from "./realize";
import { realizeTray } from "./realize";
import type { FeatureReq, RealizeOptions, TrayPartReq, TrayRequirement } from "./types";
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
  binned: boolean; // its options are its bulk fallback: loose in scoop bins
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

/** Every option layout may build a part at: unlipped or lipped, on the ground or stacked. */
const OPTIONS: readonly RealizeOptions[] = [
  { lipped: false, level: 0 },
  { lipped: true, level: 0 },
  { lipped: false, level: 1 },
  { lipped: true, level: 1 },
];

/**
 * The CutFitError of the first part that realizeTray refuses at its minOuter at some option, or
 * null when every part realizes (roadmap §4.2, §4.7). Whether a part has its cuts depends on its
 * compartments and their order, not on the outer, and every upper level has the same chamfer as
 * level 1, so such a part is refused everywhere and one that passes realizes everywhere.
 */
function cutFitError(parts: readonly TrayPartReq[], settings: Settings): CutFitError | null {
  for (const part of parts) {
    for (const opts of OPTIONS) {
      try {
        realizeTray(part, minOuter(part, settings, opts), settings, opts);
      } catch (error) {
        if (error instanceof CutFitError) {
          return error;
        }
        throw error;
      }
    }
  }
  return null;
}

/** Why a component's compartments get no finger cut, as the start of a notice. */
function noRoom(name: string, error: CutFitError): string {
  return `${name}: no tray arrangement leaves room for a finger cutout of at least ${error.minWidth} mm by ${error.contents.join(", ")} with ${POST_MM} mm of wall beside it`;
}

/** The warning for a requirement none of whose variants gives every compartment a cut. */
function noFingerSlot(error: CutFitError, key: string, usable: readonly Usable[]): Notice {
  const stuck = usable.find((u) => error.componentIds.includes(u.c.id)) ?? usable[0];
  const what = usable.length > 1 ? `the group "${key}"` : "it";
  // Bulk has no other storage: only its finger cuts (on by choice) can go.
  const advice = stuck?.c.kind === "bulk" ? "Turn its finger cuts off." : "Try another storage.";
  return {
    level: "warning",
    code: "sizing.noFingerSlot",
    message: `${noRoom(stuck ? displayName(stuck.c) : key, error)}, so ${what} is left out. ${advice}`,
    path: `/components/${stuck?.index ?? 0}`,
  };
}

/** What a bin has, from its features: "a bin with a curved floor", or "a plain bin". */
function binWords(features: readonly FeatureReq[]): string {
  const has = (type: FeatureReq["type"]) => features.some((f) => f.type === type);
  const parts = [
    ...(has("wallCutout") ? ["a finger cut"] : []),
    ...(has("scoop") ? ["a curved floor"] : []),
    ...(has("cornerRelief") ? ["corner reliefs"] : []),
  ];
  if (parts.length === 0) {
    return "a plain bin";
  }
  const last = parts.pop();
  return `a bin with ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}`;
}

/**
 * The notice for a component stored in bins instead (its bulk fallback), saying what its bins
 * have (review 3, I1): the features of its first compartment in the preferred variant.
 */
function binnedInstead(u: Usable, error: CutFitError, requirement: TrayRequirement): Notice {
  const bin = requirement.variants[0]?.parts
    .flatMap((p) => p.compartments)
    .find((c) => c.componentId === u.c.id);
  return {
    level: "info",
    code: "sizing.noFingerSlot",
    message: `${noRoom(displayName(u.c), error)}, so it is stored loose in ${binWords(bin?.features ?? [])} instead.`,
    path: `/components/${u.index}`,
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
        usable.push({ c, index, options: result.options, binned: false });
      }
    }
    const requirement = requirementOf(key, usable);
    if (requirement !== null) {
      sized.push({ requirement, usable });
    }
  }
  return sized;
}

/** The requirement of a bucket's usable members, or null when it has no variants. */
function requirementOf(key: string, usable: readonly Usable[]): TrayRequirement | null {
  if (usable.length === 0) {
    return null;
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
    return null;
  }
  return {
    key,
    componentIds: usable.map((u) => u.c.id),
    access: mostFrequentAccess(usable.map((u) => u.c)),
    loose: usable.some((u) => u.binned || isLoose(u.c)),
    variants,
  };
}

/** The requirement's variants whose every part gets its cuts, and the error of each other one. */
function withCuts(
  requirement: TrayRequirement,
  settings: Settings,
): { kept: TrayRequirement; errors: CutFitError[] } {
  const found = requirement.variants.map((v) => cutFitError(v.parts, settings));
  return {
    kept: { ...requirement, variants: requirement.variants.filter((_, i) => found[i] === null) },
    errors: found.filter((e) => e !== null),
  };
}

/**
 * Sizes components into tray requirements: one per group (or per ungrouped component), in the
 * order each key first appears. Sizing assumes a valid project: with out-of-range settings it
 * returns nothing, and invalid components (including perPlayer inside a group) have no options,
 * so they are left out without notices of their own. Variants with a compartment that gets no
 * finger cut (cutFitError) are dropped, the rest keep their order. When none is left, the tiles,
 * minis (pockets) and custom members left without a cut fall back to scoop bins (bulkFallback),
 * each with an info `sizing.noFingerSlot`; a requirement still without variants is left out with
 * a `sizing.noFingerSlot` warning (spec §7.1, roadmap §4.2, §4.7).
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
    const first = withCuts(requirement, settings);
    if (first.kept.variants.length > 0) {
      requirements.push(first.kept);
      continue;
    }
    const stuck = (u: Usable): CutFitError | undefined =>
      first.errors.find((e) => e.componentIds.includes(u.c.id));
    const fallen = usable.map((u): Usable => {
      const options = stuck(u) ? bulkFallback(u.c, settings) : null;
      return options === null ? u : { ...u, options, binned: true };
    });
    const binned = fallen.filter((u) => u.binned);
    const retried = binned.length > 0 ? requirementOf(requirement.key, fallen) : null;
    const second = retried === null ? null : withCuts(retried, settings);
    if (second !== null && second.kept.variants.length > 0) {
      requirements.push(second.kept);
      for (const u of binned) {
        const error = stuck(u);
        if (error) {
          notices.push(binnedInstead(u, error, second.kept));
        }
      }
      continue;
    }
    const preferred = second?.errors[0] ?? first.errors[0];
    if (preferred) {
      notices.push(noFingerSlot(preferred, requirement.key, fallen));
    }
  }
  return { requirements, notices };
}
