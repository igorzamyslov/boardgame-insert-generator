// src/screens/StageNotes.tsx
// The layout and sizing notices (over the bed, capped, coverage, play), under the plan caption:
// Main's banner, one box each (UI rebuild Task 6; the Summary's, and the list's, moved).
import { useEffect, useRef, useState } from "preact/hooks";
import { Button, Notice } from "../kit";
import type { Notice as NoticeData } from "../model/types";
import { isHidden } from "../share";
import type { HiddenNotes } from "../share";
import { Announcer, visibleNotices } from "../ui/Notices";

/** Notices shown before the rest fold behind "Show all", so the plan stays in view. */
export const LAYOUT_NOTICES_SHOWN = 3;

const LEAD: Record<NoticeData["level"], string> = {
  error: "Error:",
  warning: "Warning:",
  info: "Note:",
};

/** A note that blocks nothing may be closed; an error says why the next step is stuck, so it stays. */
export const canHide = (n: NoticeData): boolean => n.level !== "error";

export interface StageNotesProps {
  notices: readonly NoticeData[];
  /** The notes the person hid, key to the words hidden (`share/hiddenNotes`); one whose words changed shows again. */
  hidden?: HiddenNotes;
  onHide?: (n: NoticeData) => void;
  /** Brings every hidden note back. */
  onShowHidden?: () => void;
}

/**
 * Warn tone for an error or a warning, info tone for a note; the lead word says the level as well,
 * so the colour is not the only sign. Errors are read out as an alert, warnings politely when the
 * reader is idle; both regions stay on the page, empty, so the words arrive.
 */
export function StageNotes({ notices: every, hidden = {}, onHide, onShowHidden }: StageNotesProps) {
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  // Where focus goes once a note is closed: the same place in the list, else the restore link.
  const focusAfter = useRef<number | null>(null);
  const notices = every.filter((n) => !(canHide(n) && isHidden(hidden, n)));
  const hiddenCount = every.length - notices.length;
  const shown = all ? notices : visibleNotices(notices, LAYOUT_NOTICES_SHOWN);
  useEffect(() => {
    const at = focusAfter.current;
    if (at === null) {
      return;
    }
    focusAfter.current = null;
    const closers = listRef.current?.querySelectorAll<HTMLElement>(".k-notice__close button");
    const next = closers?.[Math.min(at, (closers?.length ?? 0) - 1)];
    (next ?? restoreRef.current)?.focus();
  });
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
        <ul ref={listRef} class="stage-notes" aria-label="Layout messages" data-region="notes">
          {shown.map((n, i) => (
            <li key={`${n.code}|${n.path ?? ""}|${n.message}`}>
              <Notice
                tone={n.level === "info" ? "info" : "warn"}
                title={LEAD[n.level]}
                onClose={
                  onHide !== undefined && canHide(n)
                    ? () => {
                        focusAfter.current = i;
                        onHide(n);
                      }
                    : undefined
                }
              >
                {n.message}
              </Notice>
            </li>
          ))}
        </ul>
      ) : null}
      {hiddenCount > 0 && onShowHidden !== undefined ? (
        <Button
          ref={restoreRef}
          variant="quiet"
          class="stage-more"
          onClick={() => {
            focusAfter.current = null;
            onShowHidden();
          }}
        >
          {`Show ${hiddenCount} hidden`}
        </Button>
      ) : null}
      {folded ? (
        <Button variant="quiet" class="stage-more" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : "Show all"}
        </Button>
      ) : null}
    </>
  );
}
