// src/ui/components/WhatsInside.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  Box,
  Component,
  ComponentKind,
  Group,
  Lock,
  Printer,
  TraySpec,
} from "../../model/types";
import { DEFAULT_GROUP_NAME, groupById } from "../../model/groups";
import type { Access } from "../../model/types";
import { Rail, SheetList } from "../../screens/Rail";
import { kindIndexOf, shadeVars } from "../identity";
import { EditorPanel } from "./EditorPanel";
import { GroupEditor } from "./GroupEditor";
import type { GroupEditorMember } from "./GroupEditor";

/** What the group editor does to the project: each is one undo step, and the app says what it changed. */
export interface GroupEditActions {
  rename: (groupId: string, name: string) => void;
  copies: (groupId: string, copies: number) => void;
  access: (groupId: string, access: Access) => void;
  /** An item moved to a place in the group's order. */
  move: (groupId: string, itemId: string, index: number) => void;
  /** Returns false when nothing was removed. */
  remove: (groupId: string) => boolean;
}

export interface WhatsInsideProps {
  components: readonly Component[];
  /**
   * The component whose editor is open (null: the list), when the caller keeps it: the tray bar's
   * Edit opens an editor from outside, and so does a first item added before the list was shown.
   * Without it the list keeps this to itself.
   */
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  /** The plan's trays; absent while the plan is out of date. */
  trays?: readonly TraySpec[];
  locks?: readonly Lock[];
  groups?: readonly Group[];
  box: Box;
  /** The insert's printer: the rail's foot says its bed. */
  printer: Printer;
  /** The sheet's list (a phone) rather than the rail's. */
  phone?: boolean;
  /** The components the selected tray belongs to (a group's tray has several). */
  selectedIds?: readonly string[];
  /** The components whose tray does not fit (a fit problem): their rows say so. */
  culprits?: ReadonlySet<string>;
  onOpenBox: () => void;
  onSettings: () => void;
  onHover?: (id: string | null) => void;
  /** The pointer or the focus is on a group's card (every member's id: all its trays light), or left it (null). */
  onLight?: (ids: readonly string[] | null) => void;
  /**
   * The group whose editor is open (null: the list or an item's editor), when the caller keeps it:
   * the tray bar's Edit and the status heading's "Edit <group>" open it from outside. Without it
   * the list keeps this to itself.
   */
  openGroupId?: string | null;
  onOpenGroupChange?: (groupId: string | null) => void;
  /** What the group editor does to the project. */
  groupActions?: GroupEditActions;
  /** Every pin and size lock comes off, in one undo step. */
  onClearChoices: () => void;
  onAdd: (kind: ComponentKind) => void;
  /** Add's Group tile: an empty group, its header focused. */
  onAddGroup: () => void;
  onChange: (id: string, next: Component) => void;
  /** Returns false when nothing was removed. */
  onRemove: (id: string) => boolean;
  onUnpin?: (trayKeys: string[]) => void;
  onUnlockSize?: (trayKeys: string[]) => void;
  /** An option of the open editor changed, and this is what it does: the stage shows it as a note. */
  onNote?: (text: string) => void;
  /** The phone's strip in the open editor: the tray drawn small and the sentence (or the note). */
  strip?: ComponentChildren;
}

/**
 * "What's inside": the rail's list (the sheet's, on a phone), or, once a row is chosen, that
 * component's editor in its place (Done or the back link return to the list). A component just
 * added opens at once. The focus follows: the editor's heading when it opens, the row left (or the
 * one that took its place, or the Add pill) when it closes.
 */
