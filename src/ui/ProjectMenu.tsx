// src/ui/ProjectMenu.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { CopyLinkResult } from "../app/link";
import { LINK_MAX_URL_CHARS } from "../share";
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
        Save to a file instead
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
  // Tagged with the project it was made for, so it never shows against another one.
  const [copy, setCopy] = useState<{ id: string; result: CopyLinkResult } | null>(null);
  const [problem, setProblem] = useState<{ id: string; message: string } | null>(null);
  // The tag already hides a result from another project; clearing also stops it coming back
  // when the user returns to the first one.
  // Counts project switches, so a request started before one is recognised when it resolves,
  // even if the user has come back to the same project by then.
  const switches = useRef({ id: currentId, count: 0 });
  if (switches.current.id !== currentId) {
    switches.current = { id: currentId, count: switches.current.count + 1 };
  }
  useEffect(() => {
    setCopy(null);
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

  function copyCurrentLink(): void {
    const id = currentId;
    const started = switches.current.count;
    setProblem(null);
    props.onCopyLink().then(
      (result) => {
        // A result for a project that was left meanwhile is dropped, not kept for its return.
        if (switches.current.count === started) {
          setCopy({ id, result });
        }
      },
      (e: unknown) => {
        if (switches.current.count === started) {
          setProblem({ id, message: `Couldn't make the link: ${errorText(e)}` });
        }
      },
    );
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
        <button type="button" onClick={copyCurrentLink}>
          Copy link
        </button>
      </div>
      <p class="hint">The link holds the whole project, so you can send it to someone.</p>
      {storageAvailable ? (
        <>
          <button type="button" class="menu-delete" onClick={() => props.onDelete(currentId)}>
            Delete project
          </button>
          <p class="hint">{`Deletes “${name === "" ? "(unnamed)" : name}” from this browser.`}</p>
        </>
      ) : null}
      {copy?.id === currentId ? (
        <CopyStatus result={copy.result} onExportJson={props.onExportJson} />
      ) : null}
      {problem?.id === currentId ? (
        <p class="link-status link-warning" role="alert">
          {problem.message}
        </p>
      ) : null}
    </div>
  );
}
