// src/app/analytics.test.ts
import { describe, expect, it, vi } from "vitest";
import { COUNT_EVENTS, createCounter } from "./analytics";
import type { CountEnv } from "./analytics";

function env(over: Partial<CountEnv> = {}): CountEnv & { send: ReturnType<typeof vi.fn> } {
  return {
    code: "mysite",
    hostname: "example.github.io",
    protocol: "https:",
    doNotTrack: false,
    globalPrivacyControl: false,
    referrer: "",
    screen: "1440,900,2",
    send: vi.fn(),
    ...over,
  } as CountEnv & { send: ReturnType<typeof vi.fn> };
}

describe("createCounter", () => {
  it("sends nothing without a site code", () => {
    for (const code of [undefined, "", "  ", "bad code", "a.b/c"]) {
      const e = env({ code });
      const c = createCounter(e);
      c.pageview();
      c.count("plan");
      expect(c.enabled).toBe(false);
      expect(e.send).not.toHaveBeenCalled();
    }
  });

  it("sends nothing for Do Not Track or Global Privacy Control", () => {
    for (const over of [{ doNotTrack: true }, { globalPrivacyControl: true }]) {
      const e = env(over);
      const c = createCounter(e);
      c.pageview();
      c.count("guide");
      expect(c.enabled).toBe(false);
      expect(e.send).not.toHaveBeenCalled();
    }
  });

  it("sends nothing on localhost or from a file", () => {
    for (const over of [
      { hostname: "localhost" },
      { hostname: "127.0.0.1" },
      { hostname: "[::1]" },
      { hostname: "app.localhost" },
      { protocol: "file:" },
    ]) {
      const e = env(over);
      createCounter(e).count("plan");
      expect(e.send).not.toHaveBeenCalled();
    }
  });

  it("sends an event as one request to the site's endpoint, with only its name", () => {
    const e = env();
    const c = createCounter(e);
    c.count("download-3mf");
    expect(e.send).toHaveBeenCalledTimes(1);
    const url = new URL(e.send.mock.calls[0]?.[0] as string);
    expect(url.origin + url.pathname).toBe("https://mysite.goatcounter.com/count");
    expect([...url.searchParams.keys()].sort()).toEqual(["e", "p", "t"]);
    expect(url.searchParams.get("p")).toBe("download-3mf");
    expect(url.searchParams.get("e")).toBe("true");
  });

  it("sends the visit with the path, the referrer and the screen only", () => {
    const e = env({ referrer: "https://example.org/post" });
    createCounter(e).pageview();
    expect(e.send).toHaveBeenCalledTimes(1);
    const url = new URL(e.send.mock.calls[0]?.[0] as string);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      p: "/",
      r: "https://example.org/post",
      s: "1440,900,2",
    });
  });

  it("names every event with a short fixed word", () => {
    for (const ev of COUNT_EVENTS) {
      expect(ev).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
