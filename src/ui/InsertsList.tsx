// src/ui/InsertsList.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { ProjectListEntry } from "../share";

const shown = (name: string): string => (name === "" ? "(unnamed)" : name);

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
    <div class="delete-confirm" role="group" aria-label={`Delete “${shown(name)}”?`}>
      <p class="hint">{`Delete “${shown(name)}” from this browser? This can't be undone.`}</p>
      <div class="button-row">
        <button type="button" class="menu-delete tap" onClick={onConfirm}>
          Delete
        </button>
        <button type="button" class="tap" ref={keep} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export interface InsertsListProps {
  currentId: string;
  projects: readonly ProjectListEntry[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/** The inserts saved in this browser: open one, or delete one after a question. */
export function InsertsList({ currentId, projects, onOpen, onDelete }: InsertsListProps) {
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
    return <p class="hint">Nothing saved yet.</p>;
  }
  return (
    <ul class="inserts-list" ref={list}>
      {projects.map((p) => (
        <li key={p.id} class="inserts-row">
          <div class="inserts-line">
            {p.id === currentId ? (
              <span class="inserts-name">
                {shown(p.name)} <span class="pf-badge inserts-open">Open now</span>
              </span>
            ) : (
              <button type="button" class="inserts-name quiet tap" onClick={() => onOpen(p.id)}>
                {shown(p.name)}
              </button>
            )}
            <button
              type="button"
              class="quiet menu-delete tap"
              data-delete={p.id}
              aria-expanded={asking === p.id}
              onClick={() => setAsking(asking === p.id ? null : p.id)}
            >
              {"Delete… "}
              <span class="visually-hidden">{shown(p.name)}</span>
            </button>
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
