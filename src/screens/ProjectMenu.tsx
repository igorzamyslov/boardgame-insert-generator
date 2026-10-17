// src/screens/ProjectMenu.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import { CONFLICT_CODE } from "../app/persistence";
import type { ConflictChoice } from "../app/persistence";
import { Button, Icon, MenuItem, MenuLink, MenuPanel, MenuSeparator } from "../kit";
import type { Notice } from "../model/types";
import { APP_VERSION, BUILD_ID } from "../model/version";
import type { ProjectListEntry } from "../share";
import { InsertsList } from "../ui/InsertsList";

export interface ProjectMenuProps {
  /** The open insert's name (for the list, when it is not saved yet). */
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
  /** Goes to the settings section. */
  onSettings: () => void;
  /** After a choice that leaves the menu. */
  onClose: () => void;
  /** Phone: the header has no Redo, so it is the menu's first item. */
  phone?: boolean;
  canRedo?: boolean;
  onRedo?: () => void;
  /** The notices that wait in the menu (a conflict, a failed save, no storage), shown at its top. */
  notices?: readonly Notice[];
  /** Another tab saved this insert: the note offers the two choices until one is made. */
  conflict?: boolean;
  onResolveConflict?: (choice: ConflictChoice) => void;
  onDismissNotice?: (code: string) => void;
  /**
   * The insert is empty (the first visit): New insert is blocked, so empty inserts do not pile up,
   * and Open file… is not here, the header has it.
   */
  firstVisit?: boolean;
}

type Page = "menu" | "inserts";

/** Main's `menuNote`: a tinted box inside the menu, a bold title, its words and up to two pills. */
function MenuNote({
  title,
  children,
  primary,
  secondary,
}: {
  title?: string;
  children: string;
  primary?: { label: string; onClick: () => void; name?: string };
  secondary?: { label: string; onClick: () => void; name?: string };
}) {
  return (
    <div class="pm-note">
      <span>
        {title !== undefined ? <strong>{title}</strong> : null}
        {title !== undefined ? " " : null}
        {children}
      </span>
      {primary !== undefined || secondary !== undefined ? (
        <span class="pm-note__actions">
          {primary !== undefined ? (
            <Button variant="primary" aria-label={primary.name} onClick={primary.onClick}>
              {primary.label}
            </Button>
          ) : null}
          {secondary !== undefined ? (
            <Button variant="secondary" aria-label={secondary.name} onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * What the "⋯" button opens (Main's menu panel): the insert's file and list actions, then the
 * version and the licences. "Your inserts" is a page of the same panel, with a Back button.
 */
export function ProjectMenu(props: ProjectMenuProps) {
  const { name, currentId, projects, storageAvailable } = props;
  const [page, setPage] = useState<Page>("menu");
  const listed = projects.some((p) => p.id === currentId)
    ? projects
    : [{ id: currentId, name, updatedAt: 0 }, ...projects];
  const backRef = useRef<HTMLButtonElement>(null);
  const insertsRef = useRef<HTMLButtonElement>(null);
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
      <MenuPanel label="Project" region="menu">
        <div class="pm-head">
          <Button
            variant="quiet"
            ref={backRef}
            icon={<Icon name="chevron-left" size={16} />}
            onClick={() => setPage("menu")}
          >
            Back
          </Button>
          <h2 class="pm-title">Your inserts</h2>
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
      </MenuPanel>
    );
  }

  return (
    <MenuPanel label="Project" region="menu">
      {props.phone === true ? (
        <MenuItem
          blockedReason={props.canRedo === true ? undefined : "Nothing to redo"}
          onClick={choose(() => props.onRedo?.())}
        >
          Redo
        </MenuItem>
      ) : null}
      {(props.notices ?? []).map((n) =>
        n.code === CONFLICT_CODE && props.conflict === true ? (
          // The choice stays on screen, with no way to dismiss it, while saving is paused for it.
          <MenuNote
            key={`${n.code}|${n.message}`}
            title="You changed this insert in another tab."
            primary={{
              label: "Keep this version",
              onClick: choose(() => props.onResolveConflict?.("keepMine")),
            }}
            secondary={{
              label: "Use the other tab version",
              onClick: choose(() => props.onResolveConflict?.("loadTheirs")),
            }}
          >
            Saving is paused here until you choose.
          </MenuNote>
        ) : (
          <MenuNote
            key={`${n.code}|${n.path ?? ""}|${n.message}`}
            secondary={
              props.onDismissNotice === undefined
                ? undefined
                : {
                    label: "Dismiss",
                    name: `Dismiss: ${n.message}`,
                    onClick: () => props.onDismissNotice?.(n.code),
                  }
            }
          >
            {n.message}
          </MenuNote>
        ),
      )}
      <MenuItem
        blockedReason={props.firstVisit ? "This insert is empty" : undefined}
        onClick={choose(props.onNew)}
      >
        New insert
      </MenuItem>
      {storageAvailable ? (
        <MenuItem
          ref={insertsRef}
          meta={`${listed.length} in this browser`}
          onClick={() => setPage("inserts")}
        >
          Your inserts
        </MenuItem>
      ) : null}
      {props.firstVisit ? null : <MenuItem onClick={choose(props.onOpenFile)}>Open file…</MenuItem>}
      <MenuItem onClick={choose(props.onSaveFile)}>Save file</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={choose(props.onSettings)}>Settings</MenuItem>
      <MenuSeparator />
      <span class="pm-version">{`Insert Generator ${APP_VERSION} (${BUILD_ID})`}</span>
      <MenuLink href="./third-party-licenses.txt">Licences</MenuLink>
    </MenuPanel>
  );
}
