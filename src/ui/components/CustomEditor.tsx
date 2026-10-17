// src/ui/components/CustomEditor.tsx
// EditKinds' "something else": the size of one, and how many.
import type { CustomComponent } from "../../model/types";
import { LENGTH } from "../limits";
import { AccessChoice, CommonRows, commonOptionPaths } from "./CommonOptions";
import { CountField, Group, NumField } from "./controls";
import { GrowthOptions } from "./GrowthOptions";
import { MoreOptions } from "./MoreOptions";
import { moreSummary } from "./moreSummary";
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
      <MoreOptions summary={moreSummary(c)} errorPaths={commonOptionPaths(index)}>
        <GrowthOptions component={c} index={index} onChange={onChange} />
        <AccessChoice component={c} index={index} onChange={onChange} />
        <TrayShape component={c} index={index} onChange={onChange} />
        <CommonRows component={c} index={index} onChange={onChange} />
      </MoreOptions>
    </>
  );
}
