import { groupOf } from "../model/defaults";
import type { Access, Component, Notice, Settings } from "../model/types";
import { SETTING_RANGES } from "../model/validate";
import type { StorageOption } from "./common";
import { componentOptions, isLoose } from "./component";
import type { TrayRequirement } from "./types";
import { buildVariants } from "./variants";

const ACCESS_RANK: Record<Access, number> = { often: 0, sometimes: 1, setup: 2 };

interface Member {
  c: Component;
  index: number;
}

interface Usable {
  c: Component;
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

function settingsInRange(settings: Settings): boolean {
  return SETTING_RANGES.every((r) => {
    const v = r.get(settings);
    return v >= r.min && v <= r.max;
  });
}

/**
 * Sizes components into tray requirements: one per group (or per ungrouped component), in the
 * order each key first appears. Sizing assumes a valid project: with out-of-range settings it
 * returns nothing, and invalid components (including perPlayer inside a group) have no options,
 * so they are left out without notices of their own.
 */
export function size(
  components: Component[],
  settings: Settings,
): { requirements: TrayRequirement[]; notices: Notice[] } {
  if (!settingsInRange(settings)) {
    return { requirements: [], notices: [] };
  }
  const notices: Notice[] = [];
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

  const requirements: TrayRequirement[] = [];
  for (const [key, members] of buckets) {
    const usable: Usable[] = [];
    for (const { c, index } of members) {
      const result = componentOptions(c, settings, index);
      notices.push(...result.notices);
      if (result.options.length > 0) {
        usable.push({ c, options: result.options });
      }
    }
    if (usable.length === 0) {
      continue;
    }
    // perPlayer is only valid on an ungrouped component, so it is always alone in its bucket.
    const only = usable.length === 1 ? usable[0] : undefined;
    requirements.push({
      key,
      componentIds: usable.map((u) => u.c.id),
      access: mostFrequentAccess(usable.map((u) => u.c)),
      loose: usable.some((u) => isLoose(u.c)),
      variants: buildVariants({
        key,
        options: combineOptions(usable.map((u) => u.options)),
        players: only?.c.perPlayer?.players ?? null,
      }),
    });
  }
  return { requirements, notices };
}
