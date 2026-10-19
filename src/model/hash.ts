import { DEFAULT_SETTINGS } from "./settings";
import type { Component, Group, Project } from "./types";

/**
 * JSON with object keys sorted at every level, so key order never changes the
 * hash. Arrays keep their order. `undefined` properties are skipped, as in
 * JSON.stringify.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v ?? null)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Deep copy without any `name` property (component, deck, item and figure names). */
function withoutNames(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutNames);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k !== "name") {
        // defineProperty, not assignment: an own "__proto__" field must be copied, not become the prototype.
        Object.defineProperty(out, k, {
          value: withoutNames(v),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return out;
  }
  return value;
}

/**
 * An item with `copies` N (above 1) as the item it was before schema 0.2.0: `perPlayer: { players: N }`.
 * The two mean the same layout, and hashing the old shape keeps the hash of every saved per-player
 * project, so its plan stays current across the migration.
 */
function withCopiesAsPerPlayer(c: Component): unknown {
  const { copies, ...rest } = c;
  return copies !== undefined && copies > 1 ? { ...rest, perPlayer: { players: copies } } : rest;
}

/**
 * What of an item reaches the hash (groups spec §5): with copies as above, without `access` when
 * it is in a group (the group's own access is used, so the item's is hidden), and with
 * `flatDecks` only when it is "dividers" (they cut slots into the floor; "walls" lays out as
 * before the field existed).
 */
function hashedItem(c: Component, grouped: ReadonlySet<string>): unknown {
  const item: Record<string, unknown> = { ...(withCopiesAsPerPlayer(c) as object) };
  if (grouped.has(c.id)) {
    delete item.access;
  }
  if (item.flatDecks !== "dividers") {
    delete item.flatDecks;
  }
  return item;
}

/**
 * The groups that reach the hash: those with a member (an empty one prints nothing, so adding one
 * never stales a plan), by id (their order in the array is no part of the layout). Members keep
 * their order, the compartment order. Names go with withoutNames. Undefined when none, so a
 * project without groups hashes as it did before they existed.
 */
function hashedGroups(groups: readonly Group[] | undefined): Group[] | undefined {
  const used = (groups ?? [])
    .filter((g) => g.memberIds.length > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return used.length > 0 ? used : undefined;
}

/** cyrb53 (public domain, bryc): fast 53-bit string hash. Not cryptographic. */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Hash of everything that affects the layout (spec §5 StoredLayout.inputsHash):
 * box, printer, settings, components and locks. Names are left out, so renaming never
 * triggers a re-optimize. `separators` is in: set, it makes a grown deck's room a spacer (and lifts the cap on how far it may grow), so it changes the stored layout. `dividers` is in too: it cuts slots into the tray's floor, so the stored layout and the geometry differ (the dividers themselves are derived from those slots, not stored). `settings.playLimit` is in, but only when it is not the default 1.5 mm (so older plans stay current). `settings.infill` is out: it only
 * changes the displayed filament estimate, so editing it never marks the plan stale. So are `mergeFillers` and `mergeRisers`: they only change how the stored parts are grouped for printing (mergeParts). So is `engraveNames`: it only engraves the tray names into the printed meshes. Project id, name, schemaVersion,
 * createdWith and the stored layout itself are left out too. Unknown fields
 * preserved from a newer-minor file are included as-is. 14 hex characters.
 */
export function inputsHash(p: Project): string {
  // infill only scales the filament estimate; no part depends on it, so it must not stale the plan.
  // wallAbsorb is hashed under its old name, wallGrowth: renaming the setting must not change the
  // hash of every saved project and so mark all of their plans stale.
  const { wallAbsorb, oneWall, playLimit, ...rest } = p.settings;
  // mergeFillers and mergeRisers are print-time decompositions (mergeParts), so they are out too.
  const settings = {
    ...rest,
    wallGrowth: wallAbsorb,
    // It moves where leaf slack goes, so it is hashed, but only when on: off is left out so every
    // project saved before the setting existed keeps its hash and its plan stays current.
    oneWall: oneWall ? true : undefined,
    infill: undefined,
    mergeFillers: undefined,
    mergeRisers: undefined,
    // The engraved names change the printed mesh only, never the layout.
    engraveNames: undefined,
    // The default limit is left out, so plans made before the setting existed (all at 1.5 mm) are
    // still current; any other value is hashed, as it moves the score and the warning.
    playLimit: playLimit === DEFAULT_SETTINGS.playLimit ? undefined : playLimit,
  }; // canonicalJson skips undefined
  const groups = hashedGroups(p.groups);
  const grouped = new Set((groups ?? []).flatMap((g) => g.memberIds));
  const canonical = canonicalJson({
    box: p.box,
    printer: p.printer,
    settings,
    components: withoutNames(p.components.map((c) => hashedItem(c, grouped))),
    // A group's name is no part of the layout (withoutNames).
    groups: groups === undefined ? undefined : withoutNames(groups),
    locks: p.locks,
  });
  return cyrb53(canonical).toString(16).padStart(14, "0");
}
