// src/screens/BoxSideView.tsx
// The box seen from the side (Box, MobileBox): the space kept free on top as a band, then one row
// per layer, the top layer first, each tray a block, and under it the height the trays fill. A
// drawing for the eye (aria-hidden); the caption is text. Nothing here says how the box is stored:
// the engine's stored-on-its-side only steers the loose pieces (coverage scoring and a warning).
import { topPlane } from "../model/settings";
import type { Box, Component, Settings, StoredLayout } from "../model/types";
import { lookOfTray } from "../plan/glyph";
import { layerHeights, levelsOf, traysAt } from "../plan/layers";
import { mm } from "../ui/identity";
import "./boxStage.css";

export interface BoxSideViewProps {
  box: Box;
  /** The settings the plan was made with: the height the trays fill is `topPlane(box, settings)`. */
  settings: Settings;
  /** The stored plan; without one the floor is drawn empty. */
  layout: StoredLayout | undefined;
  components: readonly Component[];
  /** Below 760 px: MobileBox's smaller drawing (358 wide). */
  phone?: boolean;
}

/** A row's share of the height the trays fill, as the style says it (four places is a tenth of a pixel). */
const share = (v: number): string => String(Math.round(v * 10000) / 10000);

/**
 * "Kept free, 8 mm" over the layers and "Trays fill the 62 mm below." The rows share the height
 * under the band by their layers' heights (`layerHeights`, as the Layer switch has them), so a
 * layer twice as tall is twice as high; what the layers leave of it stays the box's floor.
 */
export function BoxSideView({
  box,
  settings,
  layout,
  components,
  phone = false,
}: BoxSideViewProps) {
  const kept = box.headroom > 0;
  const fill = Math.max(0, topPlane(box, settings));
  const trays = layout?.trays ?? [];
  const levels = levelsOf(trays);
  const heights = layerHeights(trays);
  // top layer first
  const rows = levels
    .map((level, i) => ({
      level,
      height: heights[i] ?? 0,
      blocks: traysAt(trays, level)
        .filter((t) => t.part === "tray" || t.part === "leftover")
        .sort((a, b) => a.x - b.x),
    }))
    .reverse();
  return (
    <div class="bx-side" data-region="side-view" data-phone={phone ? "true" : undefined}>
      <div class="bx-drawing" aria-hidden="true">
        {kept ? <div class="bx-band">{`Kept free, ${mm(box.headroom)} mm`}</div> : null}
        {rows.length === 0 || fill === 0 ? (
          <div class="bx-floor" />
        ) : (
          rows.map((row) => (
            <div
              class="bx-row"
              key={row.level}
              style={{ "--share": share(Math.min(1, row.height / fill)) }}
            >
              {row.blocks.map((t) => {
                const look = lookOfTray(t, components);
                return (
                  <span
                    class="bx-tray"
                    key={t.key}
                    data-key={t.key}
                    data-spare={look === null ? "" : undefined}
                    style={{
                      flexGrow: t.w,
                      ...(look === null
                        ? {}
                        : { "--tile-fill": look.shade.fill, "--tile-line": look.shade.line }),
                    }}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
      {kept ? <p class="bx-caption">{`Trays fill the ${mm(fill)} mm below.`}</p> : null}
    </div>
  );
}
