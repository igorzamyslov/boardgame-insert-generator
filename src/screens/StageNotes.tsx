// src/screens/StageNotes.tsx
// The layout and sizing notices (over the bed, capped, coverage, play), under the plan caption:
// Main's banner, one box each (UI rebuild Task 6; the Summary's, and the list's, moved).
import { useState } from "preact/hooks";
import { Button, Notice } from "../kit";
import type { Notice as NoticeData } from "../model/types";
import { Announcer, visibleNotices } from "../ui/Notices";

/** Notices shown before the rest fold behind "Show all", so the plan stays in view. */
export const LAYOUT_NOTICES_SHOWN = 3;

const LEAD: Record<NoticeData["level"], string> = {
  error: "Error:",
  warning: "Warning:",
  info: "Note:",
};

export interface StageNotesProps {
  notices: readonly NoticeData[];
}

/**
 * Warn tone for an error or a warning, info tone for a note; the lead word says the level as well,
 * so the colour is not the only sign. Errors are read out as an alert, warnings politely when the
 * reader is idle; both regions stay on the page, empty, so the words arrive.
 */
export function StageNotes({ notices }: StageNotesProps) {
  const [all, setAll] = useState(false);
  const shown = all ? notices : visibleNotices(notices, LAYOUT_NOTICES_SHOWN);
  const warnings = shown
    .filter((n) => n.level === "warning")
    .map((n) => n.message)
    .join(" ");
  const errors = shown
    .filter((n) => n.level === "error")
    .map((n) => n.message)
    .join(" ");
  // errors always show, so a few hidden ones are what "Show all" is for
  const folded = all ? notices.length > LAYOUT_NOTICES_SHOWN : notices.length > shown.length;
  return (
    <>
      <Announcer text={warnings} />
      {errors === "" ? null : (
        <div class="visually-hidden" role="alert">
          {errors}
        </div>
      )}
      {shown.length > 0 ? (
        <ul class="stage-notes" aria-label="Layout messages" data-region="notes">
          {shown.map((n) => (
            <li key={`${n.code}|${n.path ?? ""}|${n.message}`}>
              <Notice tone={n.level === "info" ? "info" : "warn"} title={LEAD[n.level]}>
                {n.message}
              </Notice>
            </li>
          ))}
        </ul>
      ) : null}
      {folded ? (
        <Button variant="quiet" class="stage-more" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : "Show all"}
        </Button>
      ) : null}
    </>
  );
}
