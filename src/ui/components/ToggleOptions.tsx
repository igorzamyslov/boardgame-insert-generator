// src/ui/components/ToggleOptions.tsx
import { useId, useRef } from "preact/hooks";
import {
  cornerReliefsOn,
  curvedFloorKind,
  curvedFloorOffered,
  defaultTogglesOf,
  dividersOf,
  dividersOffered,
  fingerCutsOn,
  separatorsOf,
  withDividers,
  withSeparators,
} from "../../model/defaults";
import { ChoiceChips } from "../../kit";
import type { Component } from "../../model/types";
import { DIVIDERS, SEPARATORS } from "../limits";
import { useSizingNotices } from "../validation";
import { Alert, BackLink, ExactRow, Group, Notes, NumField } from "./controls";
import { curvedFloorShown, wellMayGrow } from "./moreSummary";
import type { EditorProps } from "./types";

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

/** A chip that is a way back: "Back to finger cuts on". */
function stateOf(label: string, on: boolean): string {
  return `${label.toLowerCase()} ${on ? "on" : "off"}`;
}

/** Drops a key the component set, so it is what its kind has again (the stored file stays as it was). */
function without<C extends Component>(
  c: C,
  key: "fingerCuts" | "curvedFloor" | "cornerReliefs",
): C {
  return Object.fromEntries(Object.entries(c).filter(([k]) => k !== key)) as C;
}

/**
 * Edit's "Tray shape": pressed chips for the finger cuts, the curved floor (where the kind may
 * have one, or a file set one), the corner holes and one removable divider (where the well may have
 * dividers). A chip whose state differs from the kind's default has the changed dot and, under the
 * chips, a way back ("Back to finger cuts on"); the divider chip's way back is its row's (Dividers),
 * so a divider count is one change, not two. A curved-floor error shows under the chips.
 */
export function TrayShape<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  const errorId = useId();
  const group = useRef<HTMLDivElement>(null);
  const floor = curvedFloorOffered(c);
  const defaults = defaultTogglesOf(c);
  const on: Shape[] = [];
  if (fingerCutsOn(c)) {
    on.push("fingerCuts");
  }
  if (floor && curvedFloorShown(c)) {
    on.push("curvedFloor");
  }
  if (cornerReliefsOn(c)) {
    on.push("cornerReliefs");
  }
  if (dividersOf(c) > 0) {
    on.push("dividers");
  }
  const chips: { value: Shape; label: string; changed: boolean }[] = [
    { value: "fingerCuts", label: "Finger cuts", changed: fingerCutsOn(c) !== defaults.fingerCuts },
  ];
  if (floor) {
    chips.push({
      value: "curvedFloor",
      label: "Curved floor",
      changed: curvedFloorShown(c) !== defaults.curvedFloor,
    });
  }
  chips.push({
    value: "cornerReliefs",
    label: "Corner holes",
    changed: cornerReliefsOn(c) !== defaults.cornerReliefs,
  });
  if (dividersOffered(c)) {
    chips.push({ value: "dividers", label: "Removable dividers", changed: false });
  }
  // the toggles that differ from the kind's: the dividers are counted by their row, not here
  const changed = chips.flatMap((chip) =>
    chip.changed && chip.value !== "dividers" ? [{ ...chip, value: chip.value }] : [],
  );
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
        const now = curvedFloorShown(c);
        if (now && !curvedFloorKind(c)) {
          // The chip only exists on this kind while a file set it, so turning it off removes it:
          // keep the keyboard focus in the group.
          document.getElementById(`${c.id}-shape`)?.querySelector<HTMLElement>("button")?.focus();
        }
        onChange({ ...c, curvedFloor: !now });
      }
    }
  };
  return (
    <Group label="Tray shape" groupRef={group}>
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
      {changed.length > 0 ? (
        <div class="ed-backs">
          {changed.map((chip) => (
            <BackLink
              key={chip.value}
              revert={{
                to: stateOf(chip.label, defaults[chip.value]),
                onBack: () => onChange(without(c, chip.value)),
              }}
              name="Tray shape"
              focus={() => group.current?.querySelector<HTMLElement>("button")}
            />
          ))}
        </div>
      ) : null}
    </Group>
  );
}

/**
 * The exact numbers that go with the shape of a stack's well: the spacer plates the room it grows
 * into is printed as, and the removable dividers. Only cards and tiles that may grow along the
 * stack have them (spec §5); the dividers take the plates' place when there are any.
 */
export function WellRows<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  if (!wellMayGrow(c)) {
    return null;
  }
  const dividers = dividersOf(c);
  return (
    <>
      {dividers === 0 ? (
        <ExactRow
          title="Spacer plates"
          errorPaths={[`/components/${index}/separators`]}
          revert={
            separatorsOf(c) === 0
              ? undefined
              : { to: "0", onBack: () => onChange(withSeparators(c, 0)) }
          }
        >
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
        <ExactRow
          title="Dividers"
          errorPaths={[`/components/${index}/dividers`]}
          revert={
            dividers === 0 ? undefined : { to: "0", onBack: () => onChange(withDividers(c, 0)) }
          }
        >
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
