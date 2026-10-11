import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILD_TIMEOUT_MS, GeometryBuildError, createGeometryClient } from "./client";
import type { GeometryRequest, GeometryResponse } from "./types";
import { GEO, plainBox } from "./test-specs";

class FakeWorker {
  static instances: FakeWorker[] = [];
  static constructorError: Error | null = null;
  readonly url: string;
  readonly options: WorkerOptions | undefined;
  readonly sent: GeometryRequest[] = [];
  postError: Error | null = null;
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(url: URL | string, options?: WorkerOptions) {
    if (FakeWorker.constructorError !== null) {
      throw FakeWorker.constructorError;
    }
    this.url = String(url);
    this.options = options;
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: GeometryRequest): void {
    if (this.postError !== null) {
      throw this.postError;
    }
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(data: GeometryResponse): void {
    for (const l of this.listeners.get("message") ?? []) {
      l({ data });
    }
  }

  crash(message: string, where: { filename?: string; lineno?: number; colno?: number } = {}) {
    const event = { message, ...where, preventDefault: vi.fn() };
    for (const l of this.listeners.get("error") ?? []) {
      l(event);
    }
    return event;
  }

  messageError(): void {
    for (const l of this.listeners.get("messageerror") ?? []) {
      l({});
    }
  }
}

const mesh = { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) };

// Starts a build whose outcome the test does not check.
function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

function reasonOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected the build to reject");
    },
    (error: unknown) => error,
  );
}

