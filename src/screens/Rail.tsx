// src/screens/Rail.tsx
import type { ComponentKind, Box, Component, Lock, Printer, TraySpec } from "../model/types";
import { Button, Card, Icon, IconTile, ListRow } from "../kit";
import { mm } from "../ui/identity";
import { ComponentList } from "../ui/components/ComponentList";
import { AddMenu } from "./KindPicker";

/** "285 × 285 × 70 mm": the box's inside. */
export function boxSize(box: Box): string {
  return `${mm(box.innerWidth)} × ${mm(box.innerDepth)} × ${mm(box.innerHeight)} mm`;
}

interface ListProps {
  components: readonly Component[];
  /** The plan's trays; absent while the plan is out of date (no layer is named then). */
  trays?: readonly TraySpec[];
  locks?: readonly Lock[];
  box: Box;
  /** The component the selected tray belongs to. */
  selectedId?: string | null;
  /** The components whose tray does not fit: their rows say so. */
  culprits?: ReadonlySet<string>;
  onOpenBox: () => void;
  onOpenEditor: (id: string) => void;
  onHover?: (id: string | null) => void;
  onUnpin?: (trayKeys: string[]) => void;
  onUnlockSize?: (trayKeys: string[]) => void;
  /** Every pin and size lock comes off, in one undo step. */
  onClearChoices: () => void;
}

export interface RailProps extends ListProps {
  /** The insert's printer: the footer says its bed. */
  printer: Printer;
  onAdd: (kind: ComponentKind) => void;
  onSettings: () => void;
}

/** Lifts every rule, and keeps the focus: the note and its button go, so the Add pill takes it. */
function clearChoices(onClear: () => void): () => void {
  return () => {
    onClear();
    document.querySelector<HTMLElement>("[data-rail-add]")?.focus();
  };
}

/** Main's note under the list while any rule is set, and the way to lift them all. */
function RulesNote({ onClear }: { onClear: () => void }) {
  return (
    <div class="rail-note">
      <span class="rail-note__text">These stay as you set them when the plan updates.</span>
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
  return (
    <div class="rail">
      <Card class="rail-box" data-rail-box="" onClick={p.onOpenBox}>
        <IconTile size={40}>
          <Icon name="box" size={20} />
        </IconTile>
        <span class="rail-box__text">
          <span class="rail-box__label">The box</span>
          <span class="rail-box__size">{boxSize(p.box)}</span>
        </span>
        <span class="rail-box__change">Change</span>
      </Card>
      <div class="rail-head">
        <h2 class="rail-title">What&apos;s inside</h2>
        <AddMenu onPick={p.onAdd} />
      </div>
      <ComponentList
        components={p.components}
        trays={p.trays}
        locks={locks}
        selectedId={p.selectedId}
        culprits={p.culprits}
        onOpen={p.onOpenEditor}
        onHover={p.onHover}
        onUnpin={p.onUnpin}
        onUnlockSize={p.onUnlockSize}
      />
      {locks.length > 0 ? <RulesNote onClear={clearChoices(p.onClearChoices)} /> : null}
      <div class="rail-foot">
        <Icon name="printer" size={18} />
        <span class="rail-foot__text">{`Printer bed ${mm(p.printer.bedX)} × ${mm(p.printer.bedY)} mm`}</span>
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
        culprits={p.culprits}
        onOpen={p.onOpenEditor}
        onHover={p.onHover}
        onUnpin={p.onUnpin}
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
      {locks.length > 0 ? <RulesNote onClear={clearChoices(p.onClearChoices)} /> : null}
    </>
  );
}
