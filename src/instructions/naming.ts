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
  /** The kind name of a tray's first component, for a name with nothing the font can print. */
  kindName: string;
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

/** The components a tray holds, first compartment first, each once. */
function holdsOf(spec: TraySpec, components: readonly Component[]): Component[] {
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
  return indices.map((i) => components[i] as Component);
}

/** Cyrillic in Latin letters (Russian, Ukrainian), lower case; capitals are derived. */
const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ґ: "g",
  д: "d",
  е: "e",
  ё: "e",
  є: "ye",
  ж: "zh",
  з: "z",
  и: "i",
  і: "i",
  ї: "yi",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Cyrillic letters in Latin ones: "Карты" -> "Karty", "КАРТЫ" -> "KARTY". */
function transliterate(text: string): string {
  const chars = [...text];
  const isUpper = (ch: string | undefined) =>
    ch !== undefined && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
  return chars
    .map((ch, i) => {
      const latin = CYRILLIC[ch.toLowerCase()];
      if (latin === undefined) {
        return ch;
      }
      if (!isUpper(ch)) {
        return latin;
      }
      // A capital inside capitals stays all capitals ("Ш" in "ШАХ" is "SH"); alone it starts a word.
      return isUpper(chars[i - 1]) || isUpper(chars[i + 1])
        ? latin.toUpperCase()
        : latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .join("");
}

/** Letters the block font prints: A-Z, 0-9 and hyphen, with accents and ligatures folded. */
function printable(text: string): string {
  return transliterate(text)
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

/** The head of a disambiguated short name: "Wooden" -> "Woo". */
const HEAD = 3;

/** The lead word of a part named by a tray, cut for engraving: "Spacer" -> "Spac". */
const LEAD_CUT = 4;

/**
 * The short names of the trays that hold components. Trays whose first word (cut to fit) is the
 * same form a group: if all of them are siblings of one component, each keeps the first word and
 * its number ("Market 1", "Market 2"); if they are different components, each gets a three-letter
 * head and what sets it apart from the rest of its group, after the words they all share
 * ("Wooden meeples red / blue / green" -> "Woo red", "Woo blue", "Woo green"). Nobody in a group
 * keeps the plain first word while another is cut down, and the result does not depend on the
 * order of the parts.
 */
function trayShorts(trays: readonly Draft[]): Map<string, string> {
  const wordsOfDraft = (d: Draft): string[] => {
    const words = wordsOf(d.base);
    return words.length > 0 ? words : [d.kindName];
  };
  const tailOf = (d: Draft) => (d.index === null ? "" : ` ${d.index}`);
  const groups = new Map<string, Draft[]>();
  for (const d of [...trays].sort((x, y) => x.order - y.order)) {
    const k = cut(wordsOfDraft(d)[0] ?? "", SHORT_NAME_MAX).toUpperCase();
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const out = new Map<string, string>();
  for (const group of groups.values()) {
    // Names with nothing printable are all called by their kind: "Cards 1", "Cards 2" in plan
    // order, or just "Cards" alone.
    const blank = group.filter((d) => wordsOf(d.base).length === 0);
    if (blank.length === group.length) {
      group.forEach((d, i) => {
        const tail = group.length > 1 ? ` ${i + 1}` : "";
        out.set(d.key, `${cut(d.kindName, SHORT_NAME_MAX - tail.length)}${tail}`);
      });
      continue;
    }
    const bases = [...new Set(group.map((d) => d.base.toLowerCase()))];
    if (bases.length === 1) {
      for (const d of group) {
        const tail = tailOf(d);
        out.set(d.key, `${cut(wordsOfDraft(d)[0] ?? "", SHORT_NAME_MAX - tail.length)}${tail}`);
      }
      continue;
    }
    // Words in every member of the group say nothing about which one it is.
    const lists = group.map(wordsOfDraft);
    const shared = new Set(
      (lists[0] ?? [])
        .map((w) => w.toLowerCase())
        .filter((w) => lists.every((l) => l.some((x) => x.toLowerCase() === w))),
    );
    const distinct = (d: Draft): string[] =>
      wordsOfDraft(d).filter((w) => !shared.has(w.toLowerCase()));
    const form = (d: Draft, k: number): string => {
      const first = wordsOfDraft(d)[0] ?? "";
      const head = cut(first, HEAD);
      const room = SHORT_NAME_MAX - tailOf(d).length - head.length - 1;
      const more = cut(distinct(d).slice(0, k).join(" "), room).trimEnd();
      return `${head}${more === "" ? "" : ` ${more}`}${tailOf(d)}`;
    };
    // As many distinguishing words as it takes for the members to differ.
    const most = Math.max(...group.map((d) => distinct(d).length), 1);
    let k = 1;
    while (
      k < most &&
      new Set(group.map((d) => form(d, k).toUpperCase())).size <
        new Set(group.map((d) => d.key)).size
    ) {
      k += 1;
    }
    for (const d of group) {
      out.set(d.key, form(d, k));
    }
  }
  return out;
}

/**
 * Names for every part, by the part's key. A component with one tray is called by its name; with
 * several, its name and " 1", " 2" in plan order. A card spacer, filler block, riser or divider is
 * "Spacer by <the tray beside it>" ("Spare by …" for a spare tray, "Riser under …", "Divider in …");
 * several by the same tray are numbered "Spacer 1 by …", "Spacer 2 by …". `short` is what fits
 * engraved on the part: at most SHORT_NAME_MAX characters of letters, digits, spaces and hyphens
 * the block font has (Cyrillic is transliterated; a name with nothing left is the component's kind
 * name). Full names never repeat, nor do short ones (compared without case, as the engraving is
 * upper case). Pure, deterministic and independent of the order the parts are passed in.
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
    kindName: "",
    index: null,
    full: "",
    ...over,
  });

  // Trays that hold components are named after them.
  const rest: NumberedPart[] = [];
  for (const part of ordered) {
    const holds = part.spec.part === "tray" ? holdsOf(part.spec, components) : [];
    const first = holds[0];
    if (first !== undefined) {
      named.push(part);
      drafts.push(
        draftOf(part, {
          base: holds.map(componentName).join(" + "),
          kindName: KIND_NAMES[first.kind],
        }),
      );
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
  const draftByKey = new Map(drafts.map((d) => [d.key, d]));
  const nameGroup = (group: Draft[], stem: (d: Draft) => string, show: (d: Draft) => string) => {
    const count = new Map<string, number>();
    for (const d of group) {
      count.set(stem(d).toLowerCase(), (count.get(stem(d).toLowerCase()) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    for (const d of group) {
      const k = stem(d).toLowerCase();
      seen.set(k, (seen.get(k) ?? 0) + 1);
      d.index = (count.get(k) ?? 0) > 1 ? (seen.get(k) ?? null) : null;
      const base = show(d);
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
  const numbered = (d: Draft) => (d.index === null ? "" : ` ${d.index}`);
  nameGroup(
    trays,
    (d) => d.base,
    (d) => `${d.base}${numbered(d)}`,
  );
  const beside = (d: Draft) => draftByKey.get(d.by ?? "")?.full;
  const stemBy = (d: Draft, own: string) => {
    const lead = d.lead as Lead;
    const tray = beside(d);
    return tray === undefined ? `${lead.word}${own}` : `${lead.word}${own} ${lead.link} ${tray}`;
  };
  nameGroup(
    others,
    (d) => stemBy(d, ""),
    (d) => stemBy(d, numbered(d)),
  );

  // Short names: trays first, as a group; then the parts by a tray, from that tray's final name.
  const shortOf = trayShorts(trays);
  const takenShort = new Set<string>();
  const claim = (d: Draft, wanted: string) => {
    const base = wanted.trim() === "" ? d.kindName || "Part" : wanted.trim();
    let chosen = base;
    // A name already taken: its end is replaced by a counter.
    for (let n = 2; takenShort.has(chosen.toUpperCase()); n += 1) {
      const tail = ` ${n}`;
      chosen = `${base.slice(0, SHORT_NAME_MAX - tail.length).trimEnd()}${tail}`;
    }
    takenShort.add(chosen.toUpperCase());
    shortOf.set(d.key, chosen);
  };
  for (const d of trays) {
    claim(d, cut(shortOf.get(d.key) ?? "", SHORT_NAME_MAX));
  }
  for (const d of others) {
    const lead = d.lead as Lead;
    // Several by one tray: "Spa1 Dice", "Spa2 Dice"; one: "Spac Dice". The tray's own short is
    // cut to what is left, its trailing number kept ("Spar Hex 2").
    const own = d.index === null ? "" : String(d.index);
    const word = cut(lead.word, LEAD_CUT - own.length) + own;
    const tray = shortOf.get(d.by ?? "") ?? "";
    const digits = /( \d+)$/.exec(tray)?.[1] ?? "";
    const stem = tray.slice(0, tray.length - digits.length);
    const room = SHORT_NAME_MAX - word.length - 1 - digits.length;
    const kept = cut(stem, room).trimEnd();
    claim(d, tray === "" ? word : `${word} ${kept}${digits}`);
  }

  return new Map(
    ordered.map((part) => [
      part.spec.key,
      {
        full: draftByKey.get(part.spec.key)?.full ?? part.label,
        short: shortOf.get(part.spec.key) ?? "Part",
      },
    ]),
  );
}