function worker(index: number): FakeWorker {
  const found = FakeWorker.instances[index];
  if (found === undefined) {
    throw new Error(`no worker ${index}`);
  }
  return found;
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.constructorError = null;
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createGeometryClient", () => {
  it("starts the module worker lazily on the first build", () => {
    const client = createGeometryClient();
    expect(FakeWorker.instances).toHaveLength(0);
    fireAndForget(client.build(plainBox, GEO));
    expect(FakeWorker.instances).toHaveLength(1);
    expect(worker(0).options).toEqual({ type: "module" });
    expect(worker(0).url).toMatch(/worker\.ts/);
    expect(worker(0).sent).toEqual([
      { type: "build", requestId: 1, spec: plainBox, settings: GEO },
    ]);
    client.dispose();
  });

  it("resolves builds by request id, in any order", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    const b = client.build({ ...plainBox, key: "b" }, GEO);
    worker(0).respond({ type: "built", requestId: 2, key: "b", mesh, volumeMm3: 2 });
    worker(0).respond({ type: "built", requestId: 1, key: plainBox.key, mesh, volumeMm3: 1 });
    await expect(a).resolves.toEqual({ mesh, volumeMm3: 1 });
    await expect(b).resolves.toEqual({ mesh, volumeMm3: 2 });
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("ignores answers for unknown or already answered requests", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    worker(0).respond({ type: "built", requestId: 42, key: "x", mesh, volumeMm3: 9 });
    worker(0).respond({ type: "error", requestId: 43, key: "x", message: "stray" });
    worker(0).respond({ type: "built", requestId: 1, key: plainBox.key, mesh, volumeMm3: 1 });
    worker(0).respond({ type: "built", requestId: 1, key: plainBox.key, mesh, volumeMm3: 2 });
    await expect(a).resolves.toEqual({ mesh, volumeMm3: 1 });
    expect(worker(0).terminated).toBe(false);
    client.dispose();
  });

  describe("errors", () => {
    it("rejects with the worker's error message", async () => {
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      worker(0).respond({ type: "error", requestId: 1, key: plainBox.key, message: "boom" });
      await expect(a).rejects.toThrow("boom");
    });

    it("rejects with a GeometryBuildError carrying the reason and the feature", async () => {
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      const b = client.build(plainBox, GEO);
      worker(0).respond({
        type: "error",
        requestId: 1,
        key: plainBox.key,
        message: "no magnets yet",
        name: "UnsupportedFeatureError",
        feature: "magnet",
      });
      worker(0).respond({ type: "error", requestId: 2, key: plainBox.key, message: "plain" });
      const first = await reasonOf(a);
      expect(first).toBeInstanceOf(GeometryBuildError);
      expect(first).toMatchObject({
        name: "UnsupportedFeatureError",
        message: "no magnets yet",
        feature: "magnet",
      });
      const second = await reasonOf(b);
      expect(second).toBeInstanceOf(GeometryBuildError);
      expect(second).toMatchObject({ name: "Error", message: "plain", feature: undefined });
      client.dispose();
    });

    it.each(["RangeError", "UnsupportedFeatureError", "AbortError"])(
      "keeps the worker after a %s, which only says something about that spec",
      async (name) => {
        const client = createGeometryClient();
        const a = client.build(plainBox, GEO);
        const b = client.build(plainBox, GEO);
        worker(0).respond({ type: "error", requestId: 1, key: "k", message: "m", name });
        await reasonOf(a);
        worker(0).respond({ type: "built", requestId: 2, key: "k", mesh, volumeMm3: 2 });
        await expect(b).resolves.toEqual({ mesh, volumeMm3: 2 });
        expect(worker(0).terminated).toBe(false);
        fireAndForget(client.build(plainBox, GEO));
        expect(FakeWorker.instances).toHaveLength(1);
        client.dispose();
      },
    );

    it.each([["Error"], [undefined]])(
      "restarts the worker after a kernel failure (name %s)",
      async (name) => {
        const client = createGeometryClient();
        const a = client.build(plainBox, GEO);
        const queued = client.build(plainBox, GEO);
        worker(0).respond({
          type: "error",
          requestId: 1,
          key: plainBox.key,
          message: "WASM error 12345",
          ...(name === undefined ? {} : { name }),
        });
        await expect(a).rejects.toThrow("WASM error 12345");
        // The build queued behind it is rejected too, as the worker is gone.
        expect(await reasonOf(queued)).toMatchObject({ name: "WorkerRestartedError" });
        expect(worker(0).terminated).toBe(true);
        const retry = client.build(plainBox, GEO);
        expect(FakeWorker.instances).toHaveLength(2);
        worker(1).respond({ type: "built", requestId: 3, key: "k", mesh, volumeMm3: 3 });
        await expect(retry).resolves.toEqual({ mesh, volumeMm3: 3 });
        client.dispose();
      },
    );
  });

  describe("worker failures", () => {
    it("rejects pending builds when the worker crashes and retries with a new worker", async () => {
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      worker(0).crash("wasm failed");
      await expect(a).rejects.toThrow(/wasm failed/);
      expect(worker(0).terminated).toBe(true);
      fireAndForget(client.build(plainBox, GEO));
      expect(FakeWorker.instances).toHaveLength(2);
      client.dispose();
    });

    it("rejects every pending build on a crash and marks the event handled", async () => {
      const client = createGeometryClient();
      const builds = [1, 2, 3].map(() => client.build(plainBox, GEO));
      const event = worker(0).crash("out of memory");
      expect(event.preventDefault).toHaveBeenCalled();
      for (const build of builds) {
        const error = await reasonOf(build);
        expect(error).toBeInstanceOf(GeometryBuildError);
        expect(error).toMatchObject({ message: expect.stringMatching(/out of memory/) });
      }
      client.dispose();
    });

    it("names the script position and keeps the event as the cause", async () => {
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      const event = worker(0).crash("wasm failed", {
        filename: "http://x/assets/worker.js",
        lineno: 3,
        colno: 9,
      });
      const error = await reasonOf(a);
      expect(error).toMatchObject({
        message: "Geometry worker failed: wasm failed (http://x/assets/worker.js:3:9)",
        cause: event,
      });
    });

    it("says so when the worker gives no reason for failing", async () => {
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      worker(0).crash("");
      await expect(a).rejects.toThrow("Geometry worker failed: unknown error");
    });

    it("treats a message that cannot be deserialised as a crash", async () => {
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      worker(0).messageError();
      await expect(a).rejects.toThrow(/could not be deserialised/);
      expect(worker(0).terminated).toBe(true);
      fireAndForget(client.build(plainBox, GEO));
      expect(FakeWorker.instances).toHaveLength(2);
      client.dispose();
    });

    it("resolves a build made after a crash from the new worker", async () => {
      const client = createGeometryClient();
      fireAndForget(client.build(plainBox, GEO));
      worker(0).crash("gone");
      const retry = client.build(plainBox, GEO);
      worker(1).respond({ type: "built", requestId: 2, key: "k", mesh, volumeMm3: 5 });
      await expect(retry).resolves.toEqual({ mesh, volumeMm3: 5 });
      client.dispose();
    });

    it("ignores messages and errors from a worker it has already replaced", async () => {
      const client = createGeometryClient();
      fireAndForget(client.build(plainBox, GEO));
      worker(0).crash("gone");
      const retry = client.build(plainBox, GEO); // request 2, on the new worker
      worker(0).respond({ type: "built", requestId: 2, key: "k", mesh, volumeMm3: 666 });
      worker(0).crash("a second, late error");
      worker(0).messageError();
      expect(worker(1).terminated).toBe(false);
      worker(1).respond({ type: "built", requestId: 2, key: "k", mesh, volumeMm3: 2 });
      await expect(retry).resolves.toEqual({ mesh, volumeMm3: 2 });
      client.dispose();
    });

    it("does not leave a pending build behind when the worker cannot be created", async () => {
      vi.useFakeTimers();
      const client = createGeometryClient();
      FakeWorker.constructorError = new Error("workers are blocked");
      await expect(client.build(plainBox, GEO)).rejects.toThrow("workers are blocked");
      expect(vi.getTimerCount()).toBe(0);
      FakeWorker.constructorError = null;
      const retry = client.build(plainBox, GEO);
      worker(0).respond({ type: "built", requestId: 2, key: "k", mesh, volumeMm3: 2 });
      await expect(retry).resolves.toEqual({ mesh, volumeMm3: 2 });
      client.dispose();
    });

    it("does not leave a pending build behind when the request cannot be posted", async () => {
      vi.useFakeTimers();
      const client = createGeometryClient();
      fireAndForget(client.build(plainBox, GEO));
      worker(0).postError = new Error("DataCloneError");
      await expect(client.build(plainBox, GEO)).rejects.toThrow("DataCloneError");
      expect(vi.getTimerCount()).toBe(1); // only the first build's timeout
      client.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("timeout", () => {
    it("rejects a build that gets no answer in BUILD_TIMEOUT_MS and restarts the worker", async () => {
      vi.useFakeTimers();
      const client = createGeometryClient();
      const stuck = client.build(plainBox, GEO);
      const queued = client.build(plainBox, GEO);
      vi.advanceTimersByTime(BUILD_TIMEOUT_MS - 1);
      expect(worker(0).terminated).toBe(false);
      vi.advanceTimersByTime(1);
      const error = await reasonOf(stuck);
      expect(error).toBeInstanceOf(GeometryBuildError);
      expect(error).toMatchObject({ name: "TimeoutError" });
      expect(await reasonOf(queued)).toMatchObject({ name: "WorkerRestartedError" });
      expect(worker(0).terminated).toBe(true);
      const retry = client.build(plainBox, GEO);
      expect(FakeWorker.instances).toHaveLength(2);
      worker(1).respond({ type: "built", requestId: 3, key: "k", mesh, volumeMm3: 3 });
      await expect(retry).resolves.toEqual({ mesh, volumeMm3: 3 });
      client.dispose();
    });

    it("stops the timer once a build is answered", async () => {
      vi.useFakeTimers();
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      expect(vi.getTimerCount()).toBe(1);
      worker(0).respond({ type: "built", requestId: 1, key: "k", mesh, volumeMm3: 1 });
      await a;
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(BUILD_TIMEOUT_MS * 2);
      expect(worker(0).terminated).toBe(false);
      client.dispose();
    });
  });

  describe("abort", () => {
    it("sends a cancel, rejects with an AbortError and ignores the worker's late answer", async () => {
      vi.useFakeTimers();
      const client = createGeometryClient();
      const controller = new AbortController();
      const a = client.build(plainBox, GEO, controller.signal);
      const other = client.build(plainBox, GEO);
      controller.abort();
      const error = await reasonOf(a);
      expect(error).toBeInstanceOf(GeometryBuildError);
      expect(error).toMatchObject({ name: "AbortError", message: "cancelled" });
      expect(worker(0).sent.at(-1)).toEqual({ type: "cancel", requestId: 1 });
      expect(vi.getTimerCount()).toBe(1); // the other build's timeout
      worker(0).respond({
        type: "error",
        requestId: 1,
        key: "k",
        message: "cancelled",
        name: "AbortError",
      });
      worker(0).respond({ type: "built", requestId: 2, key: "k", mesh, volumeMm3: 2 });
      await expect(other).resolves.toEqual({ mesh, volumeMm3: 2 });
      expect(worker(0).terminated).toBe(false);
      client.dispose();
    });

    it("rejects at once, without starting a worker, when the signal is already aborted", async () => {
      const client = createGeometryClient();
      const error = await reasonOf(client.build(plainBox, GEO, AbortSignal.abort()));
      expect(error).toMatchObject({ name: "AbortError" });
      expect(FakeWorker.instances).toHaveLength(0);
    });

    it("does not cancel a build that has already been answered", async () => {
      const client = createGeometryClient();
      const controller = new AbortController();
      const a = client.build(plainBox, GEO, controller.signal);
      worker(0).respond({ type: "built", requestId: 1, key: "k", mesh, volumeMm3: 1 });
      await a;
      controller.abort();
      expect(worker(0).sent).toHaveLength(1);
      client.dispose();
    });
  });

  describe("dispose", () => {
    it("terminates the worker and rejects pending builds", async () => {
      const client = createGeometryClient();
      const a = client.build(plainBox, GEO);
      client.dispose();
      await expect(a).rejects.toThrow(/disposed/);
      expect(worker(0).terminated).toBe(true);
    });

    it("is terminal: a later build rejects without starting a worker", async () => {
      const client = createGeometryClient();
      client.dispose();
      await expect(client.build(plainBox, GEO)).rejects.toThrow("Geometry client disposed");
      expect(FakeWorker.instances).toHaveLength(0);
    });

    it("is idempotent", () => {
      const client = createGeometryClient();
      fireAndForget(client.build(plainBox, GEO));
      client.dispose();
      expect(() => client.dispose()).not.toThrow();
      expect(FakeWorker.instances).toHaveLength(1);
    });
  });
});
