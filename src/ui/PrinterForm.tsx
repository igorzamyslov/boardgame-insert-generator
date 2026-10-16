// src/ui/PrinterForm.tsx
import { useEffect, useRef, useState } from "preact/hooks";
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
  onChange: (patch: Partial<Printer>) => void;
}

const OPTIONS: SelectOption<string>[] = [
  ...BED_PRESETS.map((b) => ({ value: b.id, label: b.label })),
  { value: CUSTOM_BED, label: "Custom size" },
];

function bedKey(p: Pick<Printer, "bedX" | "bedY" | "bedZ">): string {
  return `${p.bedX}x${p.bedY}x${p.bedZ}`;
}

export function PrinterForm({ printer, onChange }: PrinterFormProps) {
  const matched = bedPresetOf(printer);
  const [customChosen, setCustomChosen] = useState(matched === CUSTOM_BED);
  const key = bedKey(printer);
  // The bed this form last wrote itself (the initial one at first): when the printer's bed
  // changes to anything else (another project was loaded), a "Custom size" choice made for the
  // old bed no longer applies. A size the user types that happens to equal a preset must not
  // collapse the fields mid-edit.
  const written = useRef<string | null>(key);
  useEffect(() => {
    if (key !== written.current) {
      setCustomChosen(false);
    }
  }, [key]);
  const selected = customChosen || matched === CUSTOM_BED ? CUSTOM_BED : matched;
  function changeBed(patch: Partial<Printer>): void {
    written.current = bedKey({ ...printer, ...patch });
    onChange(patch);
  }
  const examples = BED_PRESETS.find((b) => b.id === selected)?.examples;
  return (
    <div class="form-grid">
      <SelectField
        id="printer-preset"
        label="Print bed"
        value={selected}
        options={OPTIONS}
        hint={
          examples !== undefined
            ? `Fits ${examples}. Not on the list? Choose “Custom size”. Not sure? Leave this as it is and ask whoever will print it.`
            : "Measure the flat area the printer can print on, and its maximum height."
        }
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
        <div class="form-grid form-grid-3">
          <NumberField
            id="printer-bedX"
            label="Bed X"
            unit="mm"
            value={printer.bedX}
            {...LENGTH}
            onCommit={(v) => changeBed({ bedX: v })}
          />
          <NumberField
            id="printer-bedY"
            label="Bed Y"
            unit="mm"
            value={printer.bedY}
            {...LENGTH}
            onCommit={(v) => changeBed({ bedY: v })}
          />
          <NumberField
            id="printer-bedZ"
            label="Bed Z"
            unit="mm"
            value={printer.bedZ}
            {...LENGTH}
            onCommit={(v) => changeBed({ bedZ: v })}
          />
        </div>
      ) : null}
      <NumberField
        id="printer-bedMargin"
        label="Bed margin"
        unit="mm"
        value={printer.bedMargin}
        {...OFFSET}
        hint="Kept free on every side for the purge line or skirt."
        onCommit={(v) => onChange({ bedMargin: v })}
      />
      <NumberField
        id="printer-layerHeight"
        label="Layer height"
        unit="mm"
        value={printer.layerHeight}
        {...LAYER_HEIGHT}
        hint="Tray heights are rounded to multiples of this."
        onCommit={(v) => onChange({ layerHeight: v })}
      />
    </div>
  );
}
