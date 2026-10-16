// src/instructions/naming.ts
import { KIND_NAMES } from "../model/defaults";
import type { Component, TraySpec } from "../model/types";
import { componentIndexOfContents } from "../ui/identity";
import { type NumberedPart, parentKey } from "./numbering";

/** What a part is called: `full` on screens, `short` where it is engraved on the part. */
export interface TrayName {
  full: string;
  short: string;
}

/** The longest engraved name, characters. */
export const SHORT_NAME_MAX = 10;

/** How far apart two parts may sit and still count as touching, mm (tray gaps, box clearance). */
const TOUCH_MM = 1;

/** Edge lengths within this of each other are equal, mm. */
const EDGE_TIE_MM = 0.01;

/** Directions in the order that settles a tie: seen from the front, y grows towards the back. */
const SIDES = ["front", "back", "left", "right"] as const;
type Side = (typeof SIDES)[number];

type Rect = Pick<TraySpec, "x" | "y" | "w" | "d">;

/** How a part is named: a stem, and what it is "by". */
interface Lead {
  /** The word in front: "Spacer", "Spare", "Riser", "Divider". */
  word: string;
  /** Between the word and the neighbour: "by", "under", "in". */
  link: string;
}

const SPACER: Lead = { word: "Spacer", link: "by" };
const SPARE: Lead = { word: "Spare", link: "by" };
const RISER: Lead = { word: "Riser", link: "under" };
const DIVIDER: Lead = { word: "Divider", link: "in" };

/** A part on its way to a name. */
interface Draft {
  key: string;
  /** Position in plan order. */
  order: number;
  /** A tray: the names of its components, joined. Else "". */
  base: string;
  /** A part named by a neighbour: how it is introduced. Null for a tray of components. */
  lead: Lead | null;
  /** A part named by a neighbour: that tray's key. */
  by: string | null;
  /** " 1", " 2" … when several parts would otherwise share a name. */
  index: number | null;
  full: string;
}

/** Overlap of the intervals [a0, a1] and [b0, b1], mm (negative when apart). */
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * Which side of `a` the box `b` touches, and along how much of that edge. Boxes within
 * TOUCH_MM of each other count as touching; ones that overlap in plan share no edge.
 */
function sharedEdge(a: Rect, b: Rect): { side: Side; length: number } | null {
  const alongX = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
  const alongY = overlap(a.y, a.y + a.d, b.y, b.y + b.d);
  const found: { side: Side; length: number }[] = [];
  if (alongX > EDGE_TIE_MM) {
    if (Math.abs(b.y + b.d - a.y) <= TOUCH_MM) {
      found.push({ side: "front", length: alongX });
    }
    if (Math.abs(b.y - (a.y + a.d)) <= TOUCH_MM) {
      found.push({ side: "back", length: alongX });
    }
  }
  if (alongY > EDGE_TIE_MM) {
    if (Math.abs(b.x + b.w - a.x) <= TOUCH_MM) {
      found.push({ side: "left", length: alongY });
    }
    if (Math.abs(b.x - (a.x + a.w)) <= TOUCH_MM) {
      found.push({ side: "right", length: alongY });
    }
  }
  const best = found.sort(
    (p, q) => q.length - p.length || SIDES.indexOf(p.side) - SIDES.indexOf(q.side),
  );
  return best[0] ?? null;
}

function centreDistance(a: Rect, b: Rect): number {
  return Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.d / 2 - (b.y + b.d / 2));
}

/**
 * The named tray a part sits beside: the one sharing the longest edge with it (a tie goes to the
 * front, then the back, left and right), else the nearest by centre distance. Trays on the part's
 * own level come first. `avoid` (the tray a card spacer goes into) is passed over while any other
 * tray is left. Null when there are no trays at all.
 */
