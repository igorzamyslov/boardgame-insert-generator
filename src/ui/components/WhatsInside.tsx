// src/ui/components/WhatsInside.tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { Component, ComponentKind, Lock, TraySpec } from "../../model/types";
import { kindIndexOf } from "../identity";
import { ComponentList } from "./ComponentList";
import { EditorPanel } from "./EditorPanel";

export interface WhatsInsideProps {
  components: readonly Component[];
  /**
   * Set while the list is first shown right after the first item was added (the first visit had
   * no list yet): that item's editor opens at once, as any item added later does.
   */
  openFirst?: boolean;
  /** The plan's trays; absent while the plan is out of date. */
  trays?: readonly TraySpec[];
  locks?: readonly Lock[];
  onAdd: (kind: ComponentKind) => void;
  onChange: (id: string, next: Component) => void;
  /** Returns false when nothing was removed. */
  onRemove: (id: string) => boolean;
  onUnpin?: (trayKeys: string[]) => void;
  onUnlockSize?: (trayKeys: string[]) => void;
}

/**
 * The aside's "What's inside": the list, or, once a row is chosen, that component's editor in its
 * place (Done or the back link return to the list). A component just added opens at once. The
 * focus follows: the editor's heading when it opens, the row left (or the one that took its place,
 * or the Add buttons) when it closes.
 */
export function WhatsInside({
  components,
  openFirst = false,
  trays,
  locks,
  onAdd,
  onChange,
  onRemove,
  onUnpin,
  onUnlockSize,
}: WhatsInsideProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(
    openFirst && components.length === 1 ? (components[0]?.id ?? null) : null,
  );
  const comeBackTo = useRef<{ id: string; index: number; removed: boolean } | null>(null);
  const knownIds = useRef(new Set(components.map((c) => c.id)));

  useEffect(() => {
    const added = components.filter((c) => !knownIds.current.has(c.id));
    knownIds.current = new Set(components.map((c) => c.id));
    const last = added[added.length - 1];
    if (last && added.length === 1) {
      setOpenId(last.id);
    }
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
    const target =
      row?.querySelector<HTMLElement>(".pf-row__open") ??
      root?.querySelector<HTMLElement>(".pf-kinds button");
    target?.focus();
  }, [open, components]);

  if (open === undefined) {
    return (
      <div ref={rootRef}>
        <ComponentList
          components={components}
          trays={trays}
          locks={locks}
          onAdd={onAdd}
          onOpen={setOpenId}
          onUnpin={onUnpin}
          onUnlockSize={onUnlockSize}
        />
      </div>
    );
  }
  const leave = (): void => {
    comeBackTo.current = { id: open.id, index, removed: false };
    setOpenId(null);
  };
  return (
    <div ref={rootRef}>
      <EditorPanel
        key={open.id}
        component={open}
        index={index}
        kindIndex={kindIndexOf(components, index)}
        sameName={components.some((o) => o.id !== open.id && o.name === open.name)}
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