export function WhatsInside({
  components,
  openId: controlledId,
  onOpenChange,
  trays,
  locks,
  groups,
  box,
  printer,
  phone = false,
  selectedIds,
  culprits,
  onOpenBox,
  onSettings,
  onHover,
  onLight,
  openGroupId: controlledGroupId,
  onOpenGroupChange,
  groupActions,
  onClearChoices,
  onAdd,
  onAddGroup,
  onChange,
  onRemove,
  onUnpin,
  onUnlockSize,
  onNote,
  strip,
}: WhatsInsideProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ownId, setOwnId] = useState<string | null>(null);
  const openId = controlledId === undefined ? ownId : controlledId;
  const setOpenId = onOpenChange ?? setOwnId;
  const [ownGroupId, setOwnGroupId] = useState<string | null>(null);
  const openGroupId = controlledGroupId === undefined ? ownGroupId : controlledGroupId;
  const setOpenGroupId = onOpenGroupChange ?? setOwnGroupId;
  // An item's editor opened from a group's: its back link names the group and returns to it.
  const [from, setFrom] = useState<{ groupId: string; itemId: string } | null>(null);
  // The group editor that an item's editor came back to puts the focus on that item's name.
  const [focusMember, setFocusMember] = useState<string | undefined>(undefined);
  // What the rail says aloud (a polite live region): the group editor's moves, by names.
  const [said, setSaid] = useState("");
  const comeBackTo = useRef<{
    id: string;
    index: number;
    removed: boolean;
    /** `id` is a group's: its header takes the focus. */
    group?: boolean;
  } | null>(null);
  const knownIds = useRef(new Set(components.map((c) => c.id)));
  // Only an Add pressed here opens the new item. An item that turns up any other way (another
  // project, an Undo that brings one back, a Redo of an add) must not open an editor or take focus.
  const adding = useRef(false);

  useEffect(() => {
    const added = components.filter((c) => !knownIds.current.has(c.id));
    knownIds.current = new Set(components.map((c) => c.id));
    const last = added[added.length - 1];
    if (last && added.length === 1 && adding.current) {
      setOpenId(last.id);
    }
    adding.current = false;
  }, [components]);

  const index = components.findIndex((c) => c.id === openId);
  const open = index === -1 ? undefined : components[index];
  // The open component went (another project, an undo): back to the list.
  useEffect(() => {
    if (openId !== null && open === undefined) {
      setOpenId(null);
    }
  }, [openId, open]);
  const openGroup = openGroupId === null ? undefined : groupById({ groups }, openGroupId);
  // The open group went (another project, an undo): back to the list.
  useEffect(() => {
    if (openGroupId !== null && openGroup === undefined) {
      setOpenGroupId(null);
    }
  }, [openGroupId, openGroup]);
  // The group editor has gone: the item it was coming back to is not waiting any more.
  useEffect(() => {
    if (openGroup === undefined && focusMember !== undefined) {
      setFocusMember(undefined);
    }
  }, [openGroup, focusMember]);
  // The item opened from a group's editor is no longer the open one (another editor took its
  // place, or the list is back): its way back to the group is gone with it.
  useEffect(() => {
    if (from !== null && from.itemId !== openId) {
      setFrom(null);
    }
  }, [from, openId]);

  // The list is back: put the focus where the person was.
  useEffect(() => {
    const back = comeBackTo.current;
    if (open !== undefined || openGroup !== undefined || back === null) {
      return;
    }
    const root = rootRef.current;
    const rows = [...(root?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])];
    const own =
      back.group === true
        ? root?.querySelector<HTMLElement>(`[data-group-head="${back.id}"]`)
        : rows.find((r) => r.dataset.rowId === back.id);
    if (back.removed && own !== undefined && own !== null) {
      // Removed, but the list still shows it: the edit has not reached this render. Wait for it.
      return;
    }
    comeBackTo.current = null;
    const row = own ?? rows[Math.min(back.index, rows.length - 1)];
    // On a phone the Add pill is the sheet's, not the list's.
    (
      row ??
      root?.querySelector<HTMLElement>("[data-rail-add]") ??
      document.querySelector<HTMLElement>("[data-rail-add]")
    )?.focus();
  }, [open, openGroup, components, groups]);

  // Always mounted, so a reader hears a move as it is said.
  const live = (
    <div class="visually-hidden" role="status" data-live="rail">
      {said}
    </div>
  );

  if (openGroup !== undefined) {
    const group = openGroup;
    const views: GroupEditorMember[] = group.memberIds.flatMap((id) => {
      const i = components.findIndex((c) => c.id === id);
      const c = components[i];
      if (c === undefined) {
        return [];
      }
      const name = c.name === "" ? "(unnamed)" : c.name;
      const sameName = components.some((o) => o.id !== c.id && o.name === c.name);
      return [
        {
          id: c.id,
          kind: c.kind,
          name,
          who: sameName ? `${name} (item ${i + 1})` : name,
          shade: shadeVars(c.kind, kindIndexOf(components, i)),
        },
      ];
    });
    const firstMember = components.findIndex((c) => group.memberIds.includes(c.id));
    const leaveGroup = (): void => {
      comeBackTo.current = {
        id: group.id,
        index: Math.max(0, firstMember),
        removed: false,
        group: true,
      };
      setOpenGroupId(null);
    };
    return (
      <div class="wi ws-interim wi--edit" ref={rootRef}>
        <GroupEditor
          key={group.id}
          group={group}
          index={(groups ?? []).findIndex((g) => g.id === group.id)}
          members={views}
          phone={phone}
          strip={strip}
          focusItemId={focusMember}
          onRename={(name) => groupActions?.rename(group.id, name)}
          onCopies={(n) => groupActions?.copies(group.id, n)}
          onAccess={(a) => groupActions?.access(group.id, a)}
          onMove={(itemId, at) => groupActions?.move(group.id, itemId, at)}
          onOpenItem={(itemId) => {
            // its editor in this one's place; its back link names the group
            setFrom({ groupId: group.id, itemId });
            setOpenGroupId(null);
            setOpenId(itemId);
          }}
          onBack={leaveGroup}
          onRemove={() => {
            comeBackTo.current = {
              id: group.id,
              index: Math.max(0, firstMember),
              removed: true,
              group: true,
            };
            if (groupActions?.remove(group.id) === true) {
              setOpenGroupId(null);
            } else {
              comeBackTo.current = null;
            }
          }}
          onAnnounce={setSaid}
        />
        {live}
      </div>
    );
  }
  if (open === undefined) {
    const list = {
      components,
      trays,
      locks,
      groups,
      box,
      selectedIds,
      culprits,
      onOpenBox,
      onOpenEditor: setOpenId,
      onHover,
      onLight,
      onEditGroup: setOpenGroupId,
      onUnpin,
      onUnlockSize,
      onClearChoices,
    };
    return (
      <div class="wi" ref={rootRef}>
        {phone ? (
          <SheetList {...list} />
        ) : (
          <Rail
            {...list}
            printer={printer}
            onSettings={onSettings}
            onAddGroup={onAddGroup}
            onAdd={(kind) => {
              adding.current = true;
              onAdd(kind);
            }}
          />
        )}
        {live}
      </div>
    );
  }
  // The group this item's editor came from, if it is still there: the way back goes to its editor.
  const backGroup =
    from !== null && from.itemId === open.id ? groupById({ groups }, from.groupId) : undefined;
  const closeItem = (removed: boolean): void => {
    if (backGroup === undefined) {
      comeBackTo.current = { id: open.id, index, removed };
      setOpenId(null);
      return;
    }
    // back to the group's editor: its order list takes the focus on this item's name
    setFocusMember(removed ? undefined : open.id);
    setOpenId(null);
    setOpenGroupId(backGroup.id);
  };
  const leave = (): void => closeItem(false);
  return (
    <div class="wi ws-interim wi--edit" ref={rootRef}>
      <EditorPanel
        key={open.id}
        component={open}
        index={index}
        kindIndex={kindIndexOf(components, index)}
        sameName={components.some((o) => o.id !== open.id && o.name === open.name)}
        phone={phone}
        strip={strip}
        onNote={onNote}
        onChange={(next) => onChange(open.id, next)}
        onBack={leave}
        backLabel={backGroup === undefined ? undefined : backGroup.name || DEFAULT_GROUP_NAME}
        onRemove={() => {
          comeBackTo.current = { id: open.id, index, removed: true };
          if (onRemove(open.id)) {
            closeItem(true);
          } else {
            comeBackTo.current = null;
          }
        }}
      />
      {live}
    </div>
  );
}