function neighbourOf(
  spec: TraySpec,
  trays: readonly NumberedPart[],
  avoid: string | null,
): NumberedPart | null {
  const others = trays.filter((t) => t.spec.key !== spec.key);
  const fresh = others.filter((t) => t.spec.key !== avoid);
  const pool = fresh.length > 0 ? fresh : others;
  const sameLevel = pool.filter((t) => t.spec.level === spec.level);
  const candidates = sameLevel.length > 0 ? sameLevel : pool;
  let best: { part: NumberedPart; length: number; side: number } | null = null;
  for (const part of candidates) {
    const edge = sharedEdge(spec, part.spec);
    if (edge === null) {
      continue;
    }
    const side = SIDES.indexOf(edge.side);
    if (
      best === null ||
      edge.length > best.length + EDGE_TIE_MM ||
      (Math.abs(edge.length - best.length) <= EDGE_TIE_MM && side < best.side)
    ) {
      best = { part, length: edge.length, side };
    }
  }
  if (best !== null) {
    return best.part;
  }
  let nearest: { part: NumberedPart; distance: number } | null = null;
  for (const part of candidates) {
    const distance = centreDistance(spec, part.spec);
    if (nearest === null || distance < nearest.distance - EDGE_TIE_MM) {
      nearest = { part, distance };
    }
  }
  return nearest?.part ?? null;
}

function componentName(c: Component): string {
  const name = c.name.trim();
  return name === "" ? KIND_NAMES[c.kind] : name;
}

/** The names of the components a tray holds, first compartment first, each once. */
function holdsOf(spec: TraySpec, components: readonly Component[]): string[] {
  const indices: number[] = [];
  for (const c of spec.compartments) {
    if (c.kind === "spare" || c.contents === "") {
      continue;
    }
    let index =
      c.componentId === undefined ? -1 : components.findIndex((k) => k.id === c.componentId);
    if (index === -1) {
      index = componentIndexOfContents(c.contents, components) ?? -1;
    }
    if (index !== -1 && !indices.includes(index)) {
      indices.push(index);
    }
  }
  return indices.map((i) => componentName(components[i] as Component));
}

