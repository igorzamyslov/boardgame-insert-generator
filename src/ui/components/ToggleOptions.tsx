// src/ui/components/ToggleOptions.tsx
import {
  cornerReliefsOn,
  curvedFloorOn,
  dividersOf,
  dividersOffered,
  fingerCutsOn,
  growthOf,
  separatorsOf,
  withDividers,
  withSeparators,
} from "../../model/defaults";
import type { Component } from "../../model/types";
import { CheckField } from "../fields";
import { DIVIDER_GROOVE, DIVIDER_PLAY, DIVIDER_THICKNESS } from "../../sizing/constants";
import { DIVIDERS, SEPARATORS } from "../limits";
import { NumberField } from "../NumberField";
import { useSizingNotices } from "../validation";
import { GrowthOptions } from "./GrowthOptions";
import type { EditorProps } from "./types";

/** Kinds that may have a curved floor (spec §5): it would bend cards and tilt upright tiles. */
const CURVED_KINDS: readonly Component["kind"][] = ["bulk", "minis", "custom"];

/** The bulk fallback's note: the component is stored in a bin, and what the bin has. */
export function BinNotes({ index }: Pick<EditorProps<Component>, "component" | "index">) {
  const binNotes = useSizingNotices(`/components/${index}`).filter(
    (n) => n.code === "sizing.noFingerSlot" && n.level === "info",
  );
  return binNotes.length > 0 ? (
    <p class="hint">{binNotes.map((n) => n.message).join(" ")}</p>
  ) : null;
}

/** The note that a spacer-plate count was cut back to what fits (a print-time sizing notice). */
function SeparatorNotes({ index }: Pick<EditorProps<Component>, "index">) {
  const notes = useSizingNotices(`/components/${index}/separators`);
  return notes.length > 0 ? (
    <p class="hint field-notes">{notes.map((n) => n.message).join(" ")}</p>
  ) : null;
}

/** The finger cuts, curved floor and corner reliefs switches (inside More options). */
export function ToggleOptions<C extends Component>({
  component: c,
  index,
  onChange,
}: EditorProps<C>) {
  return (
    <>
      <CheckField
        id={`${c.id}-fingerCuts`}
        label="Finger cuts"
        checked={fingerCutsOn(c)}
        hint="A cut through a wall of each compartment, to reach in."
        onChange={(on) => onChange({ ...c, fingerCuts: on })}
      />
      {CURVED_KINDS.includes(c.kind) || c.curvedFloor === true ? (
        <CheckField
          id={`${c.id}-curvedFloor`}
          label="Curved floor"
          checked={c.curvedFloor === true || curvedFloorOn(c)}
          hint="A ramp up one wall of each compartment, to scoop pieces out."
          path={`/components/${index}/curvedFloor`}
          onChange={(on) => {
            if (!on && !CURVED_KINDS.includes(c.kind)) {
              // The control only exists on this kind while a file set it, so turning it off
              // removes it: keep the keyboard focus in the form.
              document.getElementById(`${c.id}-fingerCuts`)?.focus();
            }
            onChange({ ...c, curvedFloor: on });
          }}
        />
      ) : null}
      <CheckField
        id={`${c.id}-cornerReliefs`}
        label="Corner reliefs"
        checked={cornerReliefsOn(c)}
        hint="Round holes in each compartment's corners, so flat square pieces sit flat."
        onChange={(on) => onChange({ ...c, cornerReliefs: on })}
      />
      <GrowthOptions component={c} index={index} onChange={onChange} />
      {(c.kind === "cards" || c.kind === "tiles") &&
      growthOf(c, "stack", c.storage === "flat") !== "off" ? (
        <>
          {dividersOf(c) === 0 ? (
            <>
              <NumberField
                id={`${c.id}-separators`}
                label="Spacer plates"
                hint="Print the room the stack grows into as this many thin loose plates (1: one block), so the stack stays snug and one can be pulled out as the collection grows. 0 (the default): nothing is printed, the stack simply stands in a wider well. Plates also let it grow further: they hold the stack upright, so the room is not limited to its own thickness or to what keeps it under its finger cut."
                value={separatorsOf(c)}
                {...SEPARATORS}
                path={`/components/${index}/separators`}
                onCommit={(v) => onChange(withSeparators(c, v))}
              />
              <SeparatorNotes index={index} />
            </>
          ) : (
            <p class="hint">
              Spacer plates are off while the well has dividers: the dividers hold the room instead.
            </p>
          )}
          {dividersOffered(c) ? (
            <NumberField
              id={`${c.id}-dividers`}
              label="Dividers"
              hint={`Loose plates that split the grown well into this many plus one sections (per player, by card type), each standing in a slot in the tray's floor. Evenly spaced. Each section is held upright at both ends, so the room may be that many times larger. Every divider takes about ${DIVIDER_THICKNESS + DIVIDER_PLAY} mm of the well, and the tray is up to ${DIVIDER_GROOVE} mm taller for the slots. Not combined with spacer plates. 0: none.`}
              value={dividersOf(c)}
              {...DIVIDERS}
              path={`/components/${index}/dividers`}
              onCommit={(v) => onChange(withDividers(c, v))}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
