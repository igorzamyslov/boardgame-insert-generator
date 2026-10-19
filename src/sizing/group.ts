import { copiesOf, DEFAULT_GROUP_NAME } from "../model/groups";
import { POST_MM } from "../model/settings";
import type { Access, Component, Group, Notice, Settings } from "../model/types";
import { settingsValid } from "../model/validate";
import { displayName, type StorageOption } from "./common";
import { componentOptions, isLoose } from "./component";
import { CutFitError } from "./errors";
import { bulkFallback } from "./fallback";
import { minOuter } from "./realize";
import { realizeTray } from "./realize";
import type {
  CompartmentReq,
  FeatureReq,
  RealizeOptions,
  TrayPartReq,
  TrayRequirement,
} from "./types";
import { buildVariants } from "./variants";

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
function noFingerSlot(
  error: CutFitError,
  key: string,
  usable: readonly Usable[],
  group: Group | undefined,
): Notice {
  const stuck = usable.find((u) => error.componentIds.includes(u.c.id)) ?? usable[0];
  const what = group ? `the group "${groupName(group)}"` : "it";
  // Bulk has no other storage: only its finger cuts (on by choice) can go.
  const advice = stuck?.c.kind === "bulk" ? "Turn its finger cuts off." : "Try another storage.";
  return {
    level: "warning",
    code: "sizing.noFingerSlot",
    message: `${noRoom(stuck ? displayName(stuck.c) : key, error)}, so ${what} is left out. ${advice}`,
    path: `/components/${stuck?.index ?? 0}`,
  };
}

/** A group's name as the person sees it: "Group" when it has none. */
function groupName(group: Group): string {
  return group.name === "" ? DEFAULT_GROUP_NAME : group.name;
}

/**
 * The warning for a member whose finger cuts member order takes away: another member stands before
 * it, so no tray arrangement leaves its compartments a free wall along the row. The tray is kept,
 * without that member's cuts (groups spec §6.5).
 */
function orderBlocked(u: Usable, group: Group): Notice {
  return {
    level: "warning",
    code: "sizing.noFingerSlot",
    message: `${displayName(u.c)} has no finger cut here. Move it to the start of ${groupName(group)} for one.`,
    path: `/components/${u.index}`,
  };
}

/** What a bin has, from its features: "a bin with a curved floor", or "a plain tray". */
function binWords(features: readonly FeatureReq[]): string {
  const has = (type: FeatureReq["type"]) => features.some((f) => f.type === type);
  const parts = [
    ...(has("wallCutout") ? ["a finger cut"] : []),
    ...(has("scoop") ? ["a curved floor"] : []),
    ...(has("cornerRelief") ? ["corner reliefs"] : []),
  ];
  if (parts.length === 0) {
    return "a plain tray";
  }
  const last = parts.pop();
  return `a tray with ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}`;
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
  copies: number;
  access: Access;
  group: Group | undefined;
}

/**
 * One requirement per bucket, with every variant buildVariants enumerates. A bucket is a group,
 * with its members in `memberIds` order (not list order), or an item in none. Buckets come in the
 * order each first appears in `components`. A group with no usable member has no requirement.
 */
function sizeBuckets(
  components: Component[],
  settings: Settings,
  groups: readonly Group[],
  notices: Notice[],
): Sized[] {
  const byId = new Map<string, Member>();
  components.forEach((c, index) => byId.set(c.id, { c, index }));
  const groupOf = new Map<string, Group>();
  for (const g of groups) {
    for (const id of g.memberIds) {
      if (!groupOf.has(id)) {
        groupOf.set(id, g);
      }
    }
  }
  const buckets = new Map<string, { group: Group | undefined; members: Member[] }>();
  for (const { c, index } of byId.values()) {
    const group = groupOf.get(c.id);
    const key = group?.id ?? c.id;
    if (!buckets.has(key)) {
      const members =
        group === undefined
          ? [{ c, index }]
          : group.memberIds.flatMap((id) => {
              const member = byId.get(id);
              return member === undefined || groupOf.get(id) !== group ? [] : [member];
            });
      buckets.set(key, { group, members });
    }
  }

  const sized: Sized[] = [];
  for (const [key, { group, members }] of buckets) {
    const usable: Usable[] = [];
    for (const { c, index } of members) {
      const result = componentOptions(c, settings, index);
      notices.push(...result.notices);
      if (result.options.length > 0) {
        usable.push({ c, index, options: result.options, binned: false });
      }
    }
    const first = members[0];
    const copies = first === undefined ? 1 : copiesOf({ groups }, first.c);
    const access = group?.access ?? first?.c.access ?? "setup";
    const requirement = requirementOf(key, usable, copies, access);
    if (requirement !== null) {
      sized.push({ requirement, usable, copies, access, group });
    }
  }
  return sized;
}

/** The requirement of a bucket's usable members, or null when it has no variants. */
function requirementOf(
  key: string,
  usable: readonly Usable[],
  copies: number,
  access: Access,
): TrayRequirement | null {
  if (usable.length === 0) {
    return null;
  }
  const variants = buildVariants({
    key,
    options: combineOptions(usable.map((u) => u.options)),
    copies,
  });
  // Defensive: options without compartments have no variants, and a requirement needs at least 1.
  if (variants.length === 0) {
    return null;
  }
  return {
    key,
    componentIds: usable.map((u) => u.c.id),
    access,
    loose: usable.some((u) => u.binned || isLoose(u.c)),
    variants,
  };
}

/**
 * The requirement's variants whose every part gets its cuts, and the error of each other one.
 * Every copy is the same arrangement, so only the first copy's parts are tried.
 */
