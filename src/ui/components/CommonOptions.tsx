// src/ui/components/CommonOptions.tsx
import { useContext, useId } from "preact/hooks";
import { setClearance, setItemCopies } from "../../app/actions";
import { Stepper } from "../../kit";
import type { SegmentedOption } from "../../kit";
import { COMPONENT_DEFAULTS } from "../../model/defaults";
import type { Access, Component } from "../../model/types";
import { COPIES, OFFSET } from "../limits";
import { formatNumber } from "../NumberField";
import { SettingsContext } from "../validation";
import { Alert, Choice, ExactRow, Group as Field, NumField } from "./controls";
import { GroupRow, ItemGroupingContext, SetOnGroup, useItemGroup } from "./GroupRow";
import { insertClearance } from "./moreSummary";
import type { EditorProps } from "./types";

export const ACCESS_OPTIONS: SegmentedOption<Access>[] = [
  { value: "often", label: "Often" },
  { value: "sometimes", label: "Sometimes" },
  { value: "setup", label: "Only at setup" },
];

/** The default's name in "Back to <it>": the label of the option that is the default. */
const ACCESS_DEFAULT = ACCESS_OPTIONS.find((o) => o.value === COMPONENT_DEFAULTS.access)?.label;

/**
 * Validation paths of the fields under More options that every kind has: the copies, the shape
 * chips and the rows. An error at a path, or below it, opens the section.
 */
export function commonOptionPaths(index: number): string[] {
  const at = `/components/${index}`;
  return [
    `${at}/copies`,
    `${at}/clearance`,
    `${at}/curvedFloor`,
    `${at}/separators`,
    `${at}/dividers`,
    `${at}/growth`,
  ];
}

/** Edit's "How often you reach for it": Often, Sometimes, Only at setup. */
export function AccessChoice<C extends Component>({ component: c, onChange }: EditorProps<C>) {
  // an item in a group is reached for as its group is: the choice is the group's, and not drawn
  if (useItemGroup() !== undefined) {
    return null;
  }
  return (
    <Choice
      label="How often you reach for it"
      options={ACCESS_OPTIONS}
      value={c.access}
      onChange={(access) => onChange({ ...c, access })}
      revert={
        c.access === COMPONENT_DEFAULTS.access
          ? undefined
          : {
              to: ACCESS_DEFAULT ?? COMPONENT_DEFAULTS.access,
              onBack: () => onChange({ ...c, access: COMPONENT_DEFAULTS.access }),
            }
      }
    />
  );
}

/**
 * The room around what the component holds (mm). The insert gives every item one number
 * (Settings: the card or piece clearance, times Fit); this row shows it, and typing another number
 * gives this item its own, which replaces it as it is. Typing the insert's own number sets nothing.
 */
function ClearanceRow<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  const at = `/components/${index}`;
  const inherited = insertClearance(c, useContext(SettingsContext));
  const own = c.clearance !== undefined && c.clearance !== inherited;
  const value = c.clearance ?? inherited;
  return (
    <ExactRow
      title="Room around the pieces"
      meta={`${formatNumber(value)} mm`}
      errorPaths={[`${at}/clearance`]}
      revert={
        own
          ? { to: formatNumber(inherited), onBack: () => onChange(setClearance(c, undefined)) }
          : undefined
      }
    >
      <NumField
        id={`${c.id}-clearance`}
        label="Room around the pieces"
        unit="mm"
        value={value}
        {...OFFSET}
        path={`${at}/clearance`}
        onCommit={(v) => onChange(setClearance(c, v === inherited ? undefined : v))}
      />
      <span class="ed-line">
        {own
          ? `This item's own, whatever Fit says. The insert's is ${formatNumber(inherited)} mm.`
          : "The insert's setting. Type another number to give this item its own."}
      </span>
    </ExactRow>
  );
}

/**
 * The item's own Copies (spec §7.5): a stepper from 1 to 10, each copy its own tray. The row's way
 * back is 1, the item's single tray; a copy count that the engine refuses shows its words in place.
 */
function CopiesRow<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  const at = `/components/${index}`;
  const grouping = useContext(ItemGroupingContext);
  const alertId = useId();
  // inside the app a count is one undo step of the project (it lets go of the pins of copies that
  // go); an editor drawn alone changes the item
  const set = (n: number): void =>
    grouping === undefined
      ? onChange(setItemCopies(c, n > 1 ? n : undefined))
      : grouping.onCopies(n);
  return (
    <ExactRow
      title="Copies"
      errorPaths={[`${at}/copies`]}
      revert={c.copies === undefined ? undefined : { to: "1", onBack: () => set(1) }}
    >
      <Field label="Copies">
        <Stepper
          label="Copies"
          value={c.copies ?? 1}
          min={COPIES.min}
          max={COPIES.max}
          onChange={set}
        />
        <Alert id={alertId} path={`${at}/copies`} />
        <span class="ed-line">Each copy is its own tray.</span>
      </Field>
    </ExactRow>
  );
}

/**
 * The exact values every kind has, each a row that opens in place: Copies, the group the item is
 * in, and the room around its pieces. A row whose value differs from its default has the changed
 * dot and a way back inside. An item in a group has its group's Copies and access: one line stands
 * where Copies did, so nothing below it moves.
 */
export function CommonRows<C extends Component>(props: EditorProps<C>) {
  return (
    <>
      {useItemGroup() === undefined ? <CopiesRow {...props} /> : <SetOnGroup />}
      <GroupRow />
      <ClearanceRow {...props} />
    </>
  );
}
