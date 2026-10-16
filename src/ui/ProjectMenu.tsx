// src/ui/ProjectMenu.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import { CONFLICT_CODE } from "../app/persistence";
import type { ConflictChoice } from "../app/persistence";
import type { Notice } from "../model/types";
import type { ProjectListEntry } from "../share";
import { DeleteConfirm, InsertsList } from "./InsertsList";
import { Notices } from "./Notices";

export interface ProjectMenuProps {
  /** The open insert's name (for the delete question). */
  name: string;
  currentId: string;
  projects: readonly ProjectListEntry[];
  storageAvailable: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  /** Opens the file chooser (the page owns the chooser, so closing the menu doesn't lose its answer). */
  onOpenFile: () => void;
  onSaveFile: () => void;
  /** Phone: hands the file to the share sheet (the owner saves it where that isn't possible). */
  onSendFile: () => void;
  /** Goes to the settings section. */
  onSettings: () => void;
  /** After a choice that leaves the menu. */
  onClose: () => void;
  /** The notices that wait in the menu (a conflict, a failed save, no storage), shown at its top. */
  notices?: readonly Notice[];
  /** Another tab saved this insert: the notice offers the two choices until one is made. */
  conflict?: boolean;
  onResolveConflict?: (choice: ConflictChoice) => void;
  onDismissNotice?: (code: string) => void;
}

type Page = "menu" | "inserts";

/** What the "⋯" button opens: the insert's file and list actions. */
export function ProjectMenu(props: ProjectMenuProps) {
  const { name, currentId, projects, storageAvailable } = props;
  const [page, setPage] = useState<Page>("menu");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    setDeleting(false);
  }, [currentId]);
  const listed = projects.some((p) => p.id === currentId)
    ? projects
    : [{ id: currentId, name, updatedAt: 0 }, ...projects];
  const backRef = useRef<HTMLButtonElement>(null);
  const insertsRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  // Changing page replaces the buttons: the focus goes to where the person came in, not to the page.
  useEffect(() => {
    if (moved.current) {
      (page === "inserts" ? backRef : insertsRef).current?.focus();
    }
    moved.current = true;
  }, [page]);

  /** Runs a choice that leaves the menu. */
  const choose = (fn: () => void) => (): void => {
    props.onClose();
    fn();
  };

  if (page === "inserts") {
    return (
      <div class="project-menu">
        <div class="menu-head">
          <button type="button" class="quiet tap" ref={backRef} onClick={() => setPage("menu")}>
            Back
          </button>
          <h2 class="menu-title">Your inserts</h2>
        </div>
        <InsertsList
          currentId={currentId}
          projects={listed}
          onOpen={(id) => {
            props.onClose();
            props.onOpen(id);
          }}
          onDelete={props.onDelete}
        />
      </div>
    );
  }

  const notices = props.notices ?? [];
  return (
    <div class="project-menu">
      {notices.length > 0 ? (
        <Notices
          notices={notices}
          label="Project messages"
          class="menu-notices"
          onDismiss={props.onDismissNotice}
          // The choice stays on screen while autosave is paused for it.
          canDismiss={(n) => !(n.code === CONFLICT_CODE && props.conflict)}
          renderAction={(n) =>
            n.code === CONFLICT_CODE && props.conflict ? (
              <span class="menu-notice-choices">
                <button type="button" onClick={choose(() => props.onResolveConflict?.("keepMine"))}>
                  Use this tab's version
                </button>
                <button
                  type="button"
                  onClick={choose(() => props.onResolveConflict?.("loadTheirs"))}
                >
                  Use the other tab's version
                </button>
              </span>
            ) : null
          }
        />
      ) : null}
      <div class="menu-items">
        <button type="button" class="menu-item" onClick={choose(props.onNew)}>
          New insert
        </button>
        {storageAvailable ? (
          <button
            type="button"
            class="menu-item"
            ref={insertsRef}
            onClick={() => setPage("inserts")}
          >
            Your inserts
          </button>
        ) : null}
        <button type="button" class="menu-item" onClick={choose(props.onOpenFile)}>
          Open file…
        </button>
        <button type="button" class="menu-item" onClick={choose(props.onSaveFile)}>
          Save file
        </button>
        <button type="button" class="menu-item menu-phone-only" onClick={choose(props.onSendFile)}>
          Send file
        </button>
        <button type="button" class="menu-item" onClick={choose(props.onSettings)}>
          Settings
        </button>
        {storageAvailable ? (
          <button
            type="button"
            class="menu-item menu-delete"
            ref={deleteRef}
            aria-expanded={deleting}
            onClick={() => setDeleting(!deleting)}
          >
            Delete…
          </button>
        ) : null}
      </div>
      {deleting ? (
        <DeleteConfirm
          name={name}
          onCancel={() => {
            setDeleting(false);
            deleteRef.current?.focus();
          }}
          onConfirm={choose(() => props.onDelete(currentId))}
        />
      ) : null}
      <p class="hint">
        {storageAvailable
          ? "A saved file holds the whole insert: save it, send it, or open it elsewhere."
          : "This browser blocks saving: use Save file so nothing is lost."}
      </p>
    </div>
  );
}
