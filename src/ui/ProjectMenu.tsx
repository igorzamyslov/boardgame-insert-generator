// src/ui/ProjectMenu.tsx
import { useRef, useState } from "preact/hooks";
import type { CopyLinkResult } from "../app/link";
import { LINK_MAX_URL_CHARS } from "../share";
import type { ProjectListEntry } from "../share";
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
  onCopyLink: () => Promise<CopyLinkResult>;
}

function CopyStatus({
  result,
  onExportJson,
}: {
  result: CopyLinkResult;
  onExportJson: () => void;
}) {
  const longWarning = result.tooLong ? (
    <>
      {" "}
      It is {result.length} characters long; some chats (e.g. Discord) cut messages over{" "}
      {LINK_MAX_URL_CHARS} characters.{" "}
      <button type="button" onClick={onExportJson}>
        Download JSON instead
      </button>
    </>
  ) : null;
  if (result.status === "copied") {
    return (
      <p class={result.tooLong ? "link-status link-warning" : "link-status"} role="status">
        Link copied.{longWarning}
      </p>
    );
  }
  return (
    <div class="link-status link-warning" role="alert">
      <p>
        Couldn't copy automatically ({result.error}). Copy the link yourself:{longWarning}
      </p>
      <input
        class="copy-fallback"
        type="text"
        readOnly
        value={result.link}
        aria-label="Share link"
        onFocus={(e) => e.currentTarget.select()}
      />
    </div>
  );
}

export function ProjectMenu(props: ProjectMenuProps) {
  const { name, currentId, projects, storageAvailable } = props;
  const [copy, setCopy] = useState<CopyLinkResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listed = projects.some((p) => p.id === currentId)
    ? projects
    : [{ id: currentId, name, updatedAt: 0 }, ...projects];

  async function readFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    input.value = "";
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
      <div class="button-row">
        <button type="button" onClick={props.onNew}>
          New project
        </button>
        {storageAvailable ? (
          <button type="button" onClick={() => props.onDelete(currentId)}>
            Delete project
          </button>
        ) : null}
        <button type="button" onClick={() => fileRef.current?.click()}>
          Import JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          tabIndex={-1}
          aria-label="Import a project JSON file"
          onChange={(e) => {
            void readFile(e.currentTarget);
          }}
        />
        <button type="button" onClick={props.onExportJson}>
          Export JSON
        </button>
        <button
          type="button"
          onClick={() => {
            void props.onCopyLink().then(setCopy);
          }}
        >
          Copy link
        </button>
      </div>
      {copy ? <CopyStatus result={copy} onExportJson={props.onExportJson} /> : null}
    </div>
  );
}
