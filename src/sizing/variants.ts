import { cutsFirst, isOneMember, rows2Break, rows2Order, splitBlocks } from "./arrange";
import { rowsOf } from "./outer";
import type { StorageOption } from "./common";
import { MAX_SPLITS, MAX_VARIANTS } from "./constants";
import type { CompartmentReq, TrayPartReq, TrayVariant } from "./types";

export interface VariantInput {
  key: string;
  options: readonly StorageOption[];
  /** How many identical, separate trays the requirement is printed as (1..10). */
  copies: number;
}

type Arrangement = TrayPartReq["arrangement"];
const ARRANGEMENTS: readonly Arrangement[] = ["strip", "rows2"];

/** (a + k, s, a, k): see the design decisions, "Variant rank". */
type Rank = readonly [number, number, number, number];

interface Candidate {
  rank: Rank;
  variant: TrayVariant;
}

/**
 * One tray's part of a copy: a strip or two rows. One member's compartments are laid out as
 * before 0.7.0 (rows2 balanced by width); a part of several members keeps member order, in a strip
 * or in two contiguous rows. Inside a member the compartments with a cut along the row come first.
 */
function makePart(
  trayKey: string,
  arrangement: Arrangement,
  compartments: CompartmentReq[],
): TrayPartReq | null {
  if (compartments.length === 0) {
    return null;
  }
  if (arrangement === "strip") {
    return { trayKey, arrangement, compartments: cutsFirst(compartments), rotatable: true };
  }
  if (compartments.length < 2) {
    return null;
  }
  if (isOneMember(compartments)) {
    // One member's own blocks lay out as they did before 0.7.0: widths balanced across the two
    // rows, then the cuts along a row first. No row break: it is ceil(n/2).
    const rows = rowsOf(arrangement, rows2Order(compartments));
    return { trayKey, arrangement, compartments: rows.flatMap(cutsFirst), rotatable: true };
  }
  const rowBreak = rows2Break(compartments);
  const rows = rowsOf(arrangement, compartments, rowBreak);
  return { trayKey, arrangement, compartments: rows.flatMap(cutsFirst), rowBreak, rotatable: true };
}

function allOrNull(parts: readonly (TrayPartReq | null)[]): TrayPartReq[] | null {
  const out: TrayPartReq[] = [];
  for (const part of parts) {
    if (part === null) {
      return null;
    }
    out.push(part);
  }
  return out;
}

function compareRank(a: Rank, b: Rank): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];
}

/**
 * Two variants are duplicates when every part has the same arrangement, row break and
 * compartments. Tray keys and ids are deliberately excluded (the earlier one wins).
 */
function dedupeKey(variant: TrayVariant): string {
  return JSON.stringify(
    variant.parts.map((part) => [part.arrangement, part.rowBreak, part.compartments]),
  );
}

/**
 * Strip/rows2 × 1–3 trays for one option's blocks (one copy), the same in each of `copies` copies:
 * copy c's part p is keyed `<key>:p<c>:<p>`. Parts are numbered from 0 in every copy.
 */
function splitCandidates(
  key: string,
  optionId: string,
  blocks: readonly CompartmentReq[][],
  s: number, // storage option index
  copies: number,
): Candidate[] {
  const out: Candidate[] = [];
  ARRANGEMENTS.forEach((arrangement, a) => {
    for (let k = 0; k < MAX_SPLITS; k++) {
      const groups = splitBlocks(blocks, k + 1);
      const parts =
        groups === null
          ? null
          : allOrNull(
              Array.from({ length: copies }, (_, copy) =>
                groups.map((group, part) =>
                  makePart(`${key}:p${copy}:${part}`, arrangement, group.flat()),
                ),
              ).flat(),
            );
      if (parts !== null) {
        out.push({
          rank: [a + k, s, a, k],
          variant: { id: `${optionId}|${arrangement}|split${k + 1}`, parts },
        });
      }
    }
  });
  return out;
}

/**
 * Enumerates the tray variants for one requirement, best first: up to MAX_VARIANTS (8) per
 * storage option, so a requirement with several options ("auto") offers every variant each of
 * them offers alone and never fits worse than one of them. None when no option has a
 * compartment. `copies` is the number of identical trays (1..10); each variant holds that many
 * copies of one arrangement, each in 1–3 parts. `key` is passed through into the tray keys
 * unchanged.
 */
export function buildVariants(input: VariantInput): TrayVariant[] {
  const { key, options, copies } = input;
  const candidates: Candidate[] = [];
  options.forEach((option, s) => {
    candidates.push(...splitCandidates(key, option.id, option.blocks, s, copies));
  });
  candidates.sort((x, y) => compareRank(x.rank, y.rank));
  const seen = new Set<string>();
  const variants: TrayVariant[] = [];
  // One option yields at most 6 (2 arrangements × 3 splits), so this cap never drops a variant one
  // option offers alone; it only bounds the list. A cap over all options together used to keep the
  // best 8 of auto's ~16 and drop its 3-tray splits, the only ones that fit some boxes.
  const cap = MAX_VARIANTS * Math.max(1, options.length);
  for (const { variant } of candidates) {
    if (variants.length >= cap) {
      break;
    }
    const signature = dedupeKey(variant);
    if (!seen.has(signature)) {
      seen.add(signature);
      variants.push(variant);
    }
  }
  return variants;
}
