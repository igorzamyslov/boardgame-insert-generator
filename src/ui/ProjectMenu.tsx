// src/ui/ProjectMenu.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { ProjectListEntry } from "../share";
import { errorText } from "../util/errors";
import { SelectField, TextField } from "./fields";

export interface ProjectMenuProps {
  name: string;
  currentId: string;
  projects: readonly ProjectListEntry[];
  storageAvailable: boolean;
  onRename: (name: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onImport: (text: string) => void;
  onExportJson: () => void;
}

export function ProjectMenu(props: ProjectMenuProps) {
  const { name, currentId, projects, storageAvailable } = props;
  // Tagged with the project it was made for, so it never shows against another one.
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);
  // The tag already hides a problem from another project; clearing also stops it coming back
  // when the user returns to the first one.
  useEffect(() => {
    setProblem(null);
  }, [currentId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const listed = projects.some((p) => p.id === currentId)
    ? projects
    : [{ id: currentId, name, updatedAt: 0 }, ...projects];

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
    props.onImport(text);
  }

  return (
    <div class="project-menu">
      <TextField id="project-name" label="Project name" value={name} onCommit={props.onRename} />
      {storageAvailable ? (
        <SelectField
          id="project-open"
          label="Saved projects"
          value={currentId}
          options={listed.map((p) => ({
            value: p.id,
            label: p.name === "" ? "(unnamed)" : p.name,
          }))}
          onChange={props.onOpen}
        />
      ) : null}
      <p class="hint">
        {storageAvailable
          ? "Saved in this browser as you work."
          : "This browser blocks saving: use Save to file to keep your work."}
      </p>
      <div class="menu-actions">
        <button type="button" onClick={props.onNew}>
          New project
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Open from file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          tabIndex={-1}
          aria-label="Open a project file"
          onChange={(e) => {
            void readFile(e.currentTarget);
          }}
        />
        <button type="button" onClick={props.onExportJson}>
          Save to file
        </button>
      </div>
      <p class="hint">
        A saved file holds the whole project: keep it, send it, or open it elsewhere.
      </p>
      {storageAvailable ? (
        <>
          <button type="button" class="menu-delete" onClick={() => props.onDelete(currentId)}>
            Delete project
          </button>
          <p class="hint">{`Deletes “${name === "" ? "(unnamed)" : name}” from this browser.`}</p>
        </>
      ) : null}
      {problem?.id === currentId ? (
        <p class="link-status link-warning" role="alert">
          {problem.message}
        </p>
      ) : null}
    </div>
  );
}
