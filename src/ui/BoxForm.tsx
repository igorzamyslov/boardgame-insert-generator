// src/ui/BoxForm.tsx
import type { Box } from "../model/types";
import { Advanced } from "./Advanced";
import { CheckField, SelectField } from "./fields";
import { LENGTH, OFFSET } from "./limits";
import { NumberField } from "./NumberField";

export interface BoxFormProps {
  box: Box;
  advanced: boolean;
  onChange: (patch: Partial<Box>) => void;
}

export function BoxForm({ box, advanced, onChange }: BoxFormProps) {
  return (
    <div class="form-grid">
      <div class="form-grid form-grid-3">
        <NumberField
          id="box-innerWidth"
          label="Width"
          unit="mm"
          value={box.innerWidth}
          path="/box/innerWidth"
          {...LENGTH}
          onCommit={(v) => onChange({ innerWidth: v })}
        />
        <NumberField
          id="box-innerDepth"
          label="Depth"
          unit="mm"
          value={box.innerDepth}
          path="/box/innerDepth"
          {...LENGTH}
          onCommit={(v) => onChange({ innerDepth: v })}
        />
        <NumberField
          id="box-innerHeight"
          label="Height"
          unit="mm"
          value={box.innerHeight}
          path="/box/innerHeight"
          {...LENGTH}
          onCommit={(v) => onChange({ innerHeight: v })}
        />
      </div>
      <p class="hint">
        Measure the inside of the box at its narrowest point. Width runs left to right, depth front
        to back, seen from the front. Height runs from the floor to the underside of the lid.
      </p>
      {advanced ? (
        <Advanced>
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
              label="Covered by boards"
              value={box.headroomCoverage}
              options={[
                { value: "full", label: "Yes, the whole box" },
                { value: "partial", label: "No, only part of it" },
              ]}
              hint="Do the boards and books cover every tray? Loose bits are kept out of top trays that nothing covers."
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
        </Advanced>
      ) : null}
    </div>
  );
}
