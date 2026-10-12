// src/ui/components/ToggleOptions.tsx
import { cornerReliefsOn, curvedFloorOn, fingerCutsOn } from "../../model/defaults";
import type { Component } from "../../model/types";
import { CheckField } from "../fields";
import { useFieldNotices, useSizingNotices } from "../validation";
import type { EditorProps } from "./types";

/** Kinds that may have a curved floor (spec §5): it would bend cards and tilt upright tiles. */
const CURVED_KINDS: readonly Component["kind"][] = ["bulk", "minis", "custom"];

export function ToggleOptions<C extends Component>({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<C>) {
  const floorNotes = useFieldNotices(`/components/${index}/curvedFloor`);
  // The bulk fallback's note: the component is stored in a bin, and what the bin has.
  const binNotes = useSizingNotices(`/components/${index}`).filter(
    (n) => n.code === "sizing.noFingerSlot" && n.level === "info",
  );
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
          onChange={(on) => onChange({ ...c, curvedFloor: on })}
        />
      ) : null}
      {floorNotes.length > 0 ? (
        <p class="field-error" role="alert">
          {floorNotes.map((n) => n.message).join(" ")}
        </p>
      ) : null}
      {advanced ? (
        <CheckField
          id={`${c.id}-cornerReliefs`}
          label="Corner reliefs"
          checked={cornerReliefsOn(c)}
          hint="Round holes in each compartment's corners, so square pieces sit flat."
          onChange={(on) => onChange({ ...c, cornerReliefs: on })}
        />
      ) : null}
      {binNotes.length > 0 ? <p class="hint">{binNotes.map((n) => n.message).join(" ")}</p> : null}
    </>
  );
}
