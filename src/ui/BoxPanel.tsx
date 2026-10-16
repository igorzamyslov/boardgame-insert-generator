// src/ui/BoxPanel.tsx
import type { Box } from "../model/types";
import { CheckField } from "./fields";
import { LENGTH, OFFSET } from "./limits";
import { NumberField } from "./NumberField";

export interface BoxPanelProps {
  box: Box;
  onChange: (patch: Partial<Box>) => void;
}

const COVERAGE: { value: Box["headroomCoverage"]; label: string }[] = [
  { value: "full", label: "Whole top" },
  { value: "partial", label: "Part of it" },
];

/**
 * The box: its inside size, the space kept free on top and whether it is stored on its side. Every
 * field is always in view (nothing folds away), so an error in any of them is in sight.
 */
export function BoxPanel({ box, onChange }: BoxPanelProps) {
  return (
    <div class="form-grid box-panel">
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
          label="Length"
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
        Measure the inside of the box at its narrowest point. Width runs left to right, length front
        to back, seen from the front. Height runs from the floor to the underside of the lid.
      </p>
      <NumberField
        id="box-headroom"
        label="Keep space free on top"
        unit="mm"
        value={box.headroom}
        path="/box/headroom"
        {...OFFSET}
        hint="For boards and rulebooks that lie on top, plus 1 mm for warp. 0 if nothing does."
        onCommit={(v) => onChange({ headroom: v })}
      />
      <div class="field">
        <span class="field-label" id="box-headroomCoverage-label">
          Covers
        </span>
        <div class="pf-toggle" role="group" aria-labelledby="box-headroomCoverage-label">
          {COVERAGE.map((o) => (
            <button
              type="button"
              key={o.value}
              aria-pressed={box.headroomCoverage === o.value}
              aria-disabled={box.headroom === 0 ? true : undefined}
              onClick={() => {
                // Nothing lies on top at 0 mm: the choice stays visible but does nothing.
                if (box.headroom > 0) {
                  onChange({ headroomCoverage: o.value });
                }
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p class="hint">Loose pieces stay out of top trays that nothing covers.</p>
      </div>
      <CheckField
        id="box-storedOnSide"
        label="The box is stored on its side"
        checked={box.storedOnSide}
        hint="Loose pieces in the top layer then get a warning."
        onChange={(v) => onChange({ storedOnSide: v })}
      />
    </div>
  );
}
