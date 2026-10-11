import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeometryBuildError, createGeometryClient } from "./client";
import type { GeometryRequest, GeometryResponse } from "./types";
import { GEO, plainBox } from "./test-specs";

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly url: string;
  readonly options: WorkerOptions | undefined;
  readonly sent: GeometryRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(url: URL | string, options?: WorkerOptions) {
    this.url = String(url);
    this.options = options;
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: GeometryRequest): void {
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

  crash(message: string): void {
    for (const l of this.listeners.get("error") ?? []) {
      l({ message, preventDefault: () => undefined });
    }
  }
}

const mesh = { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) };

// Starts a build whose outcome the test does not check.
function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createGeometryClient", () => {
  it("starts the module worker lazily on the first build", () => {
    const client = createGeometryClient();
    expect(FakeWorker.instances).toHaveLength(0);
    fireAndForget(client.build(plainBox, GEO));
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    expect(worker?.options).toEqual({ type: "module" });
    expect(worker?.url).toMatch(/worker\.ts/);
    expect(worker?.sent).toEqual([{ type: "build", requestId: 1, spec: plainBox, settings: GEO }]);
    client.dispose();
  });

  it("resolves builds by request id, in any order", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    const b = client.build({ ...plainBox, key: "b" }, GEO);
    const worker = FakeWorker.instances[0];
    worker?.respond({ type: "built", requestId: 2, key: "b", mesh, volumeMm3: 2 });
    worker?.respond({ type: "built", requestId: 1, key: plainBox.key, mesh, volumeMm3: 1 });
    await expect(a).resolves.toEqual({ mesh, volumeMm3: 1 });
    await expect(b).resolves.toEqual({ mesh, volumeMm3: 2 });
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("rejects with the worker's error message", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    FakeWorker.instances[0]?.respond({
      type: "error",
      requestId: 1,
      key: plainBox.key,
      message: "boom",
    });
    await expect(a).rejects.toThrow("boom");
  });

  it("rejects with a GeometryBuildError carrying the reason and the feature", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    const b = client.build(plainBox, GEO);
    const worker = FakeWorker.instances[0];
    worker?.respond({
      type: "error",
      requestId: 1,
      key: plainBox.key,
      message: "no magnets yet",
      name: "UnsupportedFeatureError",
      feature: "magnet",
    });
    worker?.respond({ type: "error", requestId: 2, key: plainBox.key, message: "plain" });
    const first: unknown = await a.catch((e: unknown) => e);
    expect(first).toBeInstanceOf(GeometryBuildError);
    expect(first).toMatchObject({
      name: "UnsupportedFeatureError",
      message: "no magnets yet",
      feature: "magnet",
    });
    const second: unknown = await b.catch((e: unknown) => e);
    expect(second).toBeInstanceOf(GeometryBuildError);
    expect(second).toMatchObject({ name: "Error", message: "plain", feature: undefined });
    client.dispose();
  });

  it("rejects pending builds when the worker crashes and retries with a new worker", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    FakeWorker.instances[0]?.crash("wasm failed");
    await expect(a).rejects.toThrow(/wasm failed/);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    fireAndForget(client.build(plainBox, GEO));
    expect(FakeWorker.instances).toHaveLength(2);
    client.dispose();
  });

  it("dispose terminates the worker and rejects pending builds", async () => {
    const client = createGeometryClient();
    const a = client.build(plainBox, GEO);
    client.dispose();
    await expect(a).rejects.toThrow(/disposed/);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });
});
