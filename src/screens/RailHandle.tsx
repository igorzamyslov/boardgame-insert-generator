// src/screens/RailHandle.tsx
import { useRef } from "preact/hooks";
import { RAIL_WIDTH, clampRailWidth } from "../share/prefs";

/** The arrow keys' step, and Shift's (DESIGN §2, Layout). */
const STEP = 16;
const BIG_STEP = 48;

export interface RailHandleProps {
  /** The rail's width now, in px (live while a drag goes on). */
  width: number;
  /** A drag is under way: show this width now, remember nothing yet. */
  onPreview: (px: number) => void;
  /** The width is chosen (a drag ended, a key, a double click): remember it. */
  onCommit: (px: number) => void;
}

interface Grab {
  pointerId: number;
  startX: number;
  startWidth: number;
  last: number;
}

/**
 * The rail's resize handle: a vertical separator on the rail's stage-side edge that the person
 * drags (or moves with the arrow keys) between 300 and 480 px. Pointer capture keeps the drag
 * going outside the handle; the width shows live and is remembered when the drag ends, not on
 * every move. It draws nothing but a thin line on hover, focus and drag; the 44 px hit area lies
 * on the stage's side so the rail's own scrollbar stays clear (`workspace.css`).
 */
export function RailHandle({ width, onPreview, onCommit }: RailHandleProps) {
  const grab = useRef<Grab | null>(null);

  const end = (commit: boolean): void => {
    const g = grab.current;
    grab.current = null;
    if (g && commit) {
      onCommit(g.last);
    }
  };

  return (
    <div
      class="ws-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the list"
      aria-valuenow={width}
      aria-valuemin={RAIL_WIDTH.min}
      aria-valuemax={RAIL_WIDTH.max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0 || grab.current) {
          return;
        }
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        grab.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startWidth: width,
          last: width,
        };
        onPreview(width);
      }}
      onPointerMove={(e) => {
        const g = grab.current;
        if (!g || e.pointerId !== g.pointerId) {
          return;
        }
        g.last = clampRailWidth(g.startWidth + e.clientX - g.startX) ?? g.startWidth;
        onPreview(g.last);
      }}
      onPointerUp={(e) => {
        if (grab.current?.pointerId === e.pointerId) {
          end(true);
        }
      }}
      onPointerCancel={(e) => {
        if (grab.current?.pointerId === e.pointerId) {
          end(true);
        }
      }}
      onDblClick={() => onCommit(RAIL_WIDTH.default)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? BIG_STEP : STEP;
        const next =
          e.key === "ArrowRight"
            ? width + step
            : e.key === "ArrowLeft"
              ? width - step
              : e.key === "Home"
                ? RAIL_WIDTH.min
                : e.key === "End"
                  ? RAIL_WIDTH.max
                  : null;
        if (next === null) {
          return;
        }
        e.preventDefault();
        onCommit(clampRailWidth(next) ?? width);
      }}
    />
  );
}
