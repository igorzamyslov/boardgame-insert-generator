// src/ui/components/ToggleOptions.tsx
import { useId } from "preact/hooks";
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
import { ChoiceChips } from "../../kit";
import type { Component } from "../../model/types";
import { DIVIDERS, SEPARATORS } from "../limits";
import { useSizingNotices } from "../validation";
import { Alert, ExactRow, Group, Notes, NumField } from "./controls";
import type { EditorProps } from "./types";

/** Kinds that may have a curved floor (spec §5): it would bend cards and tilt upright tiles. */
const CURVED_KINDS: readonly Component["kind"][] = ["bulk", "minis", "custom"];

type Shape = "fingerCuts" | "curvedFloor" | "cornerReliefs" | "dividers";

/** The bulk fallback's note: the component is stored in a bin, and what the bin has. */
export function BinNotes({ index }: Pick<EditorProps<Component>, "component" | "index">) {
  const binNotes = useSizingNotices(`/components/${index}`).filter(
    (n) => n.code === "sizing.noFingerSlot" && n.level === "info",
  );
  return binNotes.length > 0 ? (
    <p class="ed-note">{binNotes.map((n) => n.message).join(" ")}</p>
  ) : null;
}

/** The note that a spacer-plate count was cut back to what fits (a print-time sizing notice). */
function SeparatorNotes({ index }: Pick<EditorProps<Component>, "index">) {
  const notes = useSizingNotices(`/components/${index}/separators`);
  return notes.length > 0 ? <p class="ed-note">{notes.map((n) => n.message).join(" ")}</p> : null;
}

/**
 * Edit's "Tray shape": pressed chips for the finger cuts, the curved floor (where the kind may
 * have one, or a file set it), the corner holes and one removable divider (where the well may have
 * dividers). A curved-floor error shows under the chips.
 */
export function TrayShape<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  const errorId = useId();
  const floor = CURVED_KINDS.includes(c.kind) || c.curvedFloor === true;
  const on: Shape[] = [];
  if (fingerCutsOn(c)) {
    on.push("fingerCuts");
  }
  if (floor && (c.curvedFloor === true || curvedFloorOn(c))) {
    on.push("curvedFloor");
  }
  if (cornerReliefsOn(c)) {
    on.push("cornerReliefs");
  }
  if (dividersOf(c) > 0) {
    on.push("dividers");
  }
  const chips: { value: Shape; label: string }[] = [{ value: "fingerCuts", label: "Finger cuts" }];
  if (floor) {
    chips.push({ value: "curvedFloor", label: "Curved floor" });
  }
  chips.push({ value: "cornerReliefs", label: "Corner holes" });
  if (dividersOffered(c)) {
    chips.push({ value: "dividers", label: "Removable dividers" });
  }
  const toggle = (which: Shape): void => {
    switch (which) {
      case "fingerCuts":
        onChange({ ...c, fingerCuts: !fingerCutsOn(c) });
        return;
      case "cornerReliefs":
        onChange({ ...c, cornerReliefs: !cornerReliefsOn(c) });
        return;
      case "dividers":
        onChange(withDividers(c, dividersOf(c) > 0 ? 0 : 1));
        return;
      case "curvedFloor": {
        const now = c.curvedFloor === true || curvedFloorOn(c);
        if (now && !CURVED_KINDS.includes(c.kind)) {
          // The chip only exists on this kind while a file set it, so turning it off removes it:
          // keep the keyboard focus in the group.
          document.getElementById(`${c.id}-shape`)?.querySelector<HTMLElement>("button")?.focus();
        }
        onChange({ ...c, curvedFloor: !now });
      }
    }
  };
  return (
    <Group label="Tray shape">
      <div id={`${c.id}-shape`}>
        <ChoiceChips
          label="Tray shape"
          options={chips}
          value={on}
          describedBy={errorId}
          onChange={toggle}
        />
      </div>
      <Alert id={errorId} path={`/components/${index}/curvedFloor`} />
      <Notes path={`/components/${index}/curvedFloor`} />
    </Group>
  );
}

/**
 * The exact numbers that go with the shape of a stack's well: the spacer plates the room it grows
 * into is printed as, and the removable dividers. Only cards and tiles that may grow along the
 * stack have them (spec §5); the dividers take the plates' place when there are any.
 */
export function WellRows<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  if (
    !(c.kind === "cards" || c.kind === "tiles") ||
    growthOf(c, "stack", c.storage === "flat") === "off"
  ) {
    return null;
  }
  const dividers = dividersOf(c);
  return (
    <>
      {dividers === 0 ? (
        <ExactRow title="Spacer plates" errorPaths={[`/components/${index}/separators`]}>
          <NumField
            id={`${c.id}-separators`}
            label="Spacer plates"
            value={separatorsOf(c)}
            {...SEPARATORS}
            path={`/components/${index}/separators`}
            onCommit={(v) => onChange(withSeparators(c, v))}
          />
          <SeparatorNotes index={index} />
        </ExactRow>
      ) : null}
      {dividersOffered(c) ? (
        <ExactRow title="Dividers" errorPaths={[`/components/${index}/dividers`]}>
          <NumField
            id={`${c.id}-dividers`}
            label="Number of dividers"
            value={dividers}
            {...DIVIDERS}
            path={`/components/${index}/dividers`}
            onCommit={(v) => onChange(withDividers(c, v))}
          />
        </ExactRow>
      ) : null}
    </>
  );
}
