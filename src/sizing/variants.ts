import { cutsFirst, rows2Order, splitBlocks } from "./arrange";
import { rowsOf } from "./outer";
import type { StorageOption } from "./common";
import { MAX_SPLITS, MAX_VARIANTS } from "./constants";
import type { CompartmentReq, TrayPartReq, TrayVariant } from "./types";

export interface VariantInput {
  key: string;
  options: readonly StorageOption[];
  players: number | null;
}

type Arrangement = TrayPartReq["arrangement"];
const ARRANGEMENTS: readonly Arrangement[] = ["strip", "rows2"];

/** (m + a + k, s, m, a, k): see the design decisions, "Variant rank". */
type Rank = readonly [number, number, number, number, number];

interface Candidate {
  rank: Rank;
  variant: TrayVariant;
}

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
  const rows = rowsOf(arrangement, rows2Order(compartments));
  return { trayKey, arrangement, compartments: rows.flatMap(cutsFirst), rotatable: true };
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

function forPlayer(blocks: readonly CompartmentReq[][], player: number): CompartmentReq[][] {
  return blocks.map((block) =>
    block.map((c) => ({ ...c, contents: `${c.contents} (P${player + 1})` })),
  );
}

function compareRank(a: Rank, b: Rank): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4];
}

/**
 * Two variants are duplicates when every part has the same arrangement and compartments.
 * Tray keys and ids are deliberately excluded, which is why a "combined" split by player
 * collapses into the equivalent "separate" variant (the earlier one wins).
 */
function dedupeKey(variant: TrayVariant): string {
  return JSON.stringify(variant.parts.map((part) => [part.arrangement, part.compartments]));
}

interface SplitInput {
  key: string;
  optionId: string;
  blocks: readonly CompartmentReq[][];
  s: number; // storage option index
  m: 0 | 1; // 0: no perPlayer, 1: "combined"
}

/** Strip/rows2 × 1–3 trays for one block list (no perPlayer, or the "combined" mode). */
function splitCandidates({ key, optionId, blocks, s, m }: SplitInput): Candidate[] {
  const tag = m === 0 ? "p0" : "pall";
  const suffix = m === 0 ? "" : "|combined";
  const out: Candidate[] = [];
  ARRANGEMENTS.forEach((arrangement, a) => {
    for (let k = 0; k < MAX_SPLITS; k++) {
      const groups = splitBlocks(blocks, k + 1);
      const parts =
        groups === null
          ? null
          : allOrNull(
              groups.map((group, part) =>
                makePart(`${key}:${tag}:${part}`, arrangement, group.flat()),
              ),
            );
      if (parts !== null) {
        out.push({
          rank: [m + a + k, s, m, a, k],
          variant: { id: `${optionId}|${arrangement}|split${k + 1}${suffix}`, parts },
        });
      }
    }
  });
  return out;
}

/** One tray per player (strip or rows2); `perPlayer[p]` is the option's blocks for player p. */
function separateCandidates(
  key: string,
  optionId: string,
  perPlayer: readonly (readonly CompartmentReq[][])[],
  s: number,
): Candidate[] {
  const out: Candidate[] = [];
  ARRANGEMENTS.forEach((arrangement, a) => {
    const parts = allOrNull(
      perPlayer.map((blocks, p) => makePart(`${key}:p${p}:0`, arrangement, blocks.flat())),
    );
    if (parts !== null) {
      out.push({
        rank: [a, s, 0, a, 0],
        variant: { id: `${optionId}|${arrangement}|split1|separate`, parts },
      });
    }
  });
  return out;
}

/**
 * Enumerates up to MAX_VARIANTS (0..8) tray variants for one requirement, best first; none when
 * no option has a compartment. `players` is the perPlayer count (1..10, validateComponent's
 * range) or null without perPlayer. `key` is passed through into the tray keys unchanged.
 */
export function buildVariants(input: VariantInput): TrayVariant[] {
  const { key, options, players } = input;
  const candidates: Candidate[] = [];
  options.forEach((option, s) => {
    if (players === null) {
      candidates.push(
        ...splitCandidates({ key, optionId: option.id, blocks: option.blocks, s, m: 0 }),
      );
      return;
    }
    const perPlayer = Array.from({ length: players }, (_, p) => forPlayer(option.blocks, p));
    candidates.push(...separateCandidates(key, option.id, perPlayer, s));
    if (players > 1) {
      candidates.push(
        ...splitCandidates({ key, optionId: option.id, blocks: perPlayer.flat(), s, m: 1 }),
      );
    }
  });
  candidates.sort((x, y) => compareRank(x.rank, y.rank));
  const seen = new Set<string>();
  const variants: TrayVariant[] = [];
  for (const { variant } of candidates) {
    if (variants.length >= MAX_VARIANTS) {
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