function withCuts(
  requirement: TrayRequirement,
  copies: number,
  settings: Settings,
): { kept: TrayRequirement; errors: CutFitError[] } {
  const found = requirement.variants.map((v) =>
    cutFitError(v.parts.slice(0, v.parts.length / copies), settings),
  );
  return {
    kept: { ...requirement, variants: requirement.variants.filter((_, i) => found[i] === null) },
    errors: found.filter((e) => e !== null),
  };
}

/** The member with its finger cuts off: every compartment's wall cutouts removed. */
function withoutCuts(u: Usable): Usable {
  const strip = (c: CompartmentReq): CompartmentReq => ({
    ...c,
    features: c.features.filter((f) => f.type !== "wallCutout"),
  });
  return {
    ...u,
    options: u.options.map((o) => ({ ...o, blocks: o.blocks.map((b) => b.map(strip)) })),
  };
}

/**
 * The members of a group named by `errors` that would get their cut if they stood first: member
 * order, not the member, is what blocks them (groups spec §6.5). A member that gets no cut even
 * first (too small, say) is not one of them.
 */
function blockedByOrder(
  usable: readonly Usable[],
  errors: readonly CutFitError[],
  of: { key: string; copies: number; access: Access },
  settings: Settings,
): Usable[] {
  const { key, copies, access } = of;
  if (usable.length < 2) {
    return [];
  }
  return usable.filter((u) => {
    if (u.binned || !errors.some((e) => e.componentIds.includes(u.c.id))) {
      return false;
    }
    const first = requirementOf(key, [u, ...usable.filter((o) => o !== u)], copies, access);
    return (
      first !== null &&
      first.variants.some((v) => {
        const error = cutFitError(v.parts.slice(0, v.parts.length / copies), settings);
        return error === null || !error.componentIds.includes(u.c.id);
      })
    );
  });
}

/**
 * The requirement of one bucket with only the variants that give every cut, or null when none
 * can. While none does, each pass takes the members stuck without a cut out of the way: those
 * that member order blocks lose their cuts (kept, with a warning), the others go to their bulk
 * fallback (kept, with an info), and the requirement is built again. A requirement still without
 * a variant when nothing is left to change is left out with a warning.
 */
function settle(sized: Sized, settings: Settings, notices: Notice[]): TrayRequirement | null {
  const { copies, access, group } = sized;
  const key = sized.requirement.key;
  let usable = sized.usable;
  let requirement: TrayRequirement | null = sized.requirement;
  const without: Usable[] = [];
  const binned: { u: Usable; error: CutFitError }[] = [];
  let last: CutFitError | undefined;
  // Each pass turns at least one member from what it was, so there are at most as many as
  // members (twice, for a member that is both).
  for (let pass = 0; requirement !== null && pass <= 2 * usable.length; pass++) {
    const found = withCuts(requirement, copies, settings);
    if (found.kept.variants.length > 0) {
      if (group) {
        notices.push(...without.map((u) => orderBlocked(u, group)));
      }
      for (const { u, error } of binned) {
        notices.push(binnedInstead(u, error, found.kept));
      }
      return found.kept;
    }
    last = found.errors[0];
    const blocked = group
      ? blockedByOrder(usable, found.errors, { key, copies, access }, settings)
      : [];
    let changed = false;
    if (blocked.length > 0) {
      usable = usable.map((u) => (blocked.includes(u) ? withoutCuts(u) : u));
      without.push(...blocked);
      changed = true;
    } else {
      usable = usable.map((u): Usable => {
        const error = u.binned
          ? undefined
          : found.errors.find((e) => e.componentIds.includes(u.c.id));
        const options = error ? bulkFallback(u.c, settings) : null;
        if (options === null || error === undefined) {
          return u;
        }
        changed = true;
        const fallen: Usable = { ...u, options, binned: true };
        binned.push({ u: fallen, error });
        return fallen;
      });
    }
    if (!changed) {
      break;
    }
    requirement = requirementOf(key, usable, copies, access);
  }
  if (last !== undefined) {
    notices.push(noFingerSlot(last, key, usable, group));
  }
  return null;
}

/**
 * Sizes components into tray requirements: one per group (or per ungrouped component), in the
 * order each key first appears, a group's members in `memberIds` order. Sizing assumes a valid
 * project: with out-of-range settings it returns nothing, and invalid components have no options,
 * so they are left out without notices of their own. Variants with a compartment that gets no
 * finger cut (cutFitError) are dropped, the rest keep their order. When none is left:
 *
 * - a member of a group that member order blocks (it would get its cut first) is kept without its
 *   cuts, with a `sizing.noFingerSlot` warning: order is a promise, the tray is never dropped;
 * - the tiles, minis (pockets) and custom members left without a cut fall back to scoop bins
 *   (bulkFallback), each with an info `sizing.noFingerSlot`;
 * - a requirement still without variants is left out with a `sizing.noFingerSlot` warning (spec
 *   §7.1, roadmap §4.2, §4.7).
 */
export function size(
  components: Component[],
  settings: Settings,
  groups: readonly Group[] = [],
): { requirements: TrayRequirement[]; notices: Notice[] } {
  if (!settingsValid(settings)) {
    return { requirements: [], notices: [] };
  }
  const notices: Notice[] = [];
  const requirements: TrayRequirement[] = [];
  for (const sized of sizeBuckets(components, settings, groups, notices)) {
    const requirement = settle(sized, settings, notices);
    if (requirement !== null) {
      requirements.push(requirement);
    }
  }
  return { requirements, notices };
}
