// src/ui/components/CommonOptions.tsx
import { useContext } from "preact/hooks";
import { setClearance, setItemCopies } from "../../app/actions";
import { CheckRow } from "../../kit";
import type { SegmentedOption } from "../../kit";
import { COMPONENT_DEFAULTS } from "../../model/defaults";
import type { Access, Component } from "../../model/types";
import { COPIES, OFFSET } from "../limits";
import { formatNumber } from "../NumberField";
import { SettingsContext } from "../validation";
import { Choice, ExactRow, NumField } from "./controls";
import { insertClearance } from "./moreSummary";
import type { EditorProps } from "./types";

const ACCESS_OPTIONS: SegmentedOption<Access>[] = [
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
 * The extra room around what the component holds (mm). The insert gives every item one number
 * (Settings: the card or piece clearance, times Fit); this row shows it, and typing another number
 * gives this item its own, which replaces it as it is. Typing the insert's own number sets nothing.
 */
function ExtraRoomRow<C extends Component>({ component: c, index, onChange }: EditorProps<C>) {
  const at = `/components/${index}`;
  const inherited = insertClearance(c, useContext(SettingsContext));
  const own = c.clearance !== undefined && c.clearance !== inherited;
  const value = c.clearance ?? inherited;
  return (
    <ExactRow
      title="Extra room"
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
        label="Extra room"
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
 * The exact values every kind has, each a row that opens in place: whether the counts are per
 * player, and the component's extra room. A row whose value differs from its default has the
 * changed dot and a way back inside.
 */
export function CommonRows<C extends Component>(props: EditorProps<C>) {
  const { component: c, index, onChange } = props;
  const at = `/components/${index}`;
  return (
    <>
      <ExactRow
        title="Per player"
        errorPaths={[`${at}/copies`]}
        revert={
          c.copies === undefined
            ? undefined
            : { to: "off", onBack: () => onChange(setItemCopies(c, undefined)) }
        }
      >
        <CheckRow
          label="Counts are per player"
          checked={c.copies !== undefined}
          onChange={(on) => onChange(setItemCopies(c, on ? 4 : undefined))}
        />
        {c.copies !== undefined ? (
          <NumField
            id={`${c.id}-players`}
            label="Players"
            value={c.copies}
            {...COPIES}
            path={`${at}/copies`}
            onCommit={(v) => onChange(setItemCopies(c, v))}
          />
        ) : null}
      </ExactRow>
      <ExtraRoomRow {...props} />
    </>
  );
}