/** Letters the block font prints: A-Z, 0-9 and hyphen, with accents and ligatures folded. */
function printable(text: string): string {
  return text
    .replace(/ß/g, "ss")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .replace(/[øØ]/g, "o")
    .normalize("NFD")
    .replace(/[^A-Za-z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsOf(text: string): string[] {
  return printable(text)
    .split(/[ ]+/)
    .filter((w) => w !== "");
}

const cut = (text: string, room: number): string => text.slice(0, Math.max(room, 0));

/**
 * Names for every part, by the part's key. A component with one tray is called by its name; with
 * several, its name and " 1", " 2" in plan order. A card spacer, filler block, riser or divider is
 * "Spacer by <the tray beside it>" ("Spare by …" for a spare tray, "Riser under …", "Divider in …");
 * several with the same name are numbered the same way. `short` is what fits engraved on the part:
 * at most SHORT_NAME_MAX characters of letters, digits, spaces and hyphens the block font has. Full
 * names never repeat, nor do short ones (compared without case, as the engraving is upper case).
 * Pure and deterministic.
 */
export function trayNames(
  parts: readonly NumberedPart[],
  components: readonly Component[],
): Map<string, TrayName> {
  const ordered = [...parts].sort((a, b) => a.number - b.number);
  const drafts: Draft[] = [];
  const named: NumberedPart[] = [];
  const draftOf = (part: NumberedPart, over: Partial<Draft>): Draft => ({
    key: part.spec.key,
    order: part.number,
    base: "",
    lead: null,
    by: null,
    index: null,
    full: "",
    ...over,
  });

  // Trays that hold components are named after them.
  const rest: NumberedPart[] = [];
  for (const part of ordered) {
    const holds = part.spec.part === "tray" ? holdsOf(part.spec, components) : [];
    if (holds.length > 0) {
      named.push(part);
      drafts.push(draftOf(part, { base: holds.join(" + ") }));
    } else {
      rest.push(part);
    }
  }
  // Everything else is named by the tray beside it; a riser or divider by the tray it belongs to.
  for (const part of rest) {
    const spec = part.spec;
    const isSpacer = spec.part === "spacer" || (spec.part === "leftover" && spec.solid);
    const lead =
      spec.part === "riser" ? RISER : spec.part === "divider" ? DIVIDER : isSpacer ? SPACER : SPARE;
    const owner =
      spec.part === "riser" || spec.part === "divider"
        ? named.find((t) => t.spec.key === parentKey(spec))
        : undefined;
    const beside =
      owner ?? neighbourOf(spec, named, spec.part === "spacer" ? parentKey(spec) : null);
    drafts.push(draftOf(part, { lead, by: beside?.spec.key ?? null }));
  }

  // Full names: trays first, so a part by a tray carries that tray's final name.
  const trays = drafts.filter((d) => d.lead === null);
  const others = drafts.filter((d) => d.lead !== null);
  const taken = new Set<string>();
  const nameGroup = (group: Draft[], stem: (d: Draft) => string) => {
    const count = new Map<string, number>();
    for (const d of group) {
      count.set(stem(d).toLowerCase(), (count.get(stem(d).toLowerCase()) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    for (const d of group) {
      const k = stem(d).toLowerCase();
      seen.set(k, (seen.get(k) ?? 0) + 1);
      d.index = (count.get(k) ?? 0) > 1 ? (seen.get(k) ?? null) : null;
      const base = `${stem(d)}${d.index === null ? "" : ` ${d.index}`}`;
      // Last resort: a name that still repeats (a component called "Dice 1" beside two called
      // "Dice") gets " (2)", " (3)".
      let name = base;
      for (let again = 2; taken.has(name.toLowerCase()); again += 1) {
        name = `${base} (${again})`;
      }
      taken.add(name.toLowerCase());
      d.full = name;
    }
  };
  nameGroup(trays, (d) => d.base);
  const fullOf = (key: string | null) => drafts.find((d) => d.key === key)?.full;
  nameGroup(others, (d) => {
    const lead = d.lead as Lead;
    const beside = fullOf(d.by);
    return beside === undefined ? lead.word : `${lead.word} ${lead.link} ${beside}`;
  });

  // Short names, trays first and each group in plan order: the first claim on a string keeps it.
  const shortOf = new Map<string, string>();
  const takenShort = new Set<string>();
  const candidates = (d: Draft): string[] => {
    const tail = d.index === null ? "" : ` ${d.index}`;
    const room = SHORT_NAME_MAX - tail.length;
    if (d.lead === null) {
      const words = wordsOf(d.base);
      const first = words[0] ?? "Tray";
      const list = [`${cut(first, room)}${tail}`];
      if (words.length > 1) {
        // "Market deck" -> "Mar deck": the head shortened to leave room for the last word.
        const head = cut(first, 3);
        list.push(`${head} ${cut(words[words.length - 1] ?? "", room - head.length - 1)}${tail}`);
      }
      return list;
    }
    // "Spar Hex 2": the lead word cut to 4, then the tray's first word with its own number kept.
    const lead = cut(d.lead.word, 4);
    const tray = drafts.find((t) => t.key === d.by);
    const trayTail = tray?.index === null || tray === undefined ? "" : ` ${tray.index}`;
    const trayWord = tray === undefined ? "" : (wordsOf(tray.base)[0] ?? "Tray");
    const beside = cut(trayWord, room - lead.length - 1 - trayTail.length);
    return [`${lead} ${beside}${trayTail}${tail}`, `${cut(d.lead.word, room)}${tail}`];
  };
  for (const d of [...trays, ...others]) {
    const list = candidates(d)
      .map((c) => c.trim())
      .filter((c) => c !== "");
    let chosen = list.find((c) => !takenShort.has(c.toUpperCase()));
    // Otherwise the first candidate with its end replaced by a counter.
    for (let n = 2; chosen === undefined; n += 1) {
      const tail = ` ${n}`;
      const trial = `${(list[0] ?? "Tray").slice(0, SHORT_NAME_MAX - tail.length).trimEnd()}${tail}`;
      chosen = takenShort.has(trial.toUpperCase()) ? undefined : trial;
    }
    takenShort.add(chosen.toUpperCase());
    shortOf.set(d.key, chosen);
  }

  return new Map(
    ordered.map((part) => [
      part.spec.key,
      {
        full: drafts.find((d) => d.key === part.spec.key)?.full ?? part.label,
        short: shortOf.get(part.spec.key) ?? "Tray",
      },
    ]),
  );
}
