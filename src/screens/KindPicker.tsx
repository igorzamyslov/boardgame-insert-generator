// src/screens/KindPicker.tsx
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { Button, Icon, KindTile, MenuPanel } from "../kit";
import type { ComponentKind } from "../model/types";

/** The five kinds in the words of Empty's tiles. */
export const KIND_TILES: readonly { kind: ComponentKind; label: string }[] = [
  { kind: "cards", label: "Cards" },
  { kind: "bulk", label: "Tokens and dice" },
  { kind: "tiles", label: "Tiles" },
  { kind: "minis", label: "Miniatures" },
  { kind: "custom", label: "Something else" },
];

/** One kind tile per kind of component, in Empty's style. */
export function KindTiles({ onPick }: { onPick: (kind: ComponentKind) => void }) {
  return (
    <>
      {KIND_TILES.map((t) => (
        <KindTile key={t.kind} kind={t.kind} onClick={() => onPick(t.kind)}>
          {t.label}
        </KindTile>
      ))}
    </>
  );
}

export const KIND_PICKER_LABEL = "Add something inside";

/**
 * What the Add pill opens (G3): the menu's panel holding the five kind tiles, as Empty draws them,
 * and, when a group can be added, a sixth, "Group". The first visit has no such tile (a group
 * needs items first): it draws `KindTiles` alone.
 */
export function KindPicker({
  onPick,
  onGroup,
}: {
  onPick: (kind: ComponentKind) => void;
  onGroup?: () => void;
}) {
  return (
    <MenuPanel label={KIND_PICKER_LABEL} region="kind-picker">
      <KindTiles onPick={onPick} />
      {onGroup === undefined ? null : (
        <KindTile kind="group" onClick={onGroup}>
          Group
        </KindTile>
      )}
    </MenuPanel>
  );
}

export interface AddMenuProps {
  onPick: (kind: ComponentKind) => void;
  /** Adds an empty group: the picker has its sixth tile when this is given. */
  onGroup?: () => void;
  /** Where the picker opens: under the pill (the rail), or over it (the phone's sheet). */
  placement?: "below" | "above";
}

/**
 * The Add pill (Main) with the picker it opens. It is a disclosure, as the project menu is:
 * opening puts the focus on the first kind; Escape, a click outside, or the focus leaving closes
 * it; choosing a kind closes it and hands the kind to the owner (which opens the new item); choosing
 * Group closes it and has the owner add an empty group.
 */
export function AddMenu({ onPick, onGroup, placement = "below" }: AddMenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      panel.current?.querySelector<HTMLElement>("button")?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onClick = (e: MouseEvent): void => {
      // A choice inside may replace its own button before this runs: the path says where it began.
      const inside = wrap.current !== null && e.composedPath().includes(wrap.current);
      if (!inside) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);
  return (
    <div
      class="kp"
      ref={wrap}
      onKeyDown={(e) => {
        // The sheet folds on an Escape nobody took: this one is the picker's.
        if (open && e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlurCapture={(e) => {
        const to = e.relatedTarget;
        if (open && to instanceof Node && !wrap.current?.contains(to)) {
          setOpen(false);
        }
      }}
    >
      <Button
        ref={button}
        class="kp__add"
        icon={<Icon name="plus" size={14} />}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-rail-add=""
        onClick={() => setOpen(!open)}
      >
        Add
      </Button>
      {open ? (
        <div class="kp__panel" id={id} ref={panel} data-placement={placement}>
          <KindPicker
            onPick={(kind) => {
              setOpen(false);
              onPick(kind);
            }}
            onGroup={
              onGroup === undefined
                ? undefined
                : () => {
                    setOpen(false);
                    onGroup();
                  }
            }
          />
        </div>
      ) : null}
    </div>
  );
}
