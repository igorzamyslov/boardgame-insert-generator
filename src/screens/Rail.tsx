// src/screens/Rail.tsx
import type { ComponentKind, Box, Component, Group, Lock, Printer, TraySpec } from "../model/types";
import { Button, Card, Icon, IconTile, ListRow } from "../kit";
import { mm } from "../ui/identity";
import { ComponentList } from "../ui/components/ComponentList";
import type { DropTarget } from "../ui/components/useRailDrag";
import { AddMenu } from "./KindPicker";

/** "285 × 285 × 70": the box's inside, without its unit. */
function boxNumbers(box: Box): string {
  return `${mm(box.innerWidth)} × ${mm(box.innerDepth)} × ${mm(box.innerHeight)}`;
}

/** "285 × 285 × 70 mm": the box's inside. */
export function boxSize(box: Box): string {
  return `${boxNumbers(box)} mm`;
}

interface ListProps {
  components: readonly Component[];
  /** The plan's trays; absent while the plan is out of date (no layer is named then). */
  trays?: readonly TraySpec[];
  locks?: readonly Lock[];
  groups?: readonly Group[];
  box: Box;
  /** The components the selected tray belongs to (a group's tray has several). */
  selectedIds?: readonly string[];
  /** The components whose tray does not fit: their rows say so. */
  culprits?: ReadonlySet<string>;
  onOpenBox: () => void;
  onOpenEditor: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** The pointer or the focus is on a group's card (every member's id), or left it (null). */
  onLight?: (ids: readonly string[] | null) => void;
  /** A group's header was chosen: its editor. */
  onEditGroup?: (groupId: string) => void;
  /** An item was dragged by its grip (the rail only, not the phone's sheet): see `ComponentList`. */
  onDrop?: (itemId: string, target: DropTarget) => void;
  onUnpin?: (trayKeys: string[]) => void;
  /** A "Turned" chip's ×: these trays may turn as the plan likes. */
  onFreeTurn?: (trayKeys: string[]) => void;
  onUnlockSize?: (trayKeys: string[]) => void;
  /** Every rule comes off (pins, stack locks, size locks, turn locks), in one undo step. */
  onClearChoices: () => void;
}

export interface RailProps extends ListProps {
  /** The insert's printer: the footer says its bed. */
  printer: Printer;
  onAdd: (kind: ComponentKind) => void;
  /** Add's Group tile: an empty group. */
  onAddGroup: () => void;
  onSettings: () => void;
}

/** Lifts every rule, and keeps the focus: the note and its button go, so the Add pill takes it. */
function clearChoices(onClear: () => void): () => void {
  return () => {
    onClear();
    document.querySelector<HTMLElement>("[data-rail-add]")?.focus();
  };
}

const TURNED_NOTE = "Turned trays keep their direction when the plan updates.";

/**
 * What the note says the plan keeps, by which rules exist (a ruling, DESIGN §7): the pins, and the
 * size locks when there are any; the turns, after those when there are both. A turn under a pin of
 * its tray is the pin's, so it asks for no sentence of its own.
 */
export function rulesNoteText(locks: readonly Lock[]): string {
  const pins = locks.some((l) => l.kind !== "turn");
  const held = new Set(locks.flatMap((l) => (l.kind === "position" ? [l.trayKey] : [])));
  const turns = locks.some((l) => l.kind === "turn" && !held.has(l.trayKey));
  const pinSentence = locks.some((l) => l.kind === "size")
    ? "Pinned and size-locked trays stay as you set them when the plan updates."
    : "Pinned trays stay where you put them when the plan updates.";
  if (!turns) {
    return pinSentence;
  }
  return pins ? `${pinSentence} ${TURNED_NOTE}` : TURNED_NOTE;
}

/** Main's note under the list while any rule is set, and the way to lift them all. */
function RulesNote({ locks, onClear }: { locks: readonly Lock[]; onClear: () => void }) {
  return (
    <div class="rail-note">
      <span class="rail-note__text">{rulesNoteText(locks)}</span>
      <Button variant="quiet" class="rail-clear" onClick={onClear}>
        Clear all my choices
      </Button>
    </div>
  );
}

/**
 * The desktop rail, "What's inside" (Main): the box card, the heading with the Add pill, the list,
 * the note about the rules, and the printer line at the foot. The list scrolls inside the rail.
 * The caller puts it in the workspace's `aside`.
 */
export function Rail(p: RailProps) {
  const locks = p.locks ?? [];
  // "Printer bed 256 × 256 mm" does not fit beside Settings in 260 px; the printer icon says the rest.
  const bed = `Bed ${mm(p.printer.bedX)} × ${mm(p.printer.bedY)} mm`;
  const bedFull = `Printer bed ${mm(p.printer.bedX)} × ${mm(p.printer.bedY)} mm`;
  return (
    <div class="rail">
      <Card class="rail-box" data-rail-box="" onClick={p.onOpenBox}>
        <IconTile size={40}>
          <Icon name="box" size={20} />
        </IconTile>
        <span class="rail-box__text">
          <span class="rail-box__top">
            <span class="rail-box__label">The box</span>
            <span class="rail-box__change">Change</span>
          </span>
          {/* one line in the 300 px rail: the unit is smaller and muted, a long size is cut (its title has it all) */}
          <span class="rail-box__size" title={boxSize(p.box)}>
            {boxNumbers(p.box)}
            <span class="rail-box__unit"> mm</span>
          </span>
        </span>
      </Card>
      <div class="rail-head">
        <h2 class="rail-title">What&apos;s inside</h2>
        <AddMenu onPick={p.onAdd} onGroup={p.onAddGroup} />
      </div>
      <ComponentList
        components={p.components}
        trays={p.trays}
        locks={locks}
        groups={p.groups}
        selectedIds={p.selectedIds}
        culprits={p.culprits}
        onOpen={p.onOpenEditor}
        onHover={p.onHover}
        onLight={p.onLight}
        onEditGroup={p.onEditGroup}
        onDrop={p.onDrop}
        onUnpin={p.onUnpin}
        onFreeTurn={p.onFreeTurn}
        onUnlockSize={p.onUnlockSize}
      />
      {locks.length > 0 ? (
        <RulesNote locks={locks} onClear={clearChoices(p.onClearChoices)} />
      ) : null}
      <div class="rail-foot">
        <Icon name="printer" size={18} />
        <span class="rail-foot__text" title={bedFull}>
          {bed}
        </span>
        <Button variant="quiet" class="rail-settings" onClick={p.onSettings}>
          Settings
        </Button>
      </div>
    </div>
  );
}

/**
 * What the phone's sheet holds (MobileWorkspace): The box first, then a compact row per component.
 * A rule's chip, and the note with its way to lift them all, show only while a rule is set.
 */
export function SheetList(p: ListProps) {
  const locks = p.locks ?? [];
  return (
    <>
      <ComponentList
        compact
        components={p.components}
        trays={p.trays}
        locks={locks}
        groups={p.groups}
        culprits={p.culprits}
        onOpen={p.onOpenEditor}
        onHover={p.onHover}
        onLight={p.onLight}
        onEditGroup={p.onEditGroup}
        onUnpin={p.onUnpin}
        onFreeTurn={p.onFreeTurn}
        onUnlockSize={p.onUnlockSize}
        first={
          <li class="rail-item">
            <ListRow
              compact
              name="The box"
              meta={boxSize(p.box)}
              data-rail-box=""
              onClick={p.onOpenBox}
            />
          </li>
        }
      />
      {locks.length > 0 ? (
        <RulesNote locks={locks} onClear={clearChoices(p.onClearChoices)} />
      ) : null}
    </>
  );
}
