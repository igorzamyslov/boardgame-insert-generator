// src/viewer/AxisGizmo.tsx
import { useEffect, useState } from "preact/hooks";
import { projectAxes } from "./axes";
import type { ViewBasis } from "./axes";

/** The indicator's box (SVG units = px), where it sits and how long a full-length axis is. */
const SIZE = 84;
const CENTRE = SIZE / 2;
const LENGTH = 26;
const LABEL_GAP = 9;

/** What the axes mean for this model, for the picture's text alternative. */
export const AXES_DESCRIPTION =
  "Axis indicator: X (red) runs across the box, Y (green) from its front to its back, Z (blue) up.";

export interface AxisGizmoProps {
  /** Starts the camera orientation reports and returns the function that stops them. */
  watch: (cb: (view: ViewBasis) => void) => () => void;
}

/**
 * The XYZ axis indicator: three labelled axes drawn in the corner over the 3D canvas. It turns
 * with the camera, like the gizmo of every 3D tool, so it answers "which way is up and which
 * side is the front of the box" for whatever angle the model is at. It is plain SVG over the
 * canvas, not part of the WebGL scene: its text stays sharp and takes the page's colours, and
 * `pointer-events: none` lets every click and drag through to the tray picking and the camera.
 */
export function AxisGizmo({ watch }: AxisGizmoProps) {
  const [view, setView] = useState<ViewBasis | null>(null);
  useEffect(() => watch(setView), [watch]);
  if (view === null) {
    return null;
  }
  return (
    <svg
      class="axis-gizmo"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={AXES_DESCRIPTION}
      data-testid="axis-gizmo"
    >
      {projectAxes(view).map(({ axis, dx, dy }) => {
        const tipX = CENTRE + dx * LENGTH;
        const tipY = CENTRE - dy * LENGTH;
        // The letter sits just beyond the tip; an axis pointing at the viewer has no length on
        // screen, so its letter goes up and right rather than onto the others.
        const len = Math.hypot(dx, dy);
        const ux = len < 0.2 ? 0.7 : dx / len;
        const uy = len < 0.2 ? -0.7 : -dy / len;
        return (
          <g key={axis} data-axis={axis}>
            <line x1={CENTRE} y1={CENTRE} x2={tipX} y2={tipY} />
            <circle cx={tipX} cy={tipY} r="3" />
            <text x={tipX + ux * LABEL_GAP} y={tipY + uy * LABEL_GAP}>
              {axis.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
