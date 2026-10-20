import { COMPONENT_DEFAULTS } from "./defaults";
import { isRecord } from "./json";
import { readGrowthMode } from "./schema-read-components";
import type { Ctx } from "./schema-reader";
import { absorbErrors, addError, adopt, childCtx, Reader } from "./schema-reader";
import type { Group } from "./types";

const GROUP_AXES = ["w", "d", "h"] as const;

/** The group's own `growth`: width, length and height of the whole tray, never the stack. */
function readGroupGrowth(r: Reader): Group["growth"] {
  const g = r.optChild("growth");
  if (!g) {
    return undefined;
  }
  const growth: NonNullable<Group["growth"]> = {};
  for (const axis of GROUP_AXES) {
    const mode = readGrowthMode(g, axis);
    if (mode !== undefined) {
      growth[axis] = mode;
    }
  }
  g.finish({});
  return Object.keys(growth).length > 0 ? growth : undefined;
}

function readGroup(r: Reader): Group {
  const id = r.str("id");
  const name = r.str("name", "");
  const copies = r.optNum("copies");
  const access = r.oneOf("access", ["often", "sometimes", "setup"], COMPONENT_DEFAULTS.access);
  const growth = readGroupGrowth(r);
  const memberIds = r.list("memberIds", []).map((m, i) => {
    if (typeof m !== "string") {
      addError(r.ctx, `${r.at("memberIds")}/${i}: expected text`);
    }
    return String(m);
  });
  return r.finish({
    id,
    name,
    ...(copies === undefined ? {} : { copies }),
    access,
    ...(growth === undefined ? {} : { growth }),
    memberIds,
  });
}

/**
 * The project's groups. Unknown fields of a group are kept in newer-minor files (written back on
 * save, as a component's are). A group has no foreign form, though: one that uses a value this
 * app doesn't know (an access word) would lose it silently, so the file is refused instead, like
 * any other damaged structure. Every group in the file is read: none is dropped.
 */
export function readGroups(list: unknown[], ctx: Ctx): Group[] {
  const groups: Group[] = [];
  list.forEach((raw, index) => {
    const path = `/groups/${index}`;
    if (!isRecord(raw)) {
      addError(ctx, `${path}: expected an object`);
      return;
    }
    const sub = childCtx(ctx);
    const group = readGroup(new Reader(raw, path, sub));
    absorbErrors(ctx, sub);
    for (const unknown of sub.unknownValues) {
      addError(ctx, `${unknown}: unknown value`);
    }
    adopt(ctx, sub);
    groups.push(group);
  });
  return groups;
}
