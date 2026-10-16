import { describe, expect, it } from "vitest";
import { createLayoutClientWith, LayoutCancelledError, type WorkerLike } from "./client";
import { makeInput } from "./test-utils";
import type { LayoutRequest, LayoutResponse, LayoutResult } from "./types";

class FakeWorker implements WorkerLike {
  sent: LayoutRequest[] = [];
  terminated = false;
  onmessage: ((e: MessageEvent<LayoutResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(msg: LayoutRequest): void {
    this.sent.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(msg: LayoutResponse): void {
    this.onmessage?.({ data: msg } as MessageEvent<LayoutResponse>);
  }
  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const result: LayoutResult = {
  layout: null,
  bestAttempt: null,
  summary: null,
  notices: [],
  lockConflicts: [],
};
const input = makeInput([]);

function setup() {
  const workers: FakeWorker[] = [];
  const client = createLayoutClientWith(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { client, workers };
}

describe("layout client", () => {
  it("runs on one lazily created worker and forwards progress", async () => {
    const { client, workers } = setup();
    const progress: number[] = [];
    const p = client.run(input, 7, 2000, undefined, (done) => progress.push(done));
    const w = workers[0];
    expect(workers).toHaveLength(1);
    expect(w?.sent[0]).toEqual({
      type: "run",
      runId: 1,
      input,
      seed: 7,
      iterations: 2000,
      warmStart: undefined,
    });
    w?.emit({ type: "progress", runId: 1, done: 1000, total: 2000, best: result });
    w?.emit({ type: "done", runId: 1, result });
    await expect(p).resolves.toBe(result);
    expect(progress).toEqual([1000]);
  });

  it("cancels: rejects with LayoutCancelledError, tells the worker, ignores late messages", async () => {
    const { client, workers } = setup();
    const p = client.run(input, 1, 1000, undefined, () => undefined);
    client.cancel();
    await expect(p).rejects.toBeInstanceOf(LayoutCancelledError);
    expect(workers[0]?.sent[1]).toEqual({ type: "cancel", runId: 1 });
    // A late message of the cancelled run is dropped, also while the next run is pending.
    const late: LayoutResult = {
      ...result,
      notices: [{ level: "info", code: "x", message: "late" }],
    };
    workers[0]?.emit({ type: "done", runId: 1, result: late });
    const next = client.run(input, 2, 1000, undefined, () => undefined);
    workers[0]?.emit({ type: "done", runId: 1, result: late });
    workers[0]?.emit({ type: "done", runId: 2, result });
    await expect(next).resolves.toBe(result);
  });

  it("a new run supersedes the previous one on the same worker", async () => {
    const { client, workers } = setup();
    const first = client.run(input, 1, 1000, undefined, () => undefined);
    const second = client.run(input, 2, 1000, undefined, () => undefined);
    await expect(first).rejects.toBeInstanceOf(LayoutCancelledError);
    workers[0]?.emit({ type: "done", runId: 2, result });
    await expect(second).resolves.toBe(result);
    expect(workers).toHaveLength(1);
  });

  it("rejects on worker errors and starts a fresh worker afterwards", async () => {
    const { client, workers } = setup();
    const a = client.run(input, 1, 1000, undefined, () => undefined);
    workers[0]?.emit({ type: "error", runId: 1, message: "boom" });
    await expect(a).rejects.toThrow("boom");
    const b = client.run(input, 1, 1000, undefined, () => undefined);
    workers[0]?.crash("wasm died");
    await expect(b).rejects.toThrow("wasm died");
    expect(workers[0]?.terminated).toBe(true);
    void client.run(input, 1, 1000, undefined, () => undefined).catch(() => undefined);
    expect(workers).toHaveLength(2);
    client.dispose();
    expect(workers[1]?.terminated).toBe(true);
  });
});
