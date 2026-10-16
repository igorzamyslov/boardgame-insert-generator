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
});
