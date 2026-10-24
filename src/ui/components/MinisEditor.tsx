// src/ui/components/MinisEditor.tsx
// MobileEdit's figures editor: a card for each size of figure, and how they are stored.
import type { SegmentedOption } from "../../kit";
import { CheckRow, Stepper } from "../../kit";
import type { MinisComponent } from "../../model/types";
import { COUNT, LENGTH } from "../limits";
import { AccessChoice, CommonRows, commonOptionPaths } from "./CommonOptions";
import { Alert, Choice, Group, NumField, Notes, TitleInput } from "./controls";
import { MoreOptions } from "./MoreOptions";
import { RowRemove } from "./RowRemove";
import { BinNotes, TrayShape } from "./ToggleOptions";
import type { EditorProps } from "./types";

type Figure = MinisComponent["figures"][number];

const STORAGE_OPTIONS: SegmentedOption<MinisComponent["storage"]>[] = [
  { value: "pockets", label: "One pocket each" },
  { value: "bulk", label: "Loose in a tray" },
];

export function MinisEditor({ component: c, index, onChange }: EditorProps<MinisComponent>) {
  const at = `/components/${index}`;
  const setFigure = (j: number, patch: Partial<Figure>): void => {
    onChange({ ...c, figures: c.figures.map((f, k) => (k === j ? { ...f, ...patch } : f)) });
  };
  // Off is the absence of the key, as for every other optional setting: the file stays as it was.
  const setKeepUpright = (j: number, on: boolean): void => {
    onChange({
      ...c,
      figures: c.figures.map((f, k) => {
        if (k !== j) {
          return f;
        }
        return on
          ? { ...f, keepUpright: true }
          : (Object.fromEntries(
              Object.entries(f).filter(([key]) => key !== "keepUpright"),
            ) as Figure);
      }),
    });
  };
  return (
    <>
      <Group label="Figures">
        <div class="ed-cards">
          {c.figures.map((f, j) => {
            const n = j + 1;
            const countPath = `${at}/figures/${j}/count`;
            return (
              <div class="ed-card ed-card--figure" key={j}>
                <div class="ed-card__top ed-card__top--center">
                  <TitleInput
                    class="ed-grow"
                    id={`${c.id}-fig${j}-name`}
                    label={`Name of figure ${n}`}
                    value={f.name}
                    onCommit={(name) => setFigure(j, { name })}
                  />
                  <Stepper
                    label={f.name === "" ? `Number of figure ${n}` : `Number of ${f.name} figures`}
                    value={f.count}
                    min={COUNT.min}
                    max={COUNT.max}
                    onChange={(count) => setFigure(j, { count })}
                  />
                  {c.figures.length > 1 ? (
                    <RowRemove
                      label={`Remove figure ${f.name === "" ? n : f.name}`}
                      onlyOne={false}
                      reason="There has to be at least one figure."
                      onRemove={() =>
                        onChange({ ...c, figures: c.figures.filter((_f, k) => k !== j) })
                      }
                    />
                  ) : null}
                </div>
                <Alert id={`${c.id}-fig${j}-count-error`} path={countPath} />
                <Notes path={countPath} />
                <span class="ed-line">Measure one figure, base included</span>
                <div class="ed-trio">
                  <NumField
                    compact={false}
                    id={`${c.id}-fig${j}-w`}
                    label="Wide"
                    labelExtra={`figure ${n}`}
                    unit="mm"
                    value={f.w}
                    path={`${at}/figures/${j}/w`}
                    {...LENGTH}
                    onCommit={(w) => setFigure(j, { w })}
                  />
                  <NumField
                    compact={false}
                    id={`${c.id}-fig${j}-d`}
                    label="Deep"
                    labelExtra={`figure ${n}`}
                    unit="mm"
                    value={f.d}
                    path={`${at}/figures/${j}/d`}
                    {...LENGTH}
                    onCommit={(d) => setFigure(j, { d })}
                  />
                  <NumField
                    compact={false}
                    id={`${c.id}-fig${j}-h`}
                    label="Tall"
                    labelExtra={`figure ${n}`}
                    unit="mm"
                    value={f.h}
                    path={`${at}/figures/${j}/h`}
                    {...LENGTH}
                    onCommit={(h) => setFigure(j, { h })}
                  />
                </div>
                <CheckRow
                  compact
                  label={`${f.name === "" ? `Figure ${n}` : f.name} stays upright`}
                  hint="Never laid on its side"
                  checked={f.keepUpright === true}
                  onChange={(on) => setKeepUpright(j, on)}
                />
              </div>
            );
          })}
        </div>
        <button
          type="button"
          class="ed-add"
          onClick={() =>
            onChange({
              ...c,
              figures: [
                ...c.figures,
                { name: `Figure ${c.figures.length + 1}`, w: 25, d: 25, h: 40, count: 1 },
              ],
            })
          }
        >
          + Another size of figure
        </button>
      </Group>
      <Choice
        label="How they're stored"
        options={STORAGE_OPTIONS}
        value={c.storage}
        onChange={(storage) => onChange({ ...c, storage })}
      />
      <BinNotes component={c} index={index} />
      <MoreOptions component={c} errorPaths={commonOptionPaths(index)}>
        <AccessChoice component={c} index={index} onChange={onChange} />
        <TrayShape component={c} index={index} onChange={onChange} />
        <CommonRows component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
