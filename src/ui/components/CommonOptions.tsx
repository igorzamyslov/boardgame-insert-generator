// src/ui/components/CommonOptions.tsx
import { useContext } from "preact/hooks";
import { setClearance, setGroup, setPerPlayer } from "../../app/actions";
import { CheckRow } from "../../kit";
import type { SegmentedOption } from "../../kit";
import { COMPONENT_DEFAULTS, groupOf } from "../../model/defaults";
import type { Access, Component } from "../../model/types";
import { OFFSET, PLAYERS } from "../limits";
import { formatNumber } from "../NumberField";
import { SettingsContext } from "../validation";
import { Choice, ExactRow, NumField, TextBox } from "./controls";
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
 * Validation paths of the fields under More options that every kind has: the groups, the shape
 * chips and the rows. An error at a path, or below it, opens the section.
 */
export function commonOptionPaths(index: number): string[] {
  const at = `/components/${index}`;
  return [
    `${at}/groupId`,
    `${at}/perPlayer`,
    `${at}/perPlayer/players`,
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
 * player, the group that shares a tray, and the component's extra room. A row whose value differs
 * from its default has the changed dot and a way back inside.
 */
export function CommonRows<C extends Component>(props: EditorProps<C>) {
  const { component: c, index, onChange } = props;
  const at = `/components/${index}`;
  const grouped = c.groupId !== undefined;
  return (
    <>
      <ExactRow
        title="Per player"
        errorPaths={[`${at}/perPlayer`]}
        revert={
          c.perPlayer === undefined
            ? undefined
            : { to: "off", onBack: () => onChange(setPerPlayer(c, undefined)) }
        }
      >
        <CheckRow
          label="Counts are per player"
          hint={grouped ? "Not available for grouped items." : undefined}
          checked={c.perPlayer !== undefined}
          blocked={grouped}
          onChange={(on) => onChange(setPerPlayer(c, on ? 4 : undefined))}
        />
        {c.perPlayer !== undefined ? (
          <NumField
            id={`${c.id}-players`}
            label="Players"
            value={c.perPlayer.players}
            {...PLAYERS}
            path={`${at}/perPlayer/players`}
            onCommit={(v) => onChange(setPerPlayer(c, v))}
          />
        ) : null}
      </ExactRow>
      <ExactRow
        title="Group"
        meta={c.groupId}
        errorPaths={[`${at}/groupId`]}
        revert={
          groupOf(c) === undefined
            ? undefined
            : { to: "no group", onBack: () => onChange(setGroup(c, undefined)) }
        }
      >
        <TextBox
          id={`${c.id}-group`}
          label="Group"
          value={c.groupId ?? ""}
          commitOn="blur"
          normalize={(v) => v.trim()}
          path={`${at}/groupId`}
          placeholder="e.g. tokens"
          onCommit={(v) => onChange(setGroup(c, v))}
        />
      </ExactRow>
      <ExtraRoomRow {...props} />
    </>
  );
}
