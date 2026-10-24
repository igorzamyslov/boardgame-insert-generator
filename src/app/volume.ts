// src/app/volume.ts
// The volume note's figures for a project: its items' smallest trays against the box (layout/volume),
// each item called by its own name, and by its copies when it has several ("Faction ×7").
import { createCtx } from "../layout/context";
import { volumeBudget, type VolumeBudget } from "../layout/volume";
import { DEFAULT_GROUP_NAME, copiesOf, requirementKeyOf } from "../model/groups";
import type { Project } from "../model/types";
import { buildLayoutInput } from "./runner";

/** The budget of the project's items, or null when the engine cannot size them (an input in error). Never throws. */
export function projectVolume(p: Project): VolumeBudget | null {
  try {
    const names = new Map<string, string>();
    for (const c of p.components) {
      const key = requirementKeyOf(p, c);
      const group = (p.groups ?? []).find((g) => g.id === key);
      const base = group === undefined ? c.name : group.name.trim() || DEFAULT_GROUP_NAME;
      const copies = copiesOf(p, c);
      names.set(key, copies > 1 ? `${base} ×${copies}` : base);
    }
    return volumeBudget(createCtx(buildLayoutInput(p)), (key) => names.get(key));
  } catch {
    return null;
  }
}
