// Test-only: measures what the finger slot rules promise at well faces (roadmap §4.6) directly
// from the planned cut profile, independent of how planTray checks it. checkPrintability does not
// see these wedges: their tops are sloped faces, which it does not sample.
import type { Settings, TraySpec } from "../model/types";
import { SPEC_TOLERANCE } from "../model/settings";
import { planTray } from "./plan";
import type { SlotPlan } from "./plan-types";

const STEP = 0.005;

function alongX(slot: SlotPlan): boolean {
  return slot.side === "front" || slot.side === "back";
}

function centre(slot: SlotPlan): number {
  return alongX(slot) ? (slot.x0 + slot.x1) / 2 : (slot.y0 + slot.y1) / 2;
}

function sameLine(a: SlotPlan, b: SlotPlan): boolean {
  const near = (p: number, q: number): boolean => Math.abs(p - q) <= SPEC_TOLERANCE;
  return (
    a.side === b.side &&
    near(a.radius, b.radius) &&
    near(a.bottomZ, b.bottomZ) &&
    (alongX(a) ? near(a.y0, b.y0) && near(a.y1, b.y1) : near(a.x0, b.x0) && near(a.x1, b.x1))
  );
}

/**
 * The thinnest piece of material next to a well face that a line of finger slots meets within its
 * overlap into the contents: its width MIN_FEATURE_MM below the piece's highest point (or at the
 * face's own top, if that is lower), sampled every 0.005 mm along the side. Faces that reach the
 * rim (no slot over them) are skipped. Returns Infinity when there is no such face.
 */
export function thinnestWedge(
  spec: TraySpec,
  settings: Settings,
): { width: number; where: string } {
  const plan = planTray(spec, settings);
  const slots = plan.compartments.flatMap((c) => c.slots.map((slot) => ({ c, slot })));
  let worst = { width: Number.POSITIVE_INFINITY, where: "" };
  const seen: SlotPlan[] = [];
  for (const { c: owner, slot } of slots) {
    if (seen.some((s) => sameLine(s, slot))) {
      continue;
    }
    seen.push(slot);
    const x = alongX(slot);
    const line = slots.filter(({ slot: t }) => sameLine(t, slot)).map(({ slot: t }) => t);
    const r = slot.radius;
    const zc = slot.bottomZ + r;
    const top = (u: number): number => {
      let depth = Number.NEGATIVE_INFINITY;
      for (const t of line) {
        const d = Math.abs(u - centre(t));
        if (d < r) {
          depth = Math.max(depth, Math.sqrt(r * r - d * d));
        }
      }
      return depth === Number.NEGATIVE_INFINITY ? spec.h : Math.min(spec.h, zc - depth);
    };
    // Contents that meet the line only within its overlap (on the contents side of the band).
    const v0 = x ? slot.y0 : slot.x0;
    const v1 = x ? slot.y1 : slot.x1;
    const own = owner.content;
    const wells = plan.compartments
      .filter(({ content: o }) => {
        const tol = SPEC_TOLERANCE;
        switch (slot.side) {
          case "front":
            return o.y0 >= own.y0 - tol && o.y0 <= v1 + tol;
          case "back":
            return o.y1 <= own.y1 + tol && o.y1 >= v0 - tol;
          case "left":
            return o.x0 >= own.x0 - tol && o.x0 <= v1 + tol;
          case "right":
            return o.x1 <= own.x1 + tol && o.x1 >= v0 - tol;
        }
      })
      .map(({ content: o }): [number, number] => (x ? [o.x0, o.x1] : [o.y0, o.y1]));
    const inWell = (u: number): boolean => wells.some(([a, b]) => u > a + 1e-9 && u < b - 1e-9);
    const length = x ? spec.w : spec.d;
    const faces = wells.flatMap(([a, b]): [number, -1 | 1][] => [
      [a, -1],
      [b, 1],
    ]);
    for (const [face, solid] of faces) {
      const first = face + solid * STEP;
      const faceTop = top(first);
      if (faceTop >= spec.h - 1e-9) {
        continue;
      }
      // The piece's highest point: up from the face's top, until the top falls below it again.
      let peak = faceTop;
      for (let u = first; u > 0 && u < length && !inWell(u); u += solid * STEP) {
        const t = top(u);
        if (t < faceTop - 1e-9 || peak >= spec.h) {
          break;
        }
        peak = Math.max(peak, t);
      }
      const z = Math.min(faceTop, peak - 0.8);
      let width = 0;
      for (let u = first; u > 0 && u < length && !inWell(u) && top(u) >= z; u += solid * STEP) {
        width = Math.abs(u - face);
        if (width > 1) {
          break;
        }
      }
      if (width < worst.width) {
        worst = { width, where: `${spec.key} ${slot.side} face ${face.toFixed(2)}` };
      }
    }
  }
  return worst;
}
