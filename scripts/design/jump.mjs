// scripts/design/jump.mjs
// The "nothing jumps" check of the screenshot harness (UI rebuild, Review Focus 4): Keep searching
// turning into Stop must not move the page. shots.mjs measures these regions in `workspace` and
// `workspace-searching`; `jumpProblems` says what moved.

/** The regions that must not move; each is a selector in the app. */
export const JUMP_REGIONS = {
  header: '[data-region="header"]',
  rail: '[data-region="rail"]',
  status: '[data-region="status"]',
  "plan-box": '[data-region="plan-box"]',
};

/** How far a region may move or change size, in px. */
export const JUMP_TOLERANCE = 1;

/**
 * The problems between two states' boxes (`{ x, y, w, h }` or null for a region the page lacks): a
 * region more than 1 px out, or found in only one of them. A region in neither is reported with
 * "(nothing compared)", so a caller can tell a check with nothing to look at from one that passed.
 */
export function jumpProblems(a, b) {
  const problems = [];
  for (const region of Object.keys(JUMP_REGIONS)) {
    const [p, q] = [a[region] ?? null, b[region] ?? null];
    if (p === null && q === null) {
      problems.push(`${region}: in neither state (nothing compared)`);
    } else if (p === null || q === null) {
      problems.push(`${region}: in only one of the two states`);
    } else {
      const moved = ["x", "y", "w", "h"].filter((k) => Math.abs(p[k] - q[k]) > JUMP_TOLERANCE);
      if (moved.length > 0) {
        const show = (r) => `${r.x},${r.y} ${r.w}×${r.h}`;
        problems.push(`${region} moved: ${show(p)} against ${show(q)}`);
      }
    }
  }
  return problems;
}
