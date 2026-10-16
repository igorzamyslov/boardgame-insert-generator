// src/app/history.test.ts
import { describe, expect, it } from "vitest";
import type { Project } from "../model/types";
import { createHistory } from "./history";
import { fixtureProject } from "./test-helpers";

function named(name: string): Project {
  return { ...fixtureProject(), name };
}

describe("history", () => {
  it("starts empty with nothing to undo or redo", () => {
    const h = createHistory();
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("steps back and forward through pushed projects", () => {
    const h = createHistory();
    const [a, b, c] = [named("a"), named("b"), named("c")] as [Project, Project, Project];
    h.push(a);
    h.push(b);
    h.push(c);
    expect(h.undo()).toBe(b);
    expect(h.undo()).toBe(a);
    expect(h.undo()).toBeNull();
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(true);
    expect(h.redo()).toBe(b);
    expect(h.redo()).toBe(c);
    expect(h.redo()).toBeNull();
    expect(h.canRedo.value).toBe(false);
  });

  it("a push after an undo drops the redo steps", () => {
    const h = createHistory();
    const [a, b, c] = [named("a"), named("b"), named("c")] as [Project, Project, Project];
    h.push(a);
    h.push(b);
    h.undo();
    h.push(c);
    expect(h.canRedo.value).toBe(false);
    expect(h.undo()).toBe(a);
  });

  it("amend replaces the current entry and does nothing while empty", () => {
    const h = createHistory();
    const [a, b, b2] = [named("a"), named("b"), named("b2")] as [Project, Project, Project];
    h.amend(a);
    expect(h.canUndo.value).toBe(false);
    expect(h.undo()).toBeNull();
    h.push(a);
    h.push(b);
    h.amend(b2);
    expect(h.undo()).toBe(a);
    expect(h.redo()).toBe(b2);
  });

  it("ensureBase seeds only an empty history", () => {
    const h = createHistory();
    const [a, b] = [named("a"), named("b")] as [Project, Project];
    h.ensureBase(a);
    h.push(b);
    h.ensureBase(named("ignored"));
    expect(h.undo()).toBe(a);
  });

  it("keeps at most `limit` entries, dropping the oldest", () => {
    const h = createHistory(3);
    const list = ["a", "b", "c", "d", "e"].map(named);
    for (const p of list) {
      h.push(p);
    }
    expect(h.undo()).toBe(list[3]);
    expect(h.undo()).toBe(list[2]);
    expect(h.undo()).toBeNull();
  });

  it("clear forgets everything", () => {
    const h = createHistory();
    h.push(named("a"));
    h.push(named("b"));
    h.undo();
    h.clear();
    expect(h.canUndo.value).toBe(false);
    expect(h.canRedo.value).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("version changes on push, undo, redo and clear but not on amend", () => {
    const h = createHistory();
    const seen = [h.version.value];
    h.push(named("a"));
    seen.push(h.version.value);
    h.push(named("b"));
    seen.push(h.version.value);
    h.amend(named("b2"));
    expect(h.version.value).toBe(seen[2]);
    h.undo();
    seen.push(h.version.value);
    h.redo();
    seen.push(h.version.value);
    h.clear();
    seen.push(h.version.value);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("coalesces a push made within the window into the newest entry, never into the base", () => {
    let t = 0;
    const h = createHistory(100, () => t);
    const [a, b, c, d] = ["a", "b", "c", "d"].map(named) as [Project, Project, Project, Project];
    h.ensureBase(a);
    h.push(b, { coalesceMs: 1000 });
    t = 100;
    h.push(c, { coalesceMs: 1000 });
    t = 200;
    h.push(d, { coalesceMs: 1000 });
    expect(h.undo()).toBe(a);
    expect(h.canUndo.value).toBe(false);
    expect(h.redo()).toBe(d);
  });

  it("does not coalesce after the window, after an undo, or without the option", () => {
    let t = 0;
    const h = createHistory(100, () => t);
    const [a, b, c, d] = ["a", "b", "c", "d"].map(named) as [Project, Project, Project, Project];
    h.ensureBase(a);
    h.push(b, { coalesceMs: 1000 });
    t = 1500;
    h.push(c, { coalesceMs: 1000 });
    t = 1600;
    h.push(d);
    expect(h.undo()).toBe(c);
    expect(h.undo()).toBe(b);
    h.redo();
    t = 1700;
    h.push(named("e"), { coalesceMs: 1000 });
    expect(h.undo()).toBe(c);
  });

  it("amendBefore updates earlier entries until the callback declines", () => {
    const h = createHistory();
    const [a, b, c, d] = ["a", "b", "c", "d"].map(named) as [Project, Project, Project, Project];
    for (const p of [a, b, c, d]) {
      h.push(p);
    }
    h.amendBefore((e) => (e.name === "a" ? null : { ...e, name: `${e.name}!` }));
    expect(h.undo()?.name).toBe("c!");
    expect(h.undo()?.name).toBe("b!");
    expect(h.undo()?.name).toBe("a");
  });
});
