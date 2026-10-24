import type { Access, Component, Group } from "./types";

// Pure lookups over a project's groups (groups spec §3). Lives in the model: sizing, layout and the
// UI read groups through here, and the model imports none of them.

const ACCESS_RANK: Record<Access, number> = { often: 0, sometimes: 1, setup: 2 };

/**
 * The access a set of members gives their tray: the one reached for most often among them
 * (`often` beats `sometimes` beats `setup`). The group's own `access` starts from this when it is
 * made from a list of items (the 0.2.0 migration), and sizing used it before groups had their own.
 */
export function mostFrequentAccess(members: readonly { access: Access }[]): Access {
  let best: Access = "setup";
  for (const c of members) {
    if (ACCESS_RANK[c.access] < ACCESS_RANK[best]) {
      best = c.access;
    }
  }
  return best;
}

/** What a lookup needs of a project: its groups. */
interface Grouped {
  groups?: readonly Group[];
}

/** The group an item is a member of, or undefined when it is in none. */
export function groupOfItem(p: Grouped, itemId: string): Group | undefined {
  return p.groups?.find((g) => g.memberIds.includes(itemId));
}

/** The group with this id, or undefined when there is none (an item's id is not one). */
export function groupById(p: Grouped, id: string): Group | undefined {
  return p.groups?.find((g) => g.id === id);
}

/** The name a group shows when it has none. */
export const DEFAULT_GROUP_NAME = "Group";

/**
 * The name for a group added from Add: "Group", else "Group 2", "Group 3" … the first one no
 * group has. A group with no name shows as "Group", so it takes that name.
 */
export function nextGroupName(p: Grouped): string {
  const taken = new Set((p.groups ?? []).map((g) => g.name || DEFAULT_GROUP_NAME));
  let name = DEFAULT_GROUP_NAME;
  for (let n = 2; taken.has(name); n++) {
    name = `${DEFAULT_GROUP_NAME} ${n}`;
  }
  return name;
}

/** The key a component's requirement and its trays carry: its group's id, else its own id. */
export function requirementKeyOf(p: Grouped, c: Component): string {
  return groupOfItem(p, c.id)?.id ?? c.id;
}

/** How many separate trays the item (or its group) is printed as: the group's copies if grouped, else the item's, default 1. */
export function copiesOf(p: Grouped, c: Component): number {
  const group = groupOfItem(p, c.id);
  return (group ? group.copies : c.copies) ?? 1;
}

/** A tray key `<stem>:p<copy>:<part>…` taken apart; undefined for any other key ("leftover:0"). */
export function parseTrayKey(
  key: string,
): { stem: string; copy: number; part: number } | undefined {
  const m = /^(.+?):p(\d+):(\d+)(?::|$)/.exec(key);
  return m === null ? undefined : { stem: m[1] ?? "", copy: Number(m[2]), part: Number(m[3]) };
}

/** One place in the rail's list: an item, or a group's card. */
export type RailEntry = { kind: "item"; id: string } | { kind: "group"; id: string };

/**
 * The components in the order the list shows them: `listOrder` first, then any it lacks in
 * `components` order (an item just added is last). Ids in `listOrder` that name nothing are ignored.
 */
export function listed<C extends { id: string }>(
  components: readonly C[],
  listOrder: readonly string[] | undefined,
): C[] {
  if (listOrder === undefined || listOrder.length === 0) {
    return [...components];
  }
  const rank = new Map<string, number>();
  listOrder.forEach((id, i) => {
    if (!rank.has(id)) {
      rank.set(id, i);
    }
  });
  const known = components.filter((c) => rank.has(c.id));
  const rest = components.filter((c) => !rank.has(c.id));
  return [...known.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)), ...rest];
}

/**
 * The `listOrder` that puts an item at a place among the list's top-level entries (items and group
 * cards) other than its own: `index` counts those, and is clamped. A group's members follow its
 * `memberIds` order, wherever its card stands. Call it for an item that is not in a group (take it
 * out first).
 */
export function listOrderWith(
  p: { components: readonly Component[]; groups?: readonly Group[]; listOrder?: readonly string[] },
  itemId: string,
  index: number,
): string[] {
  const entries = railEntries(p).filter((e) => !(e.kind === "item" && e.id === itemId));
  const at = Math.max(0, Math.min(index, entries.length));
  entries.splice(at, 0, { kind: "item", id: itemId });
  const ids = new Set(p.components.map((c) => c.id));
  const order: string[] = [];
  for (const e of entries) {
    if (e.kind === "item") {
      order.push(e.id);
    } else {
      order.push(...(groupById(p, e.id)?.memberIds ?? []));
    }
  }
  const seen = new Set(order);
  return [...order, ...p.components.map((c) => c.id).filter((id) => !seen.has(id))].filter((id) =>
    ids.has(id),
  );
}

/**
 * What the rail lists, in order (spec §7.1): the items in `components` order, with a group's card
 * standing where its first member (in list order) stands and its other members left out of the
 * list; the groups that have no member in the list (empty ones) follow, in `groups` order. Moving
 * an item into a group changes no order in `components`.
 */
export function railEntries(p: {
  components: readonly Component[];
  groups?: readonly Group[];
  listOrder?: readonly string[];
}): RailEntry[] {
  const out: RailEntry[] = [];
  const shown = new Set<string>();
  for (const c of listed(p.components, p.listOrder)) {
    const group = groupOfItem(p, c.id);
    if (group === undefined) {
      out.push({ kind: "item", id: c.id });
    } else if (!shown.has(group.id)) {
      shown.add(group.id);
      out.push({ kind: "group", id: group.id });
    }
  }
  for (const g of p.groups ?? []) {
    if (!shown.has(g.id)) {
      out.push({ kind: "group", id: g.id });
    }
  }
  return out;
}
