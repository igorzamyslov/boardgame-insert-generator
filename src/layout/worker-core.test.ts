import { describe, expect, it, vi } from "vitest";
import { optimize } from "./optimize";
import { boxReq, makeInput } from "./test-utils";
import type { LayoutRequest, LayoutResponse } from "./types";
import { createWorkerHandler } from "./worker-core";

const input = makeInput([
  boxReq("a", 120, 80, 20),
  boxReq("b", 90, 80, 20),
  boxReq("c", 60, 40, 15),
]);
const run = (runId: number, iterations = 2500): LayoutRequest => ({
  type: "run",
  runId,
  input,
  seed: 4,
  iterations,
});

describe("layout worker handler", () => {
  it("posts progress per chunk, then the same result optimize() returns", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    await handle(run(1));
    expect(posts.map((p) => p.type)).toEqual(["progress", "progress", "done"]);
    expect(posts[0]).toMatchObject({ runId: 1, done: 1000, total: 2500 });
    const last = posts[2];
    expect(last?.type === "done" && last.result).toEqual(optimize(input, 4, 2500));
  });

  it("yields between chunks on a MessageChannel tick, not on a clamped setTimeout", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout");
    try {
      const posts: LayoutResponse[] = [];
      await createWorkerHandler((m) => posts.push(m))(run(6));
      expect(posts.map((p) => p.type)).toEqual(["progress", "progress", "done"]);
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
    }
  });

  it("stops a run when cancelled between chunks", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    const p = handle(run(2, 5000));
    await handle({ type: "cancel", runId: 2 });
    await p;
    expect(posts.map((m) => m.type)).toEqual(["progress"]);
  });

  it("lets a newer run supersede an older one", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    const first = handle(run(3, 5000));
    const second = handle(run(4, 1000));
    await Promise.all([first, second]);
    expect(posts.filter((m) => m.type === "done").map((m) => m.runId)).toEqual([4]);
  });

  it("reports errors as messages", async () => {
    const posts: LayoutResponse[] = [];
    const handle = createWorkerHandler(
      (m) => posts.push(m),
      () => Promise.resolve(),
    );
    const broken = { ...run(5), input: { ...input, box: null } } as unknown as LayoutRequest;
    await handle(broken);
    expect(posts[0]?.type).toBe("error");
  });
});
