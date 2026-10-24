// src/screens/BoxSideView.tsx
// The box seen from the side (Box, MobileBox): the space kept free on top as a band, then one row
// cut through the stack, each tray it crosses a block at its own place, and under it the height
// the trays fill. A drawing for the eye (aria-hidden); the caption is text. Nothing here says how the box is stored:
// the engine's stored-on-its-side only steers the loose pieces (coverage scoring and a warning).
import { areaName, lidPlane, topAreasOf, topPlane } from "../model/settings";
import type { Box, Component, Group, Settings, StoredLayout } from "../model/types";
import { lookOfTray } from "../plan/glyph";
import { planFrame, sideSection } from "../plan/layers";
import { mm } from "../ui/identity";
import "./boxStage.css";

export interface BoxSideViewProps {
  box: Box;
  /** The settings the plan was made with: the height the trays fill is `topPlane(box, settings)`. */
  settings: Settings;
  /** The stored plan; without one the floor is drawn empty. */
  layout: StoredLayout | undefined;
  components: readonly Component[];
  /** The project's groups: a group's tray is the group's neutral, as in the plan. */
  groups?: readonly Group[];
  /** Below 760 px: MobileBox's smaller drawing (358 wide). */
  phone?: boolean;
}

/** A fraction of the plane as the style says it, in percent (four places is a tenth of a pixel). */
const pct = (v: number): string => `${Math.round(v * 1000000) / 10000}%`;

/**
 * "Kept free, 8 mm" over a cross-section of the box and "Trays fill the 62 mm below." The section
 * is a cut from the front through the deepest stack (`sideSection`): each part it crosses is a block
 * at its own x and z, as wide and high as it is, on the plane that is the box's width by the height
 * the trays fill (`topPlane`). What the parts leave stays the box's floor.
 *
 * With kept-free areas (`topAreasOf`: "Part of it" with a size) only the stacks under an area stop
 * low, so there is no band over the whole top: the plane is as high as the lid, the area is a
 * dashed ghost slab on it at its own x (the plan's, or the left edge while there is no plan to say),
 * and the caption gives the two heights. Both heights are in the drawing: the blocks elsewhere reach
 * the top, the ones under the slab end at its foot.
 */
export function BoxSideView({
  box,
  settings,
  layout,
  components,
  groups = [],
  phone = false,
}: BoxSideViewProps) {
  const areas = topAreasOf(box);
  const kept = box.headroom > 0;
  const fill = Math.max(0, areas.length > 0 ? lidPlane(box, settings) : topPlane(box, settings));
  const usableW = planFrame(box, settings).usableW;
  const ghosts =
    fill === 0 || usableW <= 0
      ? []
      : areas.map((a, k) => {
          const at = layout?.reserved?.find((r) => r.area === (box.headroomAreas ?? []).indexOf(a));
          return {
            key: k,
            x: at?.x ?? 0,
            w: at?.w ?? Math.min(a.w, usableW),
          };
        });
  const parts = fill === 0 || usableW <= 0 ? [] : sideSection(layout?.trays ?? []);
  return (
    <div class="bx-side" data-region="side-view" data-phone={phone ? "true" : undefined}>
      <div class="bx-drawing" aria-hidden="true">
        {kept && areas.length === 0 ? (
          <div class="bx-band">{`Kept free, ${mm(box.headroom)} mm`}</div>
        ) : null}
        <div class="bx-floor">
          <div class="bx-plane">
            {ghosts.map((g) => (
              <span
                class="bx-reserve"
                key={`area-${g.key}`}
                style={{
                  "--x": pct(g.x / usableW),
                  "--w": pct(g.w / usableW),
                  "--h": pct(box.headroom / fill),
                }}
              >
                {`Kept free, ${mm(box.headroom)} mm`}
              </span>
            ))}
            {parts.map((t) => {
              const look = lookOfTray(t, components, groups);
              return (
                <span
                  class="bx-tray"
                  key={t.key}
                  data-key={t.key}
                  data-spare={look === null ? "" : undefined}
                  style={{
                    "--x": pct(t.x / usableW),
                    "--w": pct(t.w / usableW),
                    "--z": pct(t.z / fill),
                    "--h": pct(t.h / fill),
                    ...(look === null
                      ? {}
                      : { "--tile-fill": look.shade.fill, "--tile-line": look.shade.line }),
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
      {kept ? (
        <p class="bx-caption">
          {areas.length > 0
            ? `Trays fill the ${mm(fill)} mm below the lid, and ${mm(topPlane(box, settings))} mm under the ${areas.map((a) => areaName(a)).join(" and the ")}.`
            : `Trays fill the ${mm(fill)} mm below.`}
        </p>
      ) : null}
    </div>
  );
}
