// src/ui/components/GrowthOptions.tsx
import { defaultGrowth, growthAxesOf, growthOf, withGrowth } from "../../model/defaults";
import type { Component, GrowthAxis, GrowthMode } from "../../model/types";
import {
  AUTO_GROWTH_CEILING,
  AUTO_GROWTH_FRACTION,
  PLATED_RETENTION,
  UNPLATED_RETENTION,
} from "../../sizing/constants";
import { SelectField } from "../fields";
import type { SelectOption } from "../fields";
import { OFFSET } from "../limits";
import { NumberField } from "../NumberField";
import type { EditorProps } from "./types";

type Choice = "off" | "auto" | "amount" | "max";

/** The amount a "set amount" starts at when picked, mm. */
const STARTING_AMOUNT = 10;

const percent = `${Math.round(AUTO_GROWTH_FRACTION * 100)}%`;

/** What `auto` means, in a hint: the same words everywhere, naming the quantity. */
function autoHint(what: string): string {
  return `Auto: up to ${AUTO_GROWTH_FRACTION === 1 ? "" : `${percent} of `}${what}, at most ${AUTO_GROWTH_CEILING} mm; any room beyond that is a filler.`;
}

const EXPLAIN = "Off: never. A set amount: that many mm. As much as there is: all of it.";

interface AxisText {
  label: string;
  hint: string;
}

/** The label and hint of a growth control, in terms of what the component stores. */
function textOf(c: Component, axis: GrowthAxis): AxisText {
  if (axis === "stack") {
    const stack = c.kind === "tiles" ? "stack of tiles" : "deck";
    return {
      label: "Room for expansions",
      hint: `How much more room the ${stack} gets, so the collection can grow: along its stack when it stands up, taller when it lies flat (off by default: a riser takes the spare height). ${autoHint(`the ${stack}'s thickness`)} Standing up with no spacer plates, a ${stack} is held to at most ${UNPLATED_RETENTION}× its own thickness, past which it would topple, and to what keeps it under its finger cut when it stands against one end of the well; with plates, ${PLATED_RETENTION}×; with dividers, ${UNPLATED_RETENTION}× per section. ${EXPLAIN}`,
    };
  }
  if (c.kind === "minis" && c.storage === "pockets") {
    const side = axis === "w" ? "width" : "length";
    return {
      label: `Looser pockets: ${side}`,
      hint: `A pocket wider than the figure, easier to grab. Off by default. ${autoHint(`the figure's ${side}`)} ${EXPLAIN}`,
    };
  }
  const label = { w: "Extra width", d: "Extra length", h: "Extra height" }[axis];
  const side = { w: "width", d: "length", h: "height" }[axis];
  const what = c.kind === "custom" ? `the well's ${side}` : `the bin's ${side}`;
  const why =
    c.kind === "custom"
      ? "More room around the item, for tolerance only. Off by default."
      : "More room for loose pieces, so a bin takes a few millimetres rather than a filler beside it.";
  return { label, hint: `${why} ${autoHint(what)} ${EXPLAIN}` };
}

function choiceOf(mode: GrowthMode): Choice {
  return typeof mode === "number" ? "amount" : mode;
}

/**
 * The growth settings of a component (minimal-trays spec §5), in the user's terms: one control
 * per axis where more room means more pieces, or a looser fit. An axis where growing cannot help
 * (a card well's width and length, a tile's footprint, a minis pocket's depth) is not offered at
 * all: choosing it would teach the wrong model.
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
        const { label, hint } = textOf(c, axis);
        const id = `${c.id}-growth-${axis}`;
        const option = (value: Choice, name: string): SelectOption<Choice> => ({
          value,
          label: value === choiceOf(standard) && value !== "amount" ? `${name} (default)` : name,
        });
        // Picking what the kind does anyway sets nothing, so the file stays as it was.
        const set = (next: GrowthMode): void =>
          onChange(withGrowth(c, axis, next === standard ? undefined : next));
        return (
          <div key={axis}>
            <SelectField
              id={id}
              label={label}
              value={choiceOf(mode)}
              hint={hint}
              options={[
                option("off", "Off"),
                option("auto", "Auto"),
                option("amount", "A set amount"),
                option("max", "As much as there is"),
              ]}
              onChange={(choice) => set(choice === "amount" ? STARTING_AMOUNT : choice)}
            />
            {typeof mode === "number" ? (
              <NumberField
                id={`${id}-amount`}
                label={`${label}, amount`}
                unit="mm"
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
