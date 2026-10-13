// src/instructions/labels.test.ts
import { describe, expect, it } from "vitest";
import { MIN_BADGE_FONT, placeBadges } from "./labels";
import type { LabelRequest, PlacedBadge } from "./labels";

const bounds = { x: -5, y: -5, w: 210, h: 130 };
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const tray = (text: string, r: ReturnType<typeof rect>): LabelRequest => ({
  text,
  rect: r,
  kind: "tray",
});

function apart(a: PlacedBadge, b: PlacedBadge): boolean {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) >= a.r + b.r;
}

describe("placeBadges", () => {
  it("puts the badge in the middle of a roomy tray, with no leader", () => {
    const [b] = placeBadges([tray("1", rect(0, 0, 100, 80))], bounds);
    expect(b).toMatchObject({ cx: 50, cy: 40, leader: false });
  });

  it("shrinks the number to fit a narrow tray", () => {
    const [b] = placeBadges([tray("2", rect(0, 0, 9, 60))], bounds);
    expect(b?.leader).toBe(false);
    expect(b?.fs).toBeLessThan(6);
    expect((b?.r ?? 99) * 2).toBeLessThanOrEqual(9);
  });

  it("puts a tray too small for a badge beside it with a leader line", () => {
    const small = rect(50, 50, 4, 4);
    const [b] = placeBadges([tray("7", small)], bounds);
    expect(b?.leader).toBe(true);
    expect(b?.fs).toBe(MIN_BADGE_FONT);
    // wholly outside the shape, so nothing of the tray hides it
    const dx = Math.max(small.x - (b?.cx ?? 0), 0, (b?.cx ?? 0) - (small.x + small.w));
    const dy = Math.max(small.y - (b?.cy ?? 0), 0, (b?.cy ?? 0) - (small.y + small.h));
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(b?.r ?? 99);
  });

  it("keeps the badges of neighbouring small trays apart and inside the picture", () => {
    const reqs = [
      tray("10", rect(0, 0, 5, 5)),
      tray("11", rect(6, 0, 5, 5)),
      tray("12", rect(12, 0, 5, 5)),
    ];
    const placed = placeBadges(reqs, bounds);
    for (let i = 0; i < placed.length; i += 1) {
      const a = placed[i];
      expect(a).toBeDefined();
      if (!a) {
        continue;
      }
      expect(a.cx - a.r).toBeGreaterThanOrEqual(bounds.x);
      expect(a.cy - a.r).toBeGreaterThanOrEqual(bounds.y);
      expect(a.cx + a.r).toBeLessThanOrEqual(bounds.x + bounds.w);
      expect(a.cy + a.r).toBeLessThanOrEqual(bounds.y + bounds.h);
      for (const b of placed.slice(i + 1)) {
        expect(apart(a, b)).toBe(true);
      }
    }
  });

  it("moves a spacer's badge off the badge and caption of the tray it lies on", () => {
    const reqs: LabelRequest[] = [
      { ...tray("1", rect(0, 0, 100, 80)), caption: { w: 40, h: 6 } },
      // the spacer is centred on the tray, right where its badge and caption are
      { text: "2", rect: rect(40, 30, 20, 20), kind: "spacer" },
    ];
    const [a, b] = placeBadges(reqs, bounds);
    if (!a || !b) {
      throw new Error("no badges");
    }
    expect(apart(a, b)).toBe(true);
    expect(a.caption).not.toBeNull();
    const c = a.caption;
    if (c) {
      const nx = Math.max(c.x, Math.min(b.cx, c.x + c.w));
      const ny = Math.max(c.y, Math.min(b.cy, c.y + c.h));
      expect(Math.hypot(b.cx - nx, b.cy - ny)).toBeGreaterThanOrEqual(b.r);
    }
  });

  it("keeps clear of fixed text such as the FRONT mark", () => {
    const front = { x: 90, y: 100, w: 24, h: 10 };
    const [b] = placeBadges([tray("3", rect(95, 104, 4, 4))], bounds, [front]);
    const nx = Math.max(front.x, Math.min(b?.cx ?? 0, front.x + front.w));
    const ny = Math.max(front.y, Math.min(b?.cy ?? 0, front.y + front.h));
    expect(Math.hypot((b?.cx ?? 0) - nx, (b?.cy ?? 0) - ny)).toBeGreaterThanOrEqual(b?.r ?? 99);
  });
});
