// src/screens/FirstVisit.tsx
import type { ComponentChildren } from "preact";
import type { Box, ComponentKind } from "../model/types";
import { Button, Field, Icon, StepBadge } from "../kit";
import { messagesOf } from "../ui/FieldMessages";
import { mm } from "../ui/identity";
import { LENGTH } from "../ui/limits";
import { useNumberText } from "../ui/NumberField";
import { useFieldNotices } from "../ui/validation";
import { Logo } from "./Header";
import { KindTiles } from "./KindPicker";
import { Workspace } from "./Workspace";

export interface FirstVisitProps {
  box: Box;
  /** Below 760 px: MobileStart's one column, with no empty box beside it. */
  phone: boolean;
  onBoxChange: (patch: Partial<Box>) => void;
  onPick: (kind: ComponentKind) => void;
  onExample: () => void;
  /** Open file: the owner keeps the file chooser (the menu is not here). */
  onOpenFile: () => void;
  /** Beside the header's button (the hidden file chooser the owner keeps). */
  headerExtra?: ComponentChildren;
  /** In the stage above the screen's own content (the app's notices and live regions). */
  stageBefore?: ComponentChildren;
  /** In the stage below it (the removal's note). */
  stageAfter?: ComponentChildren;
}

/** Logo, wordmark, and the one thing a first visit can do from here: open a file. */
function FirstVisitHeader({ phone, onOpenFile }: { phone: boolean; onOpenFile: () => void }) {
  return (
    <div class={`hd fv-header${phone ? " hd--phone" : ""}`}>
      <Logo />
      <span class="hd-wordmark">Insert Generator</span>
      <span class="hd-grow" />
      <Button variant="secondary" class="fv-open" onClick={onOpenFile}>
        Open file
      </Button>
    </div>
  );
}

/**
 * One measure of the box: the typed text, what it commits, and the words of what is wrong with it
 * (a typed value the rules refuse, or the engine's message at its path).
 */
function useMeasure(value: number, path: string, onCommit: (v: number) => void) {
  const typed = useNumberText(value, onCommit, LENGTH);
  const engine = messagesOf(useFieldNotices(path)).errors.join(" ");
  return { ...typed, message: typed.error ?? engine };
}

/** Empty's card: the message, with no button. The engine has no value to suggest. */
function ErrorCard({ id, message }: { id: string; message: string }) {
  return (
    <div class="fv-error" id={id} role="alert">
      <Icon name="alert" size={18} />
      <span>{message}</span>
    </div>
  );
}

/** Step 1: the three measures, a card for each that is wrong, and where to measure. */
function Measure({
  box,
  phone,
  onChange,
}: {
  box: Box;
  phone: boolean;
  onChange: (patch: Partial<Box>) => void;
}) {
  const fields = [
    {
      key: "innerWidth",
      label: "Width",
      m: useMeasure(box.innerWidth, "/box/innerWidth", (v) => onChange({ innerWidth: v })),
    },
    {
      key: "innerDepth",
      label: "Length",
      m: useMeasure(box.innerDepth, "/box/innerDepth", (v) => onChange({ innerDepth: v })),
    },
    {
      key: "innerHeight",
      label: "Height",
      m: useMeasure(box.innerHeight, "/box/innerHeight", (v) => onChange({ innerHeight: v })),
    },
  ];
  const cardId = (key: string): string => `box-${key}-card`;
  return (
    <>
      <div class="fv-fields">
        {fields.map(({ key, label, m }) => (
          <Field
            key={key}
            id={`box-${key}`}
            label={label}
            unit="mm"
            value={m.text}
            invalidBy={m.message === "" ? undefined : cardId(key)}
            onInput={m.onInput}
            onBlur={m.onBlur}
            onKeyDown={m.onKeyDown}
          />
        ))}
      </div>
      {fields.map(({ key, m }) =>
        m.message === "" ? null : <ErrorCard key={key} id={cardId(key)} message={m.message} />,
      )}
      <p class="fv-hint">
        {phone
          ? "Inside the box, at the narrowest point. Width is left to right, seen from the front."
          : "Inside the box, at the narrowest point."}
      </p>
    </>
  );
}

/** A step's badge and its heading. */
function StepHead({ n, id, children }: { n: number; id: string; children: string }) {
  return (
    <div class="fv-step__head">
      <StepBadge n={n} active={n === 1} />
      <h2 class="fv-step__title" id={id}>
        {children}
      </h2>
    </div>
  );
}

/** The empty box with its two size chips and the way round it is drawn (Empty). */
function EmptyBox({ box }: { box: Box }) {
  return (
    <div class="fv-view">
      <span class="fv-chip fv-chip--width">{`Width ${mm(box.innerWidth)} mm`}</span>
      <span class="fv-chip fv-chip--length">{`Length ${mm(box.innerDepth)} mm`}</span>
      <div class="fv-box" data-region="plan-box">
        <div class="fv-box__inner">Empty box</div>
      </div>
      <span class="fv-front">
        Front of the box
        <Icon name="arrow-down" size={12} />
      </span>
    </div>
  );
}

/**
 * The first visit: Empty at 1440, MobileStart below 760 px. The shell's header, rail and stage
 * (`Workspace`, focused), with their own content: Open file alone in the header; in the rail the two
 * steps (measure the box, add what goes inside) and the way to start from an example; in the stage
 * the h1 and the empty box. The h1 is the page's (the wordmark is a span). Replaced by the
 * workspace as soon as the first item is added.
 */
export function FirstVisit(p: FirstVisitProps) {
  return (
    <Workspace
      class="fv"
      focus
      header={
        <>
          <FirstVisitHeader phone={p.phone} onOpenFile={p.onOpenFile} />
          {p.headerExtra}
        </>
      }
      rail={
        <div class="fv-rail">
          <div class="fv-step" role="group" aria-labelledby="fv-measure">
            <StepHead n={1} id="fv-measure">
              Measure the box
            </StepHead>
            <Measure box={p.box} phone={p.phone} onChange={p.onBoxChange} />
          </div>
          <div class="fv-step" role="group" aria-labelledby="fv-add">
            <StepHead n={2} id="fv-add">
              Add what goes inside
            </StepHead>
            <div class="fv-kinds">
              <KindTiles onPick={p.onPick} />
            </div>
          </div>
          <div class="fv-foot">
            <Button variant="quiet" class="fv-example" onClick={p.onExample}>
              Start from an example game
            </Button>
            <span class="fv-saved">Your inserts are saved in this browser.</span>
          </div>
        </div>
      }
      stage={
        <>
          {p.stageBefore}
          <div class="fv-stage">
            <div class="fv-intro">
              <h1 class="fv-title">Let&apos;s build an insert for your game</h1>
              {p.phone ? null : <p class="fv-lede">Trays appear in the box as you add items.</p>}
            </div>
            {p.phone ? null : <EmptyBox box={p.box} />}
          </div>
          {p.stageAfter}
        </>
      }
    />
  );
}
