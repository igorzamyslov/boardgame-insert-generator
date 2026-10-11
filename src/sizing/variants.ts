import { rows2Order, splitBlocks } from "./arrange";
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

interface Candidate {
  rank: readonly number[];
  variant: TrayVariant;
}

function makePart(
  trayKey: string,
  arrangement: Arrangement,
  compartments: CompartmentReq[],
): TrayPartReq | null {
  if (arrangement === "strip") {
    return { trayKey, arrangement, compartments, rotatable: true };
  }
  if (compartments.length < 2) {
    return null;
  }
  return { trayKey, arrangement, compartments: rows2Order(compartments), rotatable: true };
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

function compareRank(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** Strip/rows2 × 1–3 trays for one block list (no perPlayer, or the "combined" mode). */
function splitCandidates(
  key: string,
  tag: string,
  blocks: readonly CompartmentReq[][],
  s: number,
  m: number,
  optionId: string,
  suffix: string,
): Candidate[] {
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

export function buildVariants(input: VariantInput): TrayVariant[] {
  const { key, options, players } = input;
  const candidates: Candidate[] = [];
  options.forEach((option, s) => {
    if (players === null) {
      candidates.push(...splitCandidates(key, "p0", option.blocks, s, 0, option.id, ""));
      return;
    }
    const perPlayer = Array.from({ length: players }, (_, p) => forPlayer(option.blocks, p));
    ARRANGEMENTS.forEach((arrangement, a) => {
      const parts = allOrNull(
        perPlayer.map((blocks, p) => makePart(`${key}:p${p}:0`, arrangement, blocks.flat())),
      );
      if (parts !== null) {
        candidates.push({
          rank: [a, s, 0, a, 0],
          variant: { id: `${option.id}|${arrangement}|split1|separate`, parts },
        });
      }
    });
    if (players > 1) {
      candidates.push(
        ...splitCandidates(key, "pall", perPlayer.flat(), s, 1, option.id, "|combined"),
      );
    }
  });
  candidates.sort((x, y) => compareRank(x.rank, y.rank));
  const seen = new Set<string>();
  const variants: TrayVariant[] = [];
  for (const candidate of candidates) {
    const signature = JSON.stringify(
      candidate.variant.parts.map((part) => [part.arrangement, part.compartments]),
    );
    if (variants.length < MAX_VARIANTS && !seen.has(signature)) {
      seen.add(signature);
      variants.push(candidate.variant);
    }
  }
  return variants;
}
