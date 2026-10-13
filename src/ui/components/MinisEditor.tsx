// src/ui/components/MinisEditor.tsx
import type { MinisComponent } from "../../model/types";
import { SelectField, TextField } from "../fields";
import { COUNT, LENGTH } from "../limits";
import { NumberField } from "../NumberField";
import { CommonOptions, commonOptionPaths } from "./CommonOptions";
import { ListNotices } from "./ListNotices";
import { MoreOptions } from "./MoreOptions";
import { BinNotes, ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

type Figure = MinisComponent["figures"][number];

export function MinisEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<MinisComponent>) {
  const at = `/components/${index}`;
  const setFigure = (j: number, patch: Partial<Figure>): void => {
    onChange({ ...c, figures: c.figures.map((f, k) => (k === j ? { ...f, ...patch } : f)) });
  };
  return (
    <>
      <fieldset class="list-rows">
        <legend>Figures</legend>
        <ListNotices id={`${c.id}-figures`} path={`${at}/figures`} />
        {c.figures.map((f, j) => {
          const n = j + 1;
          return (
            <div class="list-row" key={j}>
              <TextField
                id={`${c.id}-fig${j}-name`}
                label={`Name of figure ${n}`}
                value={f.name}
                onCommit={(name) => setFigure(j, { name })}
              />
              <NumberField
                id={`${c.id}-fig${j}-w`}
                label={`Figure ${n} width`}
                unit="mm"
                value={f.w}
                path={`${at}/figures/${j}/w`}
                {...LENGTH}
                onCommit={(w) => setFigure(j, { w })}
              />
              <NumberField
                id={`${c.id}-fig${j}-d`}
                label={`Figure ${n} depth`}
                unit="mm"
                value={f.d}
                path={`${at}/figures/${j}/d`}
                {...LENGTH}
                onCommit={(d) => setFigure(j, { d })}
              />
              <NumberField
                id={`${c.id}-fig${j}-h`}
                label={`Figure ${n} height`}
                unit="mm"
                value={f.h}
                path={`${at}/figures/${j}/h`}
                {...LENGTH}
                onCommit={(h) => setFigure(j, { h })}
              />
              <NumberField
                id={`${c.id}-fig${j}-count`}
                label={`How many of figure ${n}`}
                value={f.count}
                {...COUNT}
                path={`${at}/figures/${j}/count`}
                onCommit={(count) => setFigure(j, { count })}
              />
              <button
                type="button"
                class="row-remove"
                aria-label={`Remove figure ${f.name === "" ? n : f.name}`}
                disabled={c.figures.length <= 1}
                onClick={() => onChange({ ...c, figures: c.figures.filter((_f, k) => k !== j) })}
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
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
          Add figure
        </button>
      </fieldset>
      <BinNotes component={c} index={index} />
      <MoreOptions open={advanced} errorPaths={commonOptionPaths(index)}>
        <CommonOptions
          component={c}
          index={index}
          onChange={onChange}
          tray={
            <>
              <SelectField
                id={`${c.id}-storage`}
                label="Storage"
                value={c.storage}
                options={[
                  { value: "pockets", label: "One pocket per figure" },
                  { value: "bulk", label: "Loose in a scoop tray" },
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
