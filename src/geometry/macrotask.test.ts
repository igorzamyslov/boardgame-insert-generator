// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextMacrotask } from "./macrotask";

afterEach(() => {
  vi.useRealTimers();
});

describe("nextMacrotask", () => {
  it("resolves after microtasks and after messages that were already queued", async () => {
    const order: string[] = [];
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      order.push("earlier message");
      channel.port1.close();
    };
    channel.port2.postMessage(null);
    queueMicrotask(() => order.push("microtask"));
    await nextMacrotask();
    order.push("tick");
    expect(order).toEqual(["microtask", "earlier message", "tick"]);
  });

  it("closes its channel, so it keeps nothing alive", async () => {
    const close = vi.fn();
    class FakeChannel {
      port1: { onmessage: (() => void) | null; close: () => void } = { onmessage: null, close };
      port2 = { postMessage: () => this.port1.onmessage?.() };
    }
    await nextMacrotask(FakeChannel as unknown as typeof MessageChannel);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("falls back to setTimeout(0) without MessageChannel", async () => {
    vi.useFakeTimers();
    let done = false;
    const tick = nextMacrotask(undefined).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    vi.advanceTimersByTime(0);
    await tick;
    expect(done).toBe(true);
  });
});
