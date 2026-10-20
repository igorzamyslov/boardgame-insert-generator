import { mostFrequentAccess } from "./groups";
import type { Json } from "./json";
import { isRecord } from "./json";
import type { Access } from "./types";

// The one migration of schema 0.2.0 (groups spec §4.2), compatibility line "0.1" → "0.2.0".
// A pure function on raw JSON: it never throws for a JSON object, never mutates its input and gives
// the same output for the same input. The reader checks what comes out; this only moves things.

/** What a group id may be made of: tray keys use ":" and nothing else, so this is the whole rule. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

const ACCESS_WORDS: readonly Access[] = ["often", "sometimes", "setup"];

/** The part of a stored tray key that follows its requirement key: ":p0:2", ":pall:0", ":p1:0:spacer". */
const TRAY_TAIL = /^([\s\S]*?)(:p(?:\d+|all):\d+(?::spacer)?)$/;

/** A trailing " (P3)": what 0.1 appended to the contents of a per-player tray's compartments. */
const PLAYER_SUFFIX = / \(P\d+\)$/;

function accessOf(c: Json): Access {
  return ACCESS_WORDS.find((a) => a === c.access) ?? "sometimes";
}

/**
 * The group ids of the distinct group texts, in the order given. A text that is a safe id and no
 * component's keeps itself, reserved first, so an unsafe text before it can never take its id
 * (R18). The others get the first free `group-<n>`.
 */
function assignIds(
  texts: readonly string[],
  componentIds: ReadonlySet<string>,
): Map<string, string> {
  const ids = new Map<string, string>();
  const taken = new Set(componentIds);
  for (const text of texts) {
    if (SAFE_ID.test(text) && !componentIds.has(text)) {
      ids.set(text, text);
      taken.add(text);
    }
  }
  let n = 1;
  for (const text of texts) {
    if (ids.has(text)) {
      continue;
    }
    while (taken.has(`group-${n}`)) {
      n += 1;
    }
    ids.set(text, `group-${n}`);
    taken.add(`group-${n}`);
  }
  return ids;
}

/** `key` with the requirement part renamed by `renames`, or `key` itself. */
function renamedKey(key: string, renames: ReadonlyMap<string, string>): string {
  const m = TRAY_TAIL.exec(key);
  const to = m?.[1] === undefined ? undefined : renames.get(m[1]);
  return to === undefined || m === null ? key : `${to}${m[2] ?? ""}`;
}

function renameLock(lock: unknown, renames: ReadonlyMap<string, string>): void {
  if (!isRecord(lock)) {
    return;
  }
  if (typeof lock.trayKey === "string") {
    lock.trayKey = renamedKey(lock.trayKey, renames);
  }
  if (Array.isArray(lock.trayKeys)) {
    lock.trayKeys = lock.trayKeys.map((k) => (typeof k === "string" ? renamedKey(k, renames) : k));
  }
}

/** The stored plan: tray keys follow their group's new id, and per-player labels go (R19). */
function migrateLayout(layout: unknown, renames: ReadonlyMap<string, string>): void {
  if (!isRecord(layout) || !Array.isArray(layout.trays)) {
    return;
  }
  // An old "combined" per-player tray has no counterpart now: the plan is stale, never the pins.
  if (
    layout.trays.some((t) => isRecord(t) && typeof t.key === "string" && t.key.includes(":pall:"))
  ) {
    layout.inputsHash = "";
  }
  for (const tray of layout.trays) {
    if (!isRecord(tray)) {
      continue;
    }
    if (typeof tray.key === "string") {
      tray.key = renamedKey(tray.key, renames);
    }
    if (!Array.isArray(tray.compartments)) {
      continue;
    }
    for (const compartment of tray.compartments) {
      if (isRecord(compartment) && typeof compartment.contents === "string") {
        compartment.contents = compartment.contents.replace(PLAYER_SUFFIX, "");
      }
    }
  }
}

/** The N of `perPlayer: { players: N }`, undefined when it says none. */
function playersOf(c: Json): unknown {
  return isRecord(c.perPlayer) ? c.perPlayer.players : undefined;
}

/**
 * Schema line "0.1" → "0.2.0":
 * 1. each distinct non-empty `groupId` text becomes a group, in the order its text first appears,
 *    with its members in list order; `groupId` is deleted everywhere;
 * 2. `perPlayer: { players: N }` becomes `copies: N` (nothing for 1) on an ungrouped item;
 * 3. a group takes the largest N of its members' `perPlayer` as its `copies`;
 * 4. a stored plan with a ":pall:" tray goes stale (`inputsHash` ""), pins are all kept;
 * 5. a group whose id is not its old text takes its pins' and trays' keys with it (R18), and
 *    stored compartment contents lose " (P<n>)" (R19).
 */
export function migrateTo020(raw: Json): Json {
  const out = structuredClone(raw);
  const components = Array.isArray(out.components) ? out.components : [];
  const items = components.filter(isRecord);

  // Ids first: a member with no id of its own gets a fixed one, so a group can name it.
  const used = new Set(items.flatMap((c) => (typeof c.id === "string" ? [c.id] : [])));
  let anonymous = 1;
  for (const c of items) {
    if (typeof c.id !== "string" && typeof c.groupId === "string" && c.groupId !== "") {
      while (used.has(`item-${anonymous}`)) {
        anonymous += 1;
      }
      const id = `item-${anonymous}`;
      c.id = id;
      used.add(id);
    }
  }

  // Group texts in order of first appearance, and who carries each.
  const members = new Map<string, Json[]>();
  for (const c of items) {
    if (typeof c.groupId === "string" && c.groupId !== "") {
      const list = members.get(c.groupId);
      if (list) {
        list.push(c);
      } else {
        members.set(c.groupId, [c]);
      }
    }
  }
  const ids = assignIds([...members.keys()], used);

  const groups: Json[] = [];
  const renames = new Map<string, string>();
  for (const [text, list] of members) {
    const id = ids.get(text) ?? text;
    if (id !== text) {
      renames.set(text, id);
    }
    const group: Json = { id, name: text.trim() };
    const largest = Math.max(
      1,
      ...list.map((c) => playersOf(c)).filter((n): n is number => typeof n === "number"),
    );
    if (largest > 1) {
      group.copies = largest;
    }
    group.access = mostFrequentAccess(list.map((c) => ({ access: accessOf(c) })));
    group.memberIds = list.map((c) => c.id);
    groups.push(group);
  }

  for (const c of items) {
    const grouped = typeof c.groupId === "string" && c.groupId !== "";
    const players = playersOf(c);
    delete c.groupId;
    delete c.perPlayer;
    if (!grouped && players !== undefined && players !== 1) {
      c.copies = players;
    }
  }
  if (groups.length > 0) {
    out.groups = groups;
  }

  if (Array.isArray(out.locks)) {
    for (const lock of out.locks) {
      renameLock(lock, renames);
    }
  }
  migrateLayout(out.layout, renames);
  return out;
}
