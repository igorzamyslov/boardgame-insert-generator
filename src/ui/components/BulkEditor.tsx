// src/ui/components/BulkEditor.tsx
import type { BulkComponent, BulkItem } from "../../model/types";
import { SelectField, TextField } from "../fields";
import { COUNT, LENGTH, VOLUME_ML } from "../limits";
import { NumberField } from "../NumberField";
import { CommonOptions, commonOptionPaths } from "./CommonOptions";
import { ListNotices } from "./ListNotices";
import { DerivedSizes } from "./DerivedSizes";
import { MoreOptions } from "./MoreOptions";
import { BinNotes, ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

export function BulkEditor({ component: c, index, onChange }: EditorProps<BulkComponent>) {
  const at = `/components/${index}`;
  const setItem = (j: number, item: BulkItem): void => {
    onChange({ ...c, items: c.items.map((x, k) => (k === j ? item : x)) });
  };
  return (
    <>
      <fieldset class="list-rows">
        <legend>Items</legend>
        <ListNotices id={`${c.id}-items`} path={`${at}/items`} />
        {c.items.map((item, j) => {
          const n = j + 1;
          const volume = "volumeMl" in item ? item : null;
          const pieces = "volumeMl" in item ? null : item;
          return (
            <div class="list-row" key={j}>
              <TextField
                id={`${c.id}-item${j}-name`}
                label={`Name of item ${n}`}
                value={item.name}
                onCommit={(name) => setItem(j, { ...item, name })}
              />
              <SelectField
                id={`${c.id}-item${j}-kind`}
                label={`How to size item ${n}`}
                value={volume ? "volume" : "pieces"}
                options={[
                  { value: "pieces", label: "Count × size" },
                  { value: "volume", label: "Pile volume" },
                ]}
                hint="Use the pile volume for coins or cubes: pour them into a measuring cup."
                onChange={(kind) =>
                  setItem(
                    j,
                    kind === "volume"
                      ? { name: item.name, volumeMl: 50 }
                      : { name: item.name, count: 10, w: 16, d: 16, h: 4 },
                  )
                }
              />
              {volume ? (
                <NumberField
                  id={`${c.id}-item${j}-volume`}
                  label={`Volume of item ${n}`}
                  unit="ml"
                  value={volume.volumeMl}
                  {...VOLUME_ML}
                  path={`${at}/items/${j}/volumeMl`}
                  onCommit={(volumeMl) => setItem(j, { ...volume, volumeMl })}
                />
              ) : null}
              {pieces ? (
                <>
                  <NumberField
                    id={`${c.id}-item${j}-count`}
                    label={`How many of item ${n}`}
                    value={pieces.count}
                    {...COUNT}
                    path={`${at}/items/${j}/count`}
                    onCommit={(count) => setItem(j, { ...pieces, count })}
                  />
                  <NumberField
                    id={`${c.id}-item${j}-w`}
                    label={`Item ${n} width`}
                    unit="mm"
                    value={pieces.w}
                    path={`${at}/items/${j}/w`}
                    {...LENGTH}
                    onCommit={(w) => setItem(j, { ...pieces, w })}
                  />
                  <NumberField
                    id={`${c.id}-item${j}-d`}
                    label={`Item ${n} length`}
                    unit="mm"
                    value={pieces.d}
                    path={`${at}/items/${j}/d`}
                    {...LENGTH}
                    onCommit={(d) => setItem(j, { ...pieces, d })}
                  />
                  <NumberField
                    id={`${c.id}-item${j}-h`}
                    label={`Item ${n} height`}
                    unit="mm"
                    value={pieces.h}
                    path={`${at}/items/${j}/h`}
                    {...LENGTH}
                    onCommit={(h) => setItem(j, { ...pieces, h })}
                  />
                </>
              ) : null}
              <button
                type="button"
                class="row-remove"
                aria-label={`Remove item ${item.name === "" ? n : item.name}`}
                disabled={c.items.length <= 1}
                onClick={() => onChange({ ...c, items: c.items.filter((_x, k) => k !== j) })}
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
              items: [
                ...c.items,
                { name: `Item ${c.items.length + 1}`, count: 10, w: 16, d: 16, h: 4 },
              ],
            })
          }
        >
          Add item
        </button>
      </fieldset>
      <BinNotes component={c} index={index} />
      <DerivedSizes component={c} index={index} />
      <MoreOptions errorPaths={commonOptionPaths(index)}>
        <CommonOptions
          component={c}
          index={index}
          onChange={onChange}
          tray={<ToggleOptions component={c} index={index} onChange={onChange} />}
        />
      </MoreOptions>
    </>
  );
}
