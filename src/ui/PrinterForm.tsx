// src/ui/PrinterForm.tsx
import { useState } from "preact/hooks";
import { BED_PRESETS } from "../model/presets";
import type { Printer } from "../model/types";
import { SelectField } from "./fields";
import type { SelectOption } from "./fields";
import { LAYER_HEIGHT, LENGTH, OFFSET } from "./limits";
import { NumberField } from "./NumberField";

export const CUSTOM_BED = "custom";

export function bedPresetOf(p: Printer): string {
  const preset = BED_PRESETS.find(
    (b) => b.bedX === p.bedX && b.bedY === p.bedY && b.bedZ === p.bedZ,
  );
  return preset ? preset.id : CUSTOM_BED;
}

export interface PrinterFormProps {
  printer: Printer;
  advanced: boolean;
  onChange: (patch: Partial<Printer>) => void;
}

const OPTIONS: SelectOption<string>[] = [
  ...BED_PRESETS.map((b) => ({ value: b.id, label: b.label })),
  { value: CUSTOM_BED, label: "Custom size" },
];

export function PrinterForm({ printer, advanced, onChange }: PrinterFormProps) {
  const matched = bedPresetOf(printer);
  const [customChosen, setCustomChosen] = useState(matched === CUSTOM_BED);
  const selected = customChosen ? CUSTOM_BED : matched;
  return (
    <div class="form-grid">
      <SelectField
        id="printer-preset"
        label="Printer bed"
        value={selected}
        options={OPTIONS}
        onChange={(id) => {
          const preset = BED_PRESETS.find((b) => b.id === id);
          if (preset) {
            setCustomChosen(false);
            onChange({ bedX: preset.bedX, bedY: preset.bedY, bedZ: preset.bedZ });
          } else {
            setCustomChosen(true);
          }
        }}
      />
      {selected === CUSTOM_BED ? (
        <>
          <NumberField
            id="printer-bedX"
            label="Bed X"
            unit="mm"
            value={printer.bedX}
            path="/printer/bedX"
            {...LENGTH}
            onCommit={(v) => onChange({ bedX: v })}
          />
          <NumberField
            id="printer-bedY"
            label="Bed Y"
            unit="mm"
            value={printer.bedY}
            path="/printer/bedY"
            {...LENGTH}
            onCommit={(v) => onChange({ bedY: v })}
          />
          <NumberField
            id="printer-bedZ"
            label="Bed Z (max print height)"
            unit="mm"
            value={printer.bedZ}
            path="/printer/bedZ"
            {...LENGTH}
            onCommit={(v) => onChange({ bedZ: v })}
          />
        </>
      ) : null}
      {advanced ? (
        <>
          <NumberField
            id="printer-bedMargin"
            label="Bed margin"
            unit="mm"
            value={printer.bedMargin}
            path="/printer/bedMargin"
            {...OFFSET}
            hint="Kept free on every side for the purge line or skirt."
            onCommit={(v) => onChange({ bedMargin: v })}
          />
          <NumberField
            id="printer-layerHeight"
            label="Layer height"
            unit="mm"
            value={printer.layerHeight}
            path="/printer/layerHeight"
            {...LAYER_HEIGHT}
            hint="Tray heights are rounded to multiples of this."
            onCommit={(v) => onChange({ layerHeight: v })}
          />
        </>
      ) : null}
    </div>
  );
}
