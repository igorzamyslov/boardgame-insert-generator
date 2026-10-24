// src/ui/components/BulkEditor.tsx
// EditKinds' tokens and dice editor: a card for each kind of piece, with its count and its size.
import type { BulkComponent, BulkItem } from "../../model/types";
import { COUNT, LENGTH, VOLUME_ML } from "../limits";
import {
  CopiesRows,
  ReachGroup,
  RoomRows,
  copiesPaths,
  roomPaths,
  shapePaths,
} from "./CommonOptions";
import { NumField, TextBox } from "./controls";
import { RoomOptions } from "./RoomOptions";
import { SettingsGroup, TraySettings } from "./TraySettings";
import { RowRemove } from "./RowRemove";
import { BinNotes, TrayShape } from "./ToggleOptions";
import type { EditorProps } from "./types";

export function BulkEditor({ component: c, index, onChange }: EditorProps<BulkComponent>) {
  const at = `/components/${index}`;
  const setItem = (j: number, item: BulkItem): void => {
    onChange({ ...c, items: c.items.map((x, k) => (k === j ? item : x)) });
  };
  // The board's one link, under the list, is for the newest piece; a piece given as a volume has its own way back.
  const lastCount = c.items.map((x) => !("volumeMl" in x)).lastIndexOf(true);
  const lastItem = c.items[lastCount];
  return (
    <>
      <div class="ed-cards">
        {c.items.map((item, j) => {
          const n = j + 1;
          const volume = "volumeMl" in item ? item : null;
          const pieces = "volumeMl" in item ? null : item;
          return (
            <div class="ed-card" key={j}>
              <div class="ed-card__top">
                <TextBox
                  class="ed-grow"
                  id={`${c.id}-item${j}-name`}
                  label="Piece"
                  labelExtra={`${n}`}
                  value={item.name}
                  onCommit={(name) => setItem(j, { ...item, name })}
                />
                {pieces ? (
                  <NumField
                    class="ed-count"
                    id={`${c.id}-item${j}-count`}
                    label="How many"
                    labelExtra={`of piece ${n}`}
                    value={pieces.count}
                    {...COUNT}
                    path={`${at}/items/${j}/count`}
                    onCommit={(count) => setItem(j, { ...pieces, count })}
                  />
                ) : null}
                <RowRemove
                  label={`Remove ${item.name === "" ? `piece ${n}` : item.name}`}
                  onlyOne={c.items.length <= 1}
                  reason="There has to be at least one piece."
                  onRemove={() => onChange({ ...c, items: c.items.filter((_x, k) => k !== j) })}
                />
              </div>
              {pieces ? (
                <div class="ed-card__sizes">
                  <NumField
                    id={`${c.id}-item${j}-w`}
                    label="Width mm"
                    labelExtra={`of piece ${n}`}
                    value={pieces.w}
                    path={`${at}/items/${j}/w`}
                    {...LENGTH}
                    onCommit={(w) => setItem(j, { ...pieces, w })}
                  />
                  <NumField
                    id={`${c.id}-item${j}-d`}
                    label="Depth mm"
                    labelExtra={`of piece ${n}`}
                    value={pieces.d}
                    path={`${at}/items/${j}/d`}
                    {...LENGTH}
                    onCommit={(d) => setItem(j, { ...pieces, d })}
                  />
                  <NumField
                    id={`${c.id}-item${j}-h`}
                    label="Height mm"
                    labelExtra={`of piece ${n}`}
                    value={pieces.h}
                    path={`${at}/items/${j}/h`}
                    {...LENGTH}
                    onCommit={(h) => setItem(j, { ...pieces, h })}
                  />
                </div>
              ) : null}
              {volume ? (
                <>
                  <NumField
                    id={`${c.id}-item${j}-volume`}
                    label="Volume ml"
                    labelExtra={`of piece ${n}`}
                    value={volume.volumeMl}
                    {...VOLUME_ML}
                    path={`${at}/items/${j}/volumeMl`}
                    onCommit={(volumeMl) => setItem(j, { ...volume, volumeMl })}
                  />
                  <button
                    type="button"
                    class="ed-link"
                    onClick={() => setItem(j, { name: item.name, count: 10, w: 16, d: 16, h: 4 })}
                  >
                    Know the size? Give a count and a size instead
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        class="ed-add"
        data-block=""
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
        + Another kind of piece
      </button>
      {lastCount !== -1 ? (
        <button
          type="button"
          class="ed-link"
          onClick={() => {
            const item = c.items[lastCount];
            if (item !== undefined) {
              setItem(lastCount, { name: item.name, volumeMl: 50 });
            }
          }}
        >
          {lastItem === undefined || lastItem.name === ""
            ? "Don't know the size? Give a volume instead"
            : `Don't know the size of ${lastItem.name}? Give a volume instead`}
        </button>
      ) : null}
      <BinNotes component={c} index={index} />
      <TraySettings>
        <ReachGroup component={c} index={index} onChange={onChange} />
        <SettingsGroup id="shape" component={c} errorPaths={shapePaths(index)}>
          <TrayShape component={c} index={index} onChange={onChange} />
        </SettingsGroup>
        <SettingsGroup id="room" component={c} errorPaths={roomPaths(index)}>
          <RoomOptions component={c} index={index} onChange={onChange} />
          <RoomRows component={c} index={index} onChange={onChange} />
        </SettingsGroup>
        <SettingsGroup id="copies" component={c} errorPaths={copiesPaths(index)}>
          <CopiesRows component={c} index={index} onChange={onChange} />
        </SettingsGroup>
      </TraySettings>
    </>
  );
}
