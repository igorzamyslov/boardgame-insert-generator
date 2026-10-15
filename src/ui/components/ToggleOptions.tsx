// src/ui/components/ToggleOptions.tsx
import {
  cornerReliefsOn,
  curvedFloorOn,
  fingerCutsOn,
  growthOf,
  separatorsOf,
  withSeparators,
} from "../../model/defaults";
import type { Component } from "../../model/types";
import { CheckField } from "../fields";
import { SEPARATORS } from "../limits";
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

/** The finger cuts, curved floor and corner reliefs switches (inside the advanced options). */
export function ToggleOptions<C extends Component>({
  component: c,
  index,
  advanced,
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
      {advanced ? (
        <CheckField
          id={`${c.id}-cornerReliefs`}
          label="Corner reliefs"
          checked={cornerReliefsOn(c)}
          hint="Round holes in each compartment's corners, so flat square pieces sit flat."
          onChange={(on) => onChange({ ...c, cornerReliefs: on })}
        />
      ) : null}
      <GrowthOptions component={c} index={index} onChange={onChange} />
      {(c.kind === "cards" || c.kind === "tiles") &&
      growthOf(c, "stack", c.storage === "flat") !== "off" ? (
        <>
          <NumberField
            id={`${c.id}-separators`}
            label="Spacer plates"
            hint="The room the stack grows into is printed as this many thin loose plates instead of one block. Pull one out as the collection grows and the stack still fits snug. Plates also let it grow further: they hold the stack upright, so the room is not limited to its own thickness."
            value={separatorsOf(c)}
            {...SEPARATORS}
            path={`/components/${index}/separators`}
            onCommit={(v) => onChange(withSeparators(c, v))}
          />
          <SeparatorNotes index={index} />
        </>
      ) : null}
    </>
  );
}
