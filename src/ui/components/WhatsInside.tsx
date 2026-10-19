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
import { Rail, SheetList } from "../../screens/Rail";
import { kindIndexOf } from "../identity";
import { EditorPanel } from "./EditorPanel";

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
  /** Every pin and size lock comes off, in one undo step. */
  onClearChoices: () => void;
  onAdd: (kind: ComponentKind) => void;
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
  onClearChoices,
  onAdd,
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
  const comeBackTo = useRef<{ id: string; index: number; removed: boolean } | null>(null);
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

  // The list is back: put the focus where the person was.
  useEffect(() => {
    const back = comeBackTo.current;
    if (open !== undefined || back === null) {
      return;
    }
    const root = rootRef.current;
    const rows = [...(root?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])];
    const own = rows.find((r) => r.dataset.rowId === back.id);
    if (back.removed && own !== undefined) {
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
  }, [open, components]);

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
            onAdd={(kind) => {
              adding.current = true;
              onAdd(kind);
            }}
          />
        )}
      </div>
    );
  }
  const leave = (): void => {
    comeBackTo.current = { id: open.id, index, removed: false };
    setOpenId(null);
  };
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
        onRemove={() => {
          comeBackTo.current = { id: open.id, index, removed: true };
          if (onRemove(open.id)) {
            setOpenId(null);
          } else {
            comeBackTo.current = null;
          }
        }}
      />
    </div>
  );
}
