// src/ui/TrayDetails.tsx
import { isLockable } from "../app/actions";
import { outerSizeText } from "../instructions/numbering";
import type { NumberedPart } from "../instructions/numbering";
import type { Settings } from "../model/types";

export interface TrayDetailsProps {
  part: NumberedPart;
  settings: Settings;
  locked: boolean;
  /** The tray has a size lock (spec §5 `Lock.kind "size"`). */
  sizeLocked?: boolean;
  /** The inputs no longer match the layout: the sizes shown use the current settings. */
  stale?: boolean;
  /** When given, lockable trays get a "Lock size" / "Unlock size" toggle. */
  onToggleSizeLock?: () => void;
}

export function TrayDetails({
  part,
  settings,
  locked,
  sizeLocked = false,
  stale = false,
  onToggleSizeLock,
}: TrayDetailsProps) {
  const t = part.spec;
  const contents = t.compartments.filter((c) => c.contents !== "").map((c) => c.contents);
  return (
    <div class="tray-details" aria-live="polite">
      <h3>{`#${part.number} ${part.label}`}</h3>
      {stale ? (
        <p class="hint">
          Inputs changed — the sizes shown may not match this layout. Re-optimize to update it.
        </p>
      ) : null}
      <dl>
        <div>
          <dt>Outer size</dt>
          <dd>{outerSizeText(t, settings)}</dd>
        </div>
        <div>
          <dt>Layer</dt>
          <dd>{t.level === 0 ? "1 (bottom)" : String(t.level + 1)}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>{`${t.x.toFixed(1)} mm from the left, ${t.y.toFixed(1)} mm from the front`}</dd>
        </div>
        {part.parentNumber !== null ? (
          <div>
            <dt>Goes into</dt>
            <dd>{`Tray #${part.parentNumber}`}</dd>
          </div>
        ) : null}
        <div>
          <dt>Position locked</dt>
          <dd>{locked ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Size locked</dt>
          <dd>{sizeLocked ? "Yes" : "No"}</dd>
        </div>
      </dl>
      {onToggleSizeLock && isLockable(t) ? (
        <p class="button-row">
          <button type="button" onClick={onToggleSizeLock}>
            {sizeLocked ? "Unlock size" : "Lock size"}
          </button>
          <span class="hint">
            A size lock keeps this outer size when the layout is re-optimized.
          </span>
        </p>
      ) : null}
      {contents.length > 0 ? (
        <ul class="tray-contents">
          {contents.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
