// src/ui/ProjectMenu.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { ProjectListEntry } from "../share";
import { errorText } from "../util/errors";
import { DeleteConfirm, InsertsList } from "./InsertsList";

export interface ProjectMenuProps {
  /** The open insert's name (for the delete question). */
  name: string;
  currentId: string;
  projects: readonly ProjectListEntry[];
  storageAvailable: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onImport: (text: string) => void;
  onSaveFile: () => void;
  /** Phone: hands the file to the share sheet (the owner saves it where that isn't possible). */
  onSendFile: () => void;
  /** Goes to the settings section. */
  onSettings: () => void;
  /** After a choice that leaves the menu. */
  onClose: () => void;
}

type Page = "menu" | "inserts";

/** What the "⋯" button opens: the insert's file and list actions. */
export function ProjectMenu(props: ProjectMenuProps) {
  const { name, currentId, projects, storageAvailable } = props;
  const [page, setPage] = useState<Page>("menu");
  const [deleting, setDeleting] = useState(false);
  // Tagged with the insert it was made for, so it never shows against another one.
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    setProblem(null);
    setDeleting(false);
  }, [currentId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const listed = projects.some((p) => p.id === currentId)
    ? projects
    : [{ id: currentId, name, updatedAt: 0 }, ...projects];

  /** Runs a choice that leaves the menu. */
  const choose = (fn: () => void) => (): void => {
    props.onClose();
    fn();
  };

  async function readFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      setProblem({ id: currentId, message: `Couldn't read ${file.name}: ${errorText(e)}` });
      return;
    } finally {
      input.value = "";
    }
    setProblem(null);
    props.onClose();
    props.onImport(text);
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      class="visually-hidden"
      tabIndex={-1}
      aria-label="Open an insert file"
      onChange={(e) => {
        void readFile(e.currentTarget);
      }}
    />
  );

  if (page === "inserts") {
    return (
      <div class="project-menu">
        <div class="menu-head">
          <button type="button" class="quiet tap" onClick={() => setPage("menu")}>
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
        {fileInput}
      </div>
    );
  }

  return (
    <div class="project-menu">
      <div class="menu-items">
        <button type="button" class="menu-item" onClick={choose(props.onNew)}>
          New insert
        </button>
        {storageAvailable ? (
          <button type="button" class="menu-item" onClick={() => setPage("inserts")}>
            Your inserts
          </button>
        ) : null}
        <button type="button" class="menu-item" onClick={() => fileRef.current?.click()}>
          Open file…
        </button>
        {fileInput}
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
          onCancel={() => setDeleting(false)}
          onConfirm={choose(() => props.onDelete(currentId))}
        />
      ) : null}
      <p class="hint">
        {storageAvailable
          ? "A saved file holds the whole insert: keep it, send it, or open it elsewhere."
          : "This browser blocks saving: use Save file to keep your work."}
      </p>
      {problem?.id === currentId ? (
        <p class="link-status link-warning" role="alert">
          {problem.message}
        </p>
      ) : null}
    </div>
  );
}
