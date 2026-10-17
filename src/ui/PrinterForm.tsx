// src/ui/PrinterForm.tsx
// "Printer bed" of My printer (Settings board): the bed as four chips, what it limits, and the
// printer's other numbers in "Printer details". The words are the board's (DESIGN §7 rules the
// rest).
import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { ChoiceChips, DisclosureRow } from "../kit";
import { BED_PRESETS } from "../model/presets";
import type { Printer } from "../model/types";
import { NumField } from "./components/controls";
import { LAYER_HEIGHT, LENGTH, OFFSET } from "./limits";
import { formatNumber } from "./NumberField";
import "./settings.css";

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
  /** What the sheet adds inside Printer details (folding risers): after the printer's own numbers. */
  children?: ComponentChildren;
}

/** The board's three beds, named by size; every other bed is "My own size". */
const CHIPS: readonly { id: string; size: string }[] = [
  { id: "bed-180", size: "Small" },
  { id: "ender-3", size: "Medium" },
  { id: "bambu-256", size: "Large" },
];

const OPTIONS = [
  ...CHIPS.flatMap((c) => {
    const bed = BED_PRESETS.find((b) => b.id === c.id);
    return bed === undefined ? [] : [{ value: c.id, label: `${c.size}, ${bed.bedX} mm` }];
  }),
  { value: CUSTOM_BED, label: "My own size" },
];

function bedKey(p: Pick<Printer, "bedX" | "bedY" | "bedZ">): string {
  return `${p.bedX}x${p.bedY}x${p.bedZ}`;
}

export function PrinterForm({ printer, onChange, children }: PrinterFormProps) {
  const matched = bedPresetOf(printer);
  const [customChosen, setCustomChosen] = useState(matched === CUSTOM_BED);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const key = bedKey(printer);
  const titleId = useId();
  const panelId = useId();
  // The bed this form last wrote itself (the initial one at first): when the printer's bed
  // changes to anything else (another project was loaded), a "My own size" choice made for the
  // old bed no longer applies. A size the user types that happens to equal a preset must not
  // collapse the fields mid-edit.
  const written = useRef<string | null>(key);
  useEffect(() => {
    if (key !== written.current) {
      setCustomChosen(false);
    }
  }, [key]);
  // A bed that is not one of the three chips is "My own size", whatever preset it is.
  const onChip = OPTIONS.some((o) => o.value === matched);
  const selected = customChosen || !onChip ? CUSTOM_BED : matched;
  function changeBed(patch: Partial<Printer>): void {
    written.current = bedKey({ ...printer, ...patch });
    onChange(patch);
  }
  return (
    <section class="st-sec st-sec--bed" aria-labelledby={titleId}>
      <h2 class="st-h2" id={titleId}>
        Printer bed
      </h2>
      <ChoiceChips
        label="Printer bed"
        options={OPTIONS}
        value={selected}
        onChange={(id) => {
          const preset = BED_PRESETS.find((b) => b.id === id);
          if (preset) {
            setCustomChosen(false);
            onChange({ bedX: preset.bedX, bedY: preset.bedY, bedZ: preset.bedZ });
          } else {
            setCustomChosen(true);
            // its three sizes are in Printer details: open them
            setDetailsOpen(true);
          }
        }}
      />
      <span class="st-note">No tray will be bigger than this.</span>
      <DisclosureRow
        title="Printer details"
        meta={`${formatNumber(printer.bedMargin)} mm margin, ${formatNumber(printer.layerHeight)} mm layers`}
        open={detailsOpen}
        controls={panelId}
        onClick={() => setDetailsOpen(!detailsOpen)}
      />
      {detailsOpen ? (
        <div class="st-details" id={panelId}>
          {selected === CUSTOM_BED ? (
            <div class="st-bed-size">
              <NumField
                id="printer-bedX"
                label="Bed X"
                unit="mm"
                value={printer.bedX}
                {...LENGTH}
                onCommit={(v) => changeBed({ bedX: v })}
              />
              <NumField
                id="printer-bedY"
                label="Bed Y"
                unit="mm"
                value={printer.bedY}
                {...LENGTH}
                onCommit={(v) => changeBed({ bedY: v })}
              />
              <NumField
                id="printer-bedZ"
                label="Bed Z"
                unit="mm"
                value={printer.bedZ}
                {...LENGTH}
                onCommit={(v) => changeBed({ bedZ: v })}
              />
            </div>
          ) : null}
          <div class="st-pair">
            <NumField
              id="printer-bedMargin"
              label="Bed margin"
              unit="mm"
              value={printer.bedMargin}
              {...OFFSET}
              onCommit={(v) => onChange({ bedMargin: v })}
            />
            <NumField
              id="printer-layerHeight"
              label="Layer height"
              unit="mm"
              value={printer.layerHeight}
              {...LAYER_HEIGHT}
              onCommit={(v) => onChange({ layerHeight: v })}
            />
          </div>
          {children}
        </div>
      ) : null}
    </section>
  );
}
