// src/ui/components/CustomEditor.tsx
import type { CustomComponent } from "../../model/types";
import { COUNT, LENGTH } from "../limits";
import { NumberField } from "../NumberField";
import { CommonOptions, commonOptionPaths } from "./CommonOptions";
import { MoreOptions } from "./MoreOptions";
import { BinNotes, ToggleOptions } from "./ToggleOptions";
import type { EditorProps } from "./types";

export function CustomEditor({
  component: c,
  index,
  advanced,
  onChange,
}: EditorProps<CustomComponent>) {
  const at = `/components/${index}`;
  return (
    <>
      <NumberField
        id={`${c.id}-w`}
        label="Width"
        unit="mm"
        value={c.w}
        path={`${at}/w`}
        {...LENGTH}
        onCommit={(w) => onChange({ ...c, w })}
      />
      <NumberField
        id={`${c.id}-d`}
        label="Depth"
        unit="mm"
        value={c.d}
        path={`${at}/d`}
        {...LENGTH}
        onCommit={(d) => onChange({ ...c, d })}
      />
      <NumberField
        id={`${c.id}-h`}
        label="Height"
        unit="mm"
        value={c.h}
        path={`${at}/h`}
        {...LENGTH}
        onCommit={(h) => onChange({ ...c, h })}
      />
      <NumberField
        id={`${c.id}-count`}
        label="How many"
        value={c.count}
        {...COUNT}
        path={`${at}/count`}
        onCommit={(count) => onChange({ ...c, count })}
      />
      <BinNotes component={c} index={index} />
      <MoreOptions open={advanced} errorPaths={commonOptionPaths(index)}>
        <CommonOptions
          component={c}
          index={index}
          onChange={onChange}
          tray={
            <ToggleOptions component={c} index={index} advanced={advanced} onChange={onChange} />
          }
        />
      </MoreOptions>
    </>
  );
}
