import { COMPONENT_DEFAULTS } from "./defaults";
import { isRecord } from "./json";
import type { Ctx } from "./schema-reader";
import { absorbErrors, addError, adopt, childCtx, Reader } from "./schema-reader";
import type { Group } from "./types";

function readGroup(r: Reader): Group {
  const id = r.str("id");
  const name = r.str("name", "");
  const copies = r.optNum("copies");
  const access = r.oneOf("access", ["often", "sometimes", "setup"], COMPONENT_DEFAULTS.access);
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
