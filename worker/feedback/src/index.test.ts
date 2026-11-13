// worker/feedback/src/index.test.ts
import { describe, expect, it, vi } from "vitest";
import { handle, type Env } from "./index";

const ORIGIN = "https://igorzamyslov.github.io";
const env = (over: Partial<Env> = {}): Env => ({
  GITHUB_TOKEN: "ghp_secret",
  TURNSTILE_SECRET: "ts_secret",
  GITHUB_REPO: "owner/repo",
  ALLOWED_ORIGINS: ORIGIN,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
  ...over,
});
const payload = {
  message: "Hello there",
  kind: "problem",
  appVersion: "0.30.0",
  userAgent: "UA",
  turnstileToken: "tok",
};
const post = (body: unknown, origin: string | null = ORIGIN): Request =>
  new Request("https://w.example/", {
    method: "POST",
    headers: {
      ...(origin === null ? {} : { origin }),
      "content-type": "application/json",
      "cf-connecting-ip": "1.2.3.4",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** A fetch that answers Turnstile and GitHub like the real ones. */
function network(
  turnstile = true,
  github: Response = Response.json(
    { html_url: "https://github.com/o/r/issues/7", number: 7 },
    { status: 201 },
  ),
) {
  return vi.fn(async (url: RequestInfo | URL, ...rest: [RequestInit?]) => {
    if (String(url).includes("turnstile")) {
      return Response.json({ success: turnstile });
    }
    void rest;
    return github.clone();
  });
}

describe("the feedback Worker", () => {
  it("opens an issue and returns its address", async () => {
    const f = network();
    const res = await handle(post(payload), env(), f as unknown as typeof fetch);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      issueUrl: "https://github.com/o/r/issues/7",
      number: 7,
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const gh = f.mock.calls.find(([u]) => String(u).includes("api.github.com"));
    expect(String(gh?.[0])).toBe("https://api.github.com/repos/owner/repo/issues");
    const init = gh?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghp_secret");
    const sent = JSON.parse(String(init.body)) as { title: string; labels: string[] };
    expect(sent.title).toBe("Feedback: Hello there");
    expect(sent.labels).toEqual(["feedback", "bug"]);
  });

  it("checks the Turnstile token with the secret and the address", async () => {
    const f = network();
    await handle(post(payload), env(), f as unknown as typeof fetch);
    const call = f.mock.calls.find(([u]) => String(u).includes("turnstile"));
    const form = (call?.[1] as RequestInit).body as URLSearchParams;
    expect(form.get("secret")).toBe("ts_secret");
    expect(form.get("response")).toBe("tok");
    expect(form.get("remoteip")).toBe("1.2.3.4");
  });

  it("refuses a failed Turnstile check and creates nothing", async () => {
    const f = network(false);
    const res = await handle(post(payload), env(), f as unknown as typeof fetch);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("captcha");
    expect(f.mock.calls.some(([u]) => String(u).includes("github"))).toBe(false);
  });

  it("rate limits before calling anybody", async () => {
    const f = network();
    const limited = env({ RATE_LIMITER: { limit: async () => ({ success: false }) } });
    const res = await handle(post(payload), limited, f as unknown as typeof fetch);
    expect(res.status).toBe(429);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses bad input", async () => {
    const f = network();
    expect((await handle(post("not json"), env(), f as unknown as typeof fetch)).status).toBe(400);
    expect(
      (await handle(post({ ...payload, message: "" }), env(), f as unknown as typeof fetch)).status,
    ).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses another origin and answers the preflight only for allowed ones", async () => {
    const f = network();
    const bad = await handle(
      post(payload, "https://evil.example"),
      env(),
      f as unknown as typeof fetch,
    );
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const pre = (origin: string) =>
      handle(new Request("https://w.example/", { method: "OPTIONS", headers: { origin } }), env());
    expect((await pre(ORIGIN)).status).toBe(204);
    expect((await pre("http://localhost:5173")).status).toBe(204);
    expect((await pre("https://evil.example")).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("answers GitHub's trouble plainly and never shows the token", async () => {
    const f = network(
      true,
      new Response('{"message":"Bad credentials ghp_secret"}', { status: 401 }),
    );
    const res = await handle(post(payload), env(), f as unknown as typeof fetch);
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain("ghp_secret");
    expect(text).not.toContain("Bad credentials");
  });

  it("refuses a request that is far too big", async () => {
    const f = network();
    const res = await handle(
      post({ ...payload, message: "x".repeat(1_300_000) }),
      env(),
      f as unknown as typeof fetch,
    );
    expect(res.status).toBe(413);
  });
});
