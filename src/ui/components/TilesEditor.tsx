// src/ui/components/TilesEditor.tsx
import type { TileShape, TilesComponent } from "../../model/types";
import { SelectField } from "../fields";
import { COUNT, LENGTH } from "../limits";
import { NumberField } from "../NumberField";
import { CommonOptions, commonOptionPaths } from "./CommonOptions";
import { DerivedSizes } from "./DerivedSizes";
import { MoreOptions } from "./MoreOptions";
import { BinNotes, ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

const DEFAULT_SHAPES: Record<TileShape["type"], TileShape> = {
  rect: { type: "rect", w: 50, d: 50 },
  hex: { type: "hex", flatToFlat: 40, orientation: "flat" },
};

export function TilesEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<TilesComponent>) {
  const at = `/components/${index}`;
  const rect = c.shape.type === "rect" ? c.shape : null;
  const hex = c.shape.type === "hex" ? c.shape : null;
  return (
    <>
      <SelectField
        id={`${c.id}-shape`}
        label="Tile shape"
        value={c.shape.type}
        options={[
          { value: "rect", label: "Rectangle or square" },
          { value: "hex", label: "Hexagon" },
        ]}
        onChange={(type) => {
          if (type !== c.shape.type) {
            onChange({ ...c, shape: DEFAULT_SHAPES[type] });
          }
        }}
      />
      {rect ? (
        <>
          <NumberField
            id={`${c.id}-tileW`}
            label="Tile width"
            unit="mm"
            value={rect.w}
            path={`${at}/shape/w`}
            {...LENGTH}
            onCommit={(w) => onChange({ ...c, shape: { ...rect, w } })}
          />
          <NumberField
            id={`${c.id}-tileD`}
            label="Tile length"
            unit="mm"
            value={rect.d}
            path={`${at}/shape/d`}
            {...LENGTH}
            onCommit={(d) => onChange({ ...c, shape: { ...rect, d } })}
          />
        </>
      ) : null}
      {hex ? (
        <>
          <NumberField
            id={`${c.id}-hexSize`}
            label="Hex size (flat to flat)"
            unit="mm"
            value={hex.flatToFlat}
            path={`${at}/shape/flatToFlat`}
            {...LENGTH}
            onCommit={(flatToFlat) => onChange({ ...c, shape: { ...hex, flatToFlat } })}
          />
          <SelectField
            id={`${c.id}-hexOrientation`}
            label="Hex orientation"
            value={hex.orientation}
            options={[
              { value: "flat", label: "A flat edge faces the tray front" },
              { value: "pointy", label: "A corner faces the tray front" },
            ]}
            onChange={(orientation) => onChange({ ...c, shape: { ...hex, orientation } })}
          />
        </>
      ) : null}
      <NumberField
        id={`${c.id}-thickness`}
        label="Tile thickness"
        unit="mm"
        value={c.thickness}
        path={`${at}/thickness`}
        {...LENGTH}
        onCommit={(thickness) => onChange({ ...c, thickness })}
      />
      <NumberField
        id={`${c.id}-count`}
        label="Number of tiles"
        value={c.count}
        {...COUNT}
        path={`${at}/count`}
        onCommit={(count) => onChange({ ...c, count })}
      />
      <BinNotes component={c} index={index} />
      <DerivedSizes component={c} index={index} />
      <MoreOptions errorPaths={commonOptionPaths(index)}>
        <CommonOptions
          component={c}
          index={index}
          onChange={onChange}
          tray={
            <>
              <SelectField
                id={`${c.id}-storage`}
                label="Storage"
                hint="Flat piles the tiles in stacks; upright stands them on edge like cards. The optimizer tries both and keeps the one that packs best."
                value={c.storage}
                options={[
                  { value: "auto", label: "Let the optimizer choose" },
                  { value: "flat", label: "Lying flat in stacks" },
                  { value: "upright", label: "Upright, like cards" },
                ]}
                onChange={(storage) => onChange({ ...c, storage })}
              />
              <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
            </>
          }
        />
      </MoreOptions>
    </>
  );
}
