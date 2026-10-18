// src/ui/components/GrowthOptions.tsx
import { defaultGrowth, growthAxesOf, growthOf, withGrowth } from "../../model/defaults";
import type { SegmentedOption } from "../../kit";
import type { Component, GrowthAxis, GrowthMode } from "../../model/types";
import { OFFSET } from "../limits";
import { Choice, NumField } from "./controls";
import type { EditorProps } from "./types";

type Mode = "off" | "auto" | "amount" | "max";

/** The amount a "set amount" starts at when picked, mm. */
const STARTING_AMOUNT = 10;

const MODES: SegmentedOption<Mode>[] = [
  { value: "off", label: "None" },
  { value: "auto", label: "Auto" },
  { value: "amount", label: "A set amount" },
  { value: "max", label: "Max" },
];

/** The name of a growth control, in terms of what the component stores. */
export function growthLabel(c: Component, axis: GrowthAxis): string {
  if (axis === "stack") {
    return "Room for expansions";
  }
  if (c.kind === "minis" && c.storage === "pockets") {
    return `Looser pockets: ${axis === "w" ? "width" : "length"}`;
  }
  return { w: "Extra width", d: "Extra length", h: "Extra height" }[axis];
}

/**
 * What "Max" means on `axis`, in one line. The item puts no limit of its own on the axis, so the
 * tray takes what the layout leaves it (`fill.ts`): on the footprint the room beside the other
 * trays, up to the printer's bed; in height (a deck lying flat grows taller) the box's.
 */
export function growthMaxLine(c: Component, axis: GrowthAxis): string {
  const lying = (c.kind === "cards" || c.kind === "tiles") && c.storage === "flat";
  return axis === "h" || (axis === "stack" && lying)
    ? "As tall as the box allows."
    : "As much as fits beside the other trays and on your printer's bed.";
}

function modeOf(mode: GrowthMode): Mode {
  return typeof mode === "number" ? "amount" : mode;
}

/**
 * The growth settings of a component (minimal-trays spec §5), in the user's terms: one choice per
 * axis where more room means more pieces, or a looser fit. An axis where growing cannot help (a
 * card well's width and length, a tile's footprint, a minis pocket's depth) is not offered at all:
 * choosing it would teach the wrong model.
 */
export function GrowthOptions<C extends Component>({
  component: c,
  index,
  onChange,
}: Pick<EditorProps<C>, "component" | "index" | "onChange">) {
  const lying = (c.kind === "cards" || c.kind === "tiles") && c.storage === "flat";
  return (
    <>
      {growthAxesOf(c).map((axis) => {
        const mode = growthOf(c, axis, lying);
        const standard = defaultGrowth(c, axis, lying);
        const label = growthLabel(c, axis);
        // Picking what the kind does anyway sets nothing, so the file stays as it was.
        const set = (next: GrowthMode): void =>
          onChange(withGrowth(c, axis, next === standard ? undefined : next));
        return (
          <div class="ed-stack" key={axis}>
            <Choice
              label={label}
              options={MODES}
              value={modeOf(mode)}
              onChange={(choice) => set(choice === "amount" ? STARTING_AMOUNT : choice)}
            />
            <span class="ed-line">{`${standard === "auto" ? "Auto" : "None"} is the default`}</span>
            {mode === "max" ? <span class="ed-line">{growthMaxLine(c, axis)}</span> : null}
            {typeof mode === "number" ? (
              <NumField
                id={`${c.id}-growth-${axis}-amount`}
                label={`${label}, amount mm`}
                value={mode}
                {...OFFSET}
                path={`/components/${index}/growth/${axis}`}
                onCommit={(v) => onChange(withGrowth(c, axis, v))}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
