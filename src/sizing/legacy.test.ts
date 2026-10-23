// src/sizing/legacy.test.ts
// An ungrouped project lays out as it did in 0.6 (before-merge ruling, owner): what size() gives
// for the legacy fixtures equals what main@a8581fb gave for them. The snapshot,
// test/fixtures/legacy/sizing-0.6.json, was captured by running that commit's
// `size(project.components, project.settings)` over the parsed fixtures and keeping, for every
// part, its tray key, arrangement, the order of its compartments (their contents) and a hash (cyrb53) of
// the whole part (keys sorted, undefined dropped, a copy's " (P1)" suffix removed), so every
// minimum size, feature and growth is pinned too.
//
// One hash was recaptured on purpose (geometry 0.9.3, 2026-10-23): multi-block's 10 mm "Score pad"
// custom well asks for the full-depth cut with a floor notch now (a piece under 20 mm tall is
// lifted from beneath, not by the top: pieceCutout in common.ts). Its size and arrangement are
// as in 0.6; only that part's front-wall cut changed.
import { describe, expect, it } from "vitest";
import multiBlock from "../../test/fixtures/legacy/multi-block.json";
import perPlayer from "../../test/fixtures/legacy/per-player.json";
import plain from "../../test/fixtures/legacy/plain.json";
import snapshot from "../../test/fixtures/legacy/sizing-0.6.json";
import { parseProject } from "../model/schema";
import { size } from "./index";
import type { TrayPartReq, TrayRequirement } from "./types";

interface Shot {
  notices: number;
  requirements: {
    key: string;
    access: string;
    loose: boolean;
    variants: {
      id: string;
      parts: { trayKey: string; arrangement: string; order: string[]; hash: string }[];
    }[];
  }[];
}
const was = snapshot as Record<string, Shot>;

const sorted = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sorted)
    : v !== null && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, x]) => [k, sorted(x)]),
        )
      : v;
const own = (contents: string): string => contents.replace(/ \(P\d+\)$/, "");
/** cyrb53: a small string hash, enough to tell two parts apart. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const hashOf = (part: TrayPartReq): string =>
  hash(
    JSON.stringify(
      sorted({
        ...part,
        compartments: part.compartments.map((c) => ({ ...c, contents: own(c.contents) })),
      }),
    ),
  );

function shotOf(requirements: TrayRequirement[], notices: number): Shot {
  return {
    notices,
    requirements: requirements.map((r) => ({
      key: r.key,
      access: r.access,
      loose: r.loose,
      variants: r.variants.map((v) => ({
        id: v.id,
        parts: v.parts.map((p) => ({
          trayKey: p.trayKey,
          arrangement: p.arrangement,
          order: p.compartments.map((c) => own(c.contents)),
          hash: hashOf(p),
        })),
      })),
    })),
  };
}

function sizedNow(raw: unknown): { shot: Shot; requirements: TrayRequirement[] } {
  const parsed = parseProject(structuredClone(raw));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const { components, groups, settings } = parsed.project;
  const { requirements, notices } = size(components, settings, groups);
  return { shot: shotOf(requirements, notices.length), requirements };
}

describe("an ungrouped project sizes as it did in 0.6", () => {
  it("plain.json: the same requirements, variants, parts and compartments", () => {
    expect(sizedNow(plain).shot).toEqual(was["plain"]);
  });

  it("multi-block.json (cards with three decks, tokens with five kinds, minis, tiles, a custom well): the same, in every arrangement and split", () => {
    const { shot, requirements } = sizedNow(multiBlock);
    // 0.8.0 adds a third arrangement, columns (group-tray-fill spec §3 (b)), ranked after strip and
    // rows2: 0.6's variants are all still there, the same and in the same order, with columns after.
    // 0.14.0 offers a figure's other resting faces and turned pockets as options of their own
    // (standing-turned, flat, lying-turned, …): the 0.6 variants are all still there too, the same
    // and in the same order, among them.
    const before = new Map(
      (was["multi-block"]?.requirements ?? []).map(
        (r) => [r.key, new Set(r.variants.map((v) => v.id))] as const,
      ),
    );
    const without = {
      ...shot,
      requirements: shot.requirements.map((r) => ({
        ...r,
        variants: r.variants.filter(
          (v) => !v.id.includes("|columns|") && before.get(r.key)?.has(v.id) === true,
        ),
      })),
    };
    expect(without).toEqual(was["multi-block"]);
    expect(shot.requirements.some((r) => r.variants.some((v) => v.id.includes("|columns|")))).toBe(
      true,
    );
    // The fixture does exercise rows2 and splits, or this test would prove nothing.
    const variants = requirements.flatMap((r) => r.variants);
    expect(variants.some((v) => v.id.includes("|rows2|"))).toBe(true);
    expect(variants.some((v) => v.id.endsWith("split3"))).toBe(true);
    const rows2 = variants.flatMap((v) => v.parts).filter((p) => p.arrangement === "rows2");
    expect(rows2.length).toBeGreaterThan(0);
    expect(rows2.every((p) => p.rowBreak === undefined)).toBe(true);
  });

  it("per-player.json: 0.6's one tray per player variants (`separate`) are the same copies in 0.7", () => {
    const before = was["per-player"]?.requirements ?? [];
    const now = sizedNow(perPlayer).shot.requirements;
    expect(now.map((r) => r.key)).toEqual(before.map((r) => r.key));
    for (const [i, r] of before.entries()) {
      // The first requirement has no player count; the second's `combined` variants are gone.
      const same = r.variants
        .filter((v) => i === 0 || v.id.endsWith("|separate"))
        .map((v) => ({ ...v, id: v.id.replace("|separate", "") }));
      const ids = new Set(same.map((v) => v.id));
      expect(now[i]?.variants.filter((v) => ids.has(v.id))).toEqual(same);
    }
  });
});
