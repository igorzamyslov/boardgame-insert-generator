// src/ui/BoxPanel.tsx
// The box's editor (Box in the rail, MobileBox as a full-screen sheet): the inside size, the space
// kept free on top and how much of the top it covers, and whether the box is stored on its side.
// Every field is always in view (nothing folds away), so an error in any of them is in sight.
// The words are the boards', except the stored-on-its-side hint (ruled in DESIGN §7: the board's
// is not what the engine does).
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Button, CheckRow, Icon, IconButton, Segmented } from "../kit";
import type { Box } from "../model/types";
import { NumField } from "./components/controls";
import { LENGTH, OFFSET } from "./limits";
import "./components/editor.css";
import "./boxPanel.css";

export interface BoxPanelProps {
  box: Box;
  onChange: (patch: Partial<Box>) => void;
  /** The back link and Done: leave the editor for the list. */
  onBack: () => void;
  /** Below 760 px: MobileBox's sheet, with its own header and the side view under the fields. */
  phone?: boolean;
  /** The phone's side view of the box (its drawing and caption), under the fields. */
  sideView?: ComponentChildren;
  /** The phone's first line in the scroll: a failed run, a tray that does not fit, pins in the way. */
  notice?: ComponentChildren;
}

const COVERAGE: { value: Box["headroomCoverage"]; label: string }[] = [
  { value: "full", label: "Whole top" },
  { value: "partial", label: "Part of it" },
];

/** Why the choice does nothing at 0 mm: the buttons point at it. */
const NOTHING_KEPT = "Nothing is kept free on top yet.";

/** The three measures, side by side. */
function Sizes({ box, onChange, phone }: Pick<BoxPanelProps, "box" | "onChange" | "phone">) {
  // The rail's fields are 80 px: "285.5" needs the room, so the unit is said once above them (and
  // stays in each name); the phone's are 114 px and keep it.
  const hideUnit = phone !== true;
  return (
    <div class="bx-group">
      <span class="bx-group__head">
        <span class="ed-label">Inside size</span>
        {hideUnit ? <span class="ed-line">In mm</span> : null}
      </span>
      <div class="bx-sizes">
        <NumField
          id="box-innerWidth"
          label="Width"
          unit="mm"
          hideUnit={hideUnit}
          compact={false}
          value={box.innerWidth}
          path="/box/innerWidth"
          {...LENGTH}
          onCommit={(v) => onChange({ innerWidth: v })}
        />
        <NumField
          id="box-innerDepth"
          label="Length"
          unit="mm"
          hideUnit={hideUnit}
          compact={false}
          value={box.innerDepth}
          path="/box/innerDepth"
          {...LENGTH}
          onCommit={(v) => onChange({ innerDepth: v })}
        />
        <NumField
          id="box-innerHeight"
          label="Height"
          unit="mm"
          hideUnit={hideUnit}
          compact={false}
          value={box.innerHeight}
          path="/box/innerHeight"
          {...LENGTH}
          onCommit={(v) => onChange({ innerHeight: v })}
        />
      </div>
    </div>
  );
}

/** "Keep space free on top": the height, and whether it is the whole top or only where something lies. */
function KeepFree({ box, onChange, phone }: Pick<BoxPanelProps, "box" | "onChange" | "phone">) {
  const nothing = box.headroom === 0;
  return (
    <div class="bx-top" role="group" aria-labelledby="box-top-title">
      <span class="bx-top__head">
        <span class="ed-label" id="box-top-title">
          Keep space free on top
        </span>
        {phone === true ? null : (
          <span class="ed-line">For the rulebook, boards or player mats</span>
        )}
      </span>
      <div class={phone === true ? "bx-top__row" : "bx-top__row bx-top__row--stacked"}>
        <NumField
          id="box-headroom"
          label="Space on top"
          unit="mm"
          hideLabel
          compact={false}
          class="bx-headroom"
          value={box.headroom}
          path="/box/headroom"
          {...OFFSET}
          onCommit={(v) => onChange({ headroom: v })}
        />
        <Segmented
          label="How much of the top"
          options={COVERAGE.map((o) => ({
            ...o,
            // Nothing lies on top at 0 mm: the choice stays in sight, says why, and does nothing.
            blockedReason: nothing ? NOTHING_KEPT : undefined,
          }))}
          value={box.headroomCoverage}
          onChange={(v) => onChange({ headroomCoverage: v })}
          stretch
        />
      </div>
      <p class="ed-line bx-top__line">
        Part of it: only where the rulebook lies. Trays fill the rest.
      </p>
    </div>
  );
}

/**
 * The box's editor in the place of the list: a back link, "The box" (the panel's heading, which
 * takes the focus when it opens; the page's h1 is the stage's side view), the fields, and Done. On a
 * phone it is the sheet MobileBox draws: Back, the h1, Done, the fields, and the side view under
 * them. A change is one edit of the project (one undo step, edits a second apart coalesce).
 */
export function BoxPanel({
  box,
  onChange,
  onBack,
  phone = false,
  sideView,
  notice,
}: BoxPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The panel replaced the list: the reader starts at its top, and a screen reader hears whose it is.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const stored = (
    <div class="bx-stored">
      <CheckRow
        label="The box is stored on its side"
        hint="Loose pieces go under other trays where they can, so nothing spills."
        checked={box.storedOnSide}
        onChange={(v) => onChange({ storedOnSide: v })}
      />
    </div>
  );
  if (phone) {
    return (
      <section class="ed ed--phone bx bx--phone" aria-label="The box">
        <header class="ed-bar">
          <IconButton
            label="Back"
            variant="plain"
            icon={<Icon name="chevron-left" size={20} />}
            onClick={onBack}
          />
          <h1 class="ed-bar__title" tabIndex={-1} ref={headingRef}>
            The box
          </h1>
          <Button variant="primary" class="ed-done" onClick={onBack}>
            Done
          </Button>
        </header>
        <div class="ed-scroll">
          {notice}
          <Sizes box={box} onChange={onChange} phone />
          <KeepFree box={box} onChange={onChange} phone />
          {stored}
          <div class="bx-side-block">
            <span class="bx-side-block__label">Side view of the box</span>
            {sideView}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section class="ed bx" aria-labelledby="box-editor-title">
      <div class="ed-head">
        <button type="button" class="ed-back" onClick={onBack}>
          <Icon name="chevron-left" size={16} />
          What&apos;s inside
        </button>
        <h2 class="bx-title" id="box-editor-title" tabIndex={-1} ref={headingRef}>
          The box
        </h2>
      </div>
      <Sizes box={box} onChange={onChange} />
      <KeepFree box={box} onChange={onChange} />
      {stored}
      <div class="bx-foot">
        <Button variant="primary" class="ed-done" onClick={onBack}>
          Done
        </Button>
      </div>
    </section>
  );
}
