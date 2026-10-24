// src/ui/InsertsList.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import { Button, Icon, IconButton, MenuItem } from "../kit";
import type { ProjectListEntry } from "../share";

const shown = (name: string): string => (name === "" ? "(unnamed)" : name);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Edited 2 days ago": the line that tells two inserts of the same name apart. */
export function editedAgo(updatedAt: number, now: number): string {
  const age = Math.max(0, now - updatedAt);
  const unit = (n: number, word: string) => `Edited ${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (age < HOUR)
    return age < MINUTE ? "Edited just now" : unit(Math.floor(age / MINUTE), "minute");
  if (age < DAY) return unit(Math.floor(age / HOUR), "hour");
  return unit(Math.floor(age / DAY), "day");
}

export interface DeleteConfirmProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The question before an insert is deleted from this browser. */
export function DeleteConfirm({ name, onConfirm, onCancel }: DeleteConfirmProps) {
  const keep = useRef<HTMLButtonElement>(null);
  // The safe answer has the focus, so a stray Enter keeps the insert.
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div class="pm-confirm" role="group" aria-label={`Delete “${shown(name)}”?`}>
      <p class="pm-confirm__text">{`Delete “${shown(name)}” from this browser? This can't be undone.`}</p>
      <div class="pm-confirm__actions">
        <Button variant="secondary" class="pm-confirm__delete" onClick={onConfirm}>
          Delete
        </Button>
        <Button variant="secondary" ref={keep} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** A name on one line, cut with an ellipsis, over an optional muted line. */
function RowName({ name, meta }: { name: string; meta?: string }) {
  return (
    <span class="pm-row__text">
      <span class="ellipsis" title={shown(name)}>
        {shown(name)}
      </span>
      {meta ? <span class="k-menu__meta">{meta}</span> : null}
    </span>
  );
}

export interface InsertsListProps {
  currentId: string;
  projects: readonly ProjectListEntry[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** The clock, for "Edited … ago" (tests set it). */
  now?: number;
}

/**
 * The inserts saved in this browser, as rows of the project menu: open one, or delete one after a
 * question (Delete lives here, one per row, the open insert included).
 */
export function InsertsList({
  currentId,
  projects,
  onOpen,
  onDelete,
  now = Date.now(),
}: InsertsListProps) {
  const [asking, setAsking] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const deleted = useRef(false);
  // A deleted row takes the focus with it: it goes to the list's first item.
  useEffect(() => {
    if (deleted.current) {
      deleted.current = false;
      list.current?.querySelector("button")?.focus();
    }
  }, [projects]);
  if (projects.length === 0) {
    return <p class="pm-empty">Nothing saved yet.</p>;
  }
  const seen = new Set<string>();
  const twins = new Set<string>();
  for (const p of projects) (seen.has(p.name) ? twins : seen).add(p.name);
  return (
    <ul class="pm-list" ref={list}>
      {projects.map((p) => (
        <li key={p.id} class="pm-list__item">
          <div class="pm-row">
            {p.id === currentId ? (
              // not a button: the open insert has nothing to open; the item's look is the menu's
              <span class="k-menu__item pm-row__name pm-row__name--open">
                <RowName name={p.name} meta="Open now" />
              </span>
            ) : (
              <MenuItem class="pm-row__name" onClick={() => onOpen(p.id)}>
                <RowName
                  name={p.name}
                  meta={twins.has(p.name) ? editedAgo(p.updatedAt, now) : undefined}
                />
              </MenuItem>
            )}
            <IconButton
              class="pm-row__delete"
              label={`Delete ${shown(p.name)}…`}
              data-delete={p.id}
              aria-expanded={asking === p.id}
              icon={<Icon name="trash" size={18} />}
              onClick={() => setAsking(asking === p.id ? null : p.id)}
            />
          </div>
          {asking === p.id ? (
            <DeleteConfirm
              name={p.name}
              onCancel={() => {
                setAsking(null);
                // back on the button that asked
                [...(list.current?.querySelectorAll<HTMLElement>("[data-delete]") ?? [])]
                  .find((el) => el.dataset.delete === p.id)
                  ?.focus();
              }}
              onConfirm={() => {
                setAsking(null);
                deleted.current = true;
                onDelete(p.id);
              }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
