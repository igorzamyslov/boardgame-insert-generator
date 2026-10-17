// src/ui/components/TilesEditor.tsx
// EditKinds' tiles editor: the shape, the size, how thick, how many and how they stand.
import { useState } from "preact/hooks";
import type { SegmentedOption } from "../../kit";
import type { TileShape, TilesComponent } from "../../model/types";
import { LENGTH } from "../limits";
import { AccessChoice, CommonRows, commonOptionPaths } from "./CommonOptions";
import { Choice, CountField, NumField } from "./controls";
import { GrowthOptions } from "./GrowthOptions";
import { MoreOptions } from "./MoreOptions";
import { moreSummary } from "./moreSummary";
import { BinNotes, TrayShape, WellRows } from "./ToggleOptions";
import type { EditorProps } from "./types";

type ShapeChoice = "square" | "rect" | "hex";

const SHAPE_OPTIONS: SegmentedOption<ShapeChoice>[] = [
  { value: "square", label: "Square" },
  { value: "rect", label: "Rectangle" },
  { value: "hex", label: "Hex" },
];

const UP_OPTIONS: SegmentedOption<"flat" | "pointy">[] = [
  { value: "flat", label: "Flat on top" },
  { value: "pointy", label: "Point on top" },
];

const STAND_OPTIONS: SegmentedOption<TilesComponent["storage"]>[] = [
  { value: "flat", label: "Flat" },
  { value: "upright", label: "Upright" },
  { value: "auto", label: "Auto" },
];

const DEFAULT_RECT: TileShape = { type: "rect", w: 50, d: 50 };
const DEFAULT_HEX: TileShape = { type: "hex", flatToFlat: 40, orientation: "flat" };

export function TilesEditor({ component: c, index, onChange }: EditorProps<TilesComponent>) {
  const at = `/components/${index}`;
  const rect = c.shape.type === "rect" ? c.shape : null;
  const hex = c.shape.type === "hex" ? c.shape : null;
  // A rectangle whose sides happen to be equal is still the Rectangle the person chose.
  const [wantsRect, setWantsRect] = useState(rect !== null && rect.w !== rect.d);
  const choice: ShapeChoice = hex ? "hex" : wantsRect ? "rect" : "square";
  return (
    <>
      <Choice
        label="Shape"
        options={SHAPE_OPTIONS}
        value={choice}
        onChange={(next) => {
          if (next === choice) {
            return;
          }
          setWantsRect(next === "rect");
          if (next === "hex") {
            onChange({ ...c, shape: DEFAULT_HEX });
          } else if (rect !== null) {
            onChange({ ...c, shape: next === "square" ? { ...rect, d: rect.w } : rect });
          } else {
            onChange({ ...c, shape: DEFAULT_RECT });
          }
        }}
      />
      {rect && choice === "square" ? (
        <NumField
          id={`${c.id}-tileW`}
          label="Side mm"
          value={rect.w}
          path={`${at}/shape/w`}
          {...LENGTH}
          onCommit={(w) => onChange({ ...c, shape: { ...rect, w, d: w } })}
        />
      ) : null}
      {rect && choice === "rect" ? (
        <div class="ed-pair">
          <NumField
            id={`${c.id}-tileW`}
            label="Width mm"
            value={rect.w}
            path={`${at}/shape/w`}
            {...LENGTH}
            onCommit={(w) => onChange({ ...c, shape: { ...rect, w } })}
          />
          <NumField
            id={`${c.id}-tileD`}
            label="Depth mm"
            value={rect.d}
            path={`${at}/shape/d`}
            {...LENGTH}
            onCommit={(d) => onChange({ ...c, shape: { ...rect, d } })}
          />
        </div>
      ) : null}
      {hex ? (
        <>
          <NumField
            id={`${c.id}-hexSize`}
            label="Across the flat sides (mm)"
            value={hex.flatToFlat}
            path={`${at}/shape/flatToFlat`}
            {...LENGTH}
            onCommit={(flatToFlat) => onChange({ ...c, shape: { ...hex, flatToFlat } })}
          />
          <Choice
            label="Which way up"
            options={UP_OPTIONS}
            value={hex.orientation}
            onChange={(orientation) => onChange({ ...c, shape: { ...hex, orientation } })}
          />
        </>
      ) : null}
      <NumField
        id={`${c.id}-thickness`}
        label="Thickness (mm)"
        value={c.thickness}
        path={`${at}/thickness`}
        {...LENGTH}
        onCommit={(thickness) => onChange({ ...c, thickness })}
      />
      <CountField
        label="How many tiles?"
        name="Number of tiles"
        value={c.count}
        path={`${at}/count`}
        onChange={(count) => onChange({ ...c, count })}
      />
      <Choice
        label="Tiles stand"
        options={STAND_OPTIONS}
        value={c.storage}
        onChange={(storage) => onChange({ ...c, storage })}
      />
      <BinNotes component={c} index={index} />
      <MoreOptions summary={moreSummary(c)} errorPaths={commonOptionPaths(index)}>
        <GrowthOptions component={c} index={index} onChange={onChange} />
        <AccessChoice component={c} index={index} onChange={onChange} />
        <TrayShape component={c} index={index} onChange={onChange} />
        <WellRows component={c} index={index} onChange={onChange} />
        <CommonRows component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
