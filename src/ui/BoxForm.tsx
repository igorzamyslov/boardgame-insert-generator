// src/ui/BoxForm.tsx
import type { Box } from "../model/types";
import { CheckField, SelectField } from "./fields";
import { LENGTH, OFFSET } from "./limits";
import { NumberField } from "./NumberField";

export interface BoxFormProps {
  box: Box;
  onChange: (patch: Partial<Box>) => void;
}

export function BoxForm({ box, onChange }: BoxFormProps) {
  return (
    <div class="form-grid">
      <NumberField
        id="box-innerWidth"
        label="Inner width (X, left → right)"
        unit="mm"
        value={box.innerWidth}
        path="/box/innerWidth"
        {...LENGTH}
        hint="Seen from the box front. Measure at the narrowest point."
        onCommit={(v) => onChange({ innerWidth: v })}
      />
      <NumberField
        id="box-innerDepth"
        label="Inner depth (Y, front → back)"
        unit="mm"
        value={box.innerDepth}
        path="/box/innerDepth"
        {...LENGTH}
        hint="Measure at the narrowest point."
        onCommit={(v) => onChange({ innerDepth: v })}
      />
      <NumberField
        id="box-innerHeight"
        label="Inner height"
        unit="mm"
        value={box.innerHeight}
        path="/box/innerHeight"
        {...LENGTH}
        hint="From the floor to the rim of the bottom part."
        onCommit={(v) => onChange({ innerHeight: v })}
      />
      <NumberField
        id="box-headroom"
        label="Headroom"
        unit="mm"
        value={box.headroom}
        path="/box/headroom"
        {...OFFSET}
        hint="Boards and rulebooks stacked as they lie on top, plus 1 mm for warp. 0 if nothing lies on top."
        onCommit={(v) => onChange({ headroom: v })}
      />
      {box.headroom > 0 ? (
        <SelectField
          id="box-headroomCoverage"
          label="Do the boards and books cover every tray?"
          value={box.headroomCoverage}
          options={[
            { value: "full", label: "Yes, they cover the whole box" },
            { value: "partial", label: "No, only part of it" },
          ]}
          hint="Loose bits are kept out of top trays that nothing covers."
          onChange={(v) => onChange({ headroomCoverage: v })}
        />
      ) : null}
      <CheckField
        id="box-storedOnSide"
        label="The box is stored on its side"
        checked={box.storedOnSide}
        hint="Loose bits in the top layer then get a warning."
        onChange={(v) => onChange({ storedOnSide: v })}
      />
    </div>
  );
}
