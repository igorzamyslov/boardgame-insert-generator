// src/ui/components/CustomEditor.tsx
// EditKinds' "something else": the size of one, and how many.
import type { CustomComponent } from "../../model/types";
import { LENGTH } from "../limits";
import {
  CopiesRows,
  ReachGroup,
  RoomRows,
  copiesPaths,
  roomPaths,
  shapePaths,
} from "./CommonOptions";
import { CountField, Group, NumField } from "./controls";
import { SettingsGroup, TraySettings } from "./TraySettings";
import { BinNotes, TrayShape } from "./ToggleOptions";
import type { EditorProps } from "./types";

export function CustomEditor({ component: c, index, onChange }: EditorProps<CustomComponent>) {
  const at = `/components/${index}`;
  return (
    <>
      <Group label="Size of one">
        <div class="ed-trio">
          <NumField
            id={`${c.id}-w`}
            label="Width mm"
            value={c.w}
            path={`${at}/w`}
            {...LENGTH}
            onCommit={(w) => onChange({ ...c, w })}
          />
          <NumField
            id={`${c.id}-d`}
            label="Depth mm"
            value={c.d}
            path={`${at}/d`}
            {...LENGTH}
            onCommit={(d) => onChange({ ...c, d })}
          />
          <NumField
            id={`${c.id}-h`}
            label="Height mm"
            value={c.h}
            path={`${at}/h`}
            {...LENGTH}
            onCommit={(h) => onChange({ ...c, h })}
          />
        </div>
        <span class="ed-line">Anything that isn&apos;t cards, pieces, tiles or figures.</span>
      </Group>
      <CountField
        label="How many?"
        name="Number of items"
        value={c.count}
        path={`${at}/count`}
        onChange={(count) => onChange({ ...c, count })}
      />
      <BinNotes component={c} index={index} />
      <TraySettings>
        <ReachGroup component={c} index={index} onChange={onChange} />
        <SettingsGroup id="shape" component={c} errorPaths={shapePaths(index)}>
          <TrayShape component={c} index={index} onChange={onChange} />
        </SettingsGroup>
        <SettingsGroup id="room" component={c} errorPaths={roomPaths(index)}>
          <RoomRows component={c} index={index} onChange={onChange} />
        </SettingsGroup>
        <SettingsGroup id="copies" component={c} errorPaths={copiesPaths(index)}>
          <CopiesRows component={c} index={index} onChange={onChange} />
        </SettingsGroup>
      </TraySettings>
    </>
  );
}
