// src/screens/FitStrip.tsx
// The no-fit problem strip (board 6 of the 2026-10-23 review): the status row's expanded state,
// pinned at the top of the stage, the same in Top and in 3D. The heading is StageTop's own (the
// tray that doesn't fit and how far off the closest plan is); under it the two things the engine
// can do, Edit <tray> and Try another arrangement, and what the items need against the box (0.15.0).
import { Button } from "../kit";
import type { VolumeNote } from "../ui/volumeFit";
import "./fitStrip.css";

/** One thing the strip offers: its words and what it does. */
export interface FitStripAction {
  label: string;
  onClick: () => void;
}

export interface FitStripProps {
  /** Opens the tray's editor; absent when no tray is named (Not everything fits yet). */
  edit?: FitStripAction;
  /** Searches on for another plan; absent where a longer search is not allowed. */
  keep?: FitStripAction;
  /** What the items need against the box: over the box's volume the heading has it, so only the biggest items follow. */
  volume?: VolumeNote | null;
  /** Below 760 px: the volume note is folded away whole, so the pinned strip leaves the plan its room. */
  phone?: boolean;
}

/** The disclosure's summary over the biggest items and the one whose leaving out would do. */
export const FIT_MORE = "What takes the room";
/** A phone's: the summary over the whole volume note. */
export const FIT_NEED = "What the items need";

/**
 * What the items need against the box. It is the headline only where volume is the binding reason
 * (tight or over; over the box's volume the heading has it): then the figures and the judgement show,
 * and the biggest items and the item whose leaving out would do are folded away. Otherwise the
 * heading names the real limit, and the whole note waits behind "What the items need". On a phone
 * the whole note is folded either way, so the pinned strip leaves the plan its room.
 */
function Volume(p: { note: VolumeNote; phone: boolean }) {
  const { note } = p;
  const binds = note.verdict !== "roomy";
  const figures = (
    <p class="fit-strip__line">
      {note.line}
      {note.judgement === null ? null : (
        <>
          {" "}
          <strong class="fit-strip__judgement">{note.judgement}</strong>
        </>
      )}
    </p>
  );
  const more =
    note.biggest.length === 0 && note.leaveOut === null ? null : (
      <>
        {note.biggest.length === 0 ? null : (
          <ul>
            {note.biggest.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {note.leaveOut === null ? null : <p>{note.leaveOut}</p>}
      </>
    );
  const shown = binds && !p.phone && note.verdict !== "over";
  if (!shown && more === null && note.verdict === "over" && !p.phone) {
    return null;
  }
  return (
    <div class="fit-strip__volume" data-verdict={note.verdict}>
      {shown ? figures : null}
      {p.phone || !binds ? (
        <details class="fit-strip__more">
          <summary>{FIT_NEED}</summary>
          {note.verdict === "over" && !p.phone ? null : figures}
          {more}
        </details>
      ) : more === null ? null : (
        <details class="fit-strip__more">
          <summary>{FIT_MORE}</summary>
          {more}
        </details>
      )}
    </div>
  );
}

/**
 * The strip's body, under the heading StageTop draws in the same box: the primary "Edit <tray>"
 * (the one that has the focus after a search that ended here), the secondary "Try another
 * arrangement", and the volume note. With no tray named the search is the one thing to do.
 */
export function FitStrip(p: FitStripProps) {
  const lead = p.edit ?? p.keep;
  const second = p.edit === undefined ? undefined : p.keep;
  return (
    <>
      {lead === undefined ? null : (
        <div class="fit-strip__actions">
          <Button
            variant="primary"
            // where the focus goes when a run has ended with this problem (App)
            data-fit-first=""
            title={lead.label}
            onClick={lead.onClick}
          >
            <span class="ellipsis">{lead.label}</span>
          </Button>
          {second === undefined ? null : <Button onClick={second.onClick}>{second.label}</Button>}
        </div>
      )}
      {p.volume ? <Volume note={p.volume} phone={p.phone === true} /> : null}
    </>
  );
}
