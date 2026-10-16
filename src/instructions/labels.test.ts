// src/instructions/labels.test.ts
import { describe, expect, it } from "vitest";
import { MAX_BADGE_FONT, MIN_BADGE_FONT, badgeSize, placeBadges } from "./labels";
import type { Box, LabelRequest, PlacedBadge } from "./labels";

const bounds = { x: -5, y: -5, w: 210, h: 130 };
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const tray = (text: string, r: ReturnType<typeof rect>): LabelRequest => ({
  text,
  rect: r,
  kind: "tray",
});

const boxOf = (b: PlacedBadge): Box => ({ x: b.cx - b.w / 2, y: b.cy - b.h / 2, w: b.w, h: b.h });

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function apart(a: PlacedBadge, b: PlacedBadge): boolean {
  return !overlap(boxOf(a), boxOf(b));
}

describe("placeBadges", () => {
  it("puts the badge in the middle of a roomy tray, with no leader", () => {
    const [b] = placeBadges([tray("MARKET", rect(0, 0, 100, 80))], bounds);
    expect(b).toMatchObject({ cx: 50, cy: 40, leader: false });
    expect(b?.fs).toBe(MAX_BADGE_FONT);
  });

  it("makes the badge as wide as its name", () => {
    expect(badgeSize(5, "WOODEN MEE").w).toBeGreaterThan(badgeSize(5, "DICE").w);
    expect(badgeSize(5, "DICE").h).toBe(badgeSize(5, "WOODEN MEE").h);
    const [a, b] = placeBadges(
      [tray("DICE", rect(0, 0, 100, 80)), tray("WOODEN MEE", rect(110, 0, 100, 80))],
      { x: -5, y: -5, w: 330, h: 130 },
    );
    expect((b?.w ?? 0) > (a?.w ?? 99)).toBe(true);
  });

  it("shrinks the text to fit a narrow tray", () => {
    const [b] = placeBadges([tray("DICE", rect(0, 0, 20, 60))], bounds);
    expect(b?.leader).toBe(false);
    expect(b?.fs).toBeLessThan(MAX_BADGE_FONT);
    expect(b?.w ?? 99).toBeLessThanOrEqual(20);
  });

  it("puts a tray too small for a badge beside it with a leader line", () => {
    const small = rect(50, 50, 4, 4);
    const [b] = placeBadges([tray("WOODEN MEE", small)], bounds);
    expect(b?.leader).toBe(true);
    expect(b?.fs).toBe(MIN_BADGE_FONT);
    // wholly outside the shape, so nothing of the tray hides it
    expect(overlap(boxOf(b as PlacedBadge), small)).toBe(false);
  });

  it("keeps the badges of neighbouring small trays apart and inside the picture", () => {
    const reqs = [
      tray("SPAC DICE", rect(0, 0, 5, 5)),
      tray("SPAC MARKET", rect(6, 0, 5, 5)),
      tray("SPAC CARDS", rect(12, 0, 5, 5)),
    ];
    const placed = placeBadges(reqs, bounds);
    for (let i = 0; i < placed.length; i += 1) {
      const a = placed[i];
      expect(a).toBeDefined();
      if (!a) {
        continue;
      }
      expect(a.cx - a.w / 2).toBeGreaterThanOrEqual(bounds.x);
      expect(a.cy - a.h / 2).toBeGreaterThanOrEqual(bounds.y);
      expect(a.cx + a.w / 2).toBeLessThanOrEqual(bounds.x + bounds.w);
      expect(a.cy + a.h / 2).toBeLessThanOrEqual(bounds.y + bounds.h);
      for (const b of placed.slice(i + 1)) {
        expect(apart(a, b)).toBe(true);
      }
    }
  });

  it("moves a spacer's badge off the badge and caption of the tray it lies on", () => {
    const reqs: LabelRequest[] = [
      { ...tray("MARKET", rect(0, 0, 100, 80)), caption: { w: 40, h: 6 } },
      // the spacer is centred on the tray, right where its badge and caption are
      { text: "SPAC DICE", rect: rect(40, 30, 20, 20), kind: "spacer" },
    ];
    const [a, b] = placeBadges(reqs, bounds);
    if (!a || !b) {
      throw new Error("no badges");
    }
    expect(apart(a, b)).toBe(true);
    expect(a.caption).not.toBeNull();
    if (a.caption) {
      expect(overlap(boxOf(b), a.caption)).toBe(false);
    }
  });

  it("keeps clear of fixed text such as the FRONT mark", () => {
    const front = { x: 90, y: 100, w: 24, h: 10 };
    const [b] = placeBadges([tray("MARKET", rect(95, 104, 4, 4))], bounds, [front]);
    expect(overlap(boxOf(b as PlacedBadge), front)).toBe(false);
  });
});
