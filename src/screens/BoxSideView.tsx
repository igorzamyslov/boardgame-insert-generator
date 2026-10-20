// src/screens/BoxSideView.tsx
// The box seen from the side (Box, MobileBox): the space kept free on top as a band, then one row
// cut through the stack, each tray it crosses a block at its own place, and under it the height
// the trays fill. A drawing for the eye (aria-hidden); the caption is text. Nothing here says how the box is stored:
// the engine's stored-on-its-side only steers the loose pieces (coverage scoring and a warning).
import { topPlane } from "../model/settings";
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
 */
export function BoxSideView({
  box,
  settings,
  layout,
  components,
  groups = [],
  phone = false,
}: BoxSideViewProps) {
  const kept = box.headroom > 0;
  const fill = Math.max(0, topPlane(box, settings));
  const usableW = planFrame(box, settings).usableW;
  const parts = fill === 0 || usableW <= 0 ? [] : sideSection(layout?.trays ?? []);
  return (
    <div class="bx-side" data-region="side-view" data-phone={phone ? "true" : undefined}>
      <div class="bx-drawing" aria-hidden="true">
        {kept ? <div class="bx-band">{`Kept free, ${mm(box.headroom)} mm`}</div> : null}
        <div class="bx-floor">
          <div class="bx-plane">
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
      {kept ? <p class="bx-caption">{`Trays fill the ${mm(fill)} mm below.`}</p> : null}
    </div>
  );
}
