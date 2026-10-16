// src/ui/TrayDetails.tsx
import { isLockable } from "../app/actions";
import { outerSizeText } from "../instructions/numbering";
import type { NumberedPart } from "../instructions/numbering";
import type { Settings, TraySpec } from "../model/types";

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

/** What a merged part is made of, and how it prints. */
function mergedText(t: TraySpec): string {
  const members = t.merged?.members ?? [];
  const risers = members.filter((m) => m.part === "riser").length;
  const fillers = members.length - risers;
  const noun = `${fillers} ${fillers === 1 ? "filler" : "fillers"}`;
  const joined = risers > 0 ? `${noun} and ${risers === 1 ? "a riser" : `${risers} risers`}` : noun;
  return t.merged?.flipped
    ? `${joined}. Print it upside down, the flat top on the bed, so nothing hangs.`
    : `${joined}, printed as one part.`;
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
    <div class="tray-details" role="group" aria-label="Selected tray" aria-live="polite">
      <h3>{`#${part.number} ${part.label}`}</h3>
      {stale ? (
        <p class="hint">
          Inputs changed — the sizes shown may not match this layout. Update the plan to fix it.
        </p>
      ) : null}
      <dl>
        <div>
          <dt>Outer size</dt>
          <dd>{outerSizeText(t, settings)}</dd>
        </div>
        {t.merged ? (
          <div>
            <dt>Joins</dt>
            <dd>{mergedText(t)}</dd>
          </div>
        ) : null}
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
            <dt>{t.part === "riser" ? "Carries" : "Sits on"}</dt>
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
          <span class="hint">A size lock keeps this outer size when the plan is updated.</span>
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
