// src/feedback/feedback.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  FAILED_MESSAGE,
  ISSUES_URL,
  buildPayload,
  fallbackUrl,
  hasWorker,
  issueTitle,
  readConfig,
  sendFeedback,
} from "./feedback";
import type { FeedbackDraft } from "./feedback";

const draft: FeedbackDraft = {
  kind: "problem",
  message: "  The tray looks wrong\nsecond line  ",
  contact: " me@example.com ",
  includeProject: false,
};
const context = { appVersion: "0.30.0 (abc1234)", userAgent: "UA/1" };

describe("config", () => {
  it("uses the Worker only when both settings are present", () => {
    expect(hasWorker(readConfig({}))).toBe(false);
    expect(hasWorker(readConfig({ VITE_FEEDBACK_URL: "https://w.example/" }))).toBe(false);
    expect(hasWorker(readConfig({ VITE_TURNSTILE_SITEKEY: "0x4" }))).toBe(false);
    expect(
      hasWorker(
        readConfig({ VITE_FEEDBACK_URL: "https://w.example/", VITE_TURNSTILE_SITEKEY: "0x4" }),
      ),
    ).toBe(true);
  });
});

describe("request payload", () => {
  it("carries the words, kind, contact, version, browser and token", () => {
    const p = buildPayload(draft, context, "tok", () => "{}");
    expect(p).toEqual({
      message: "The tray looks wrong\nsecond line",
      kind: "problem",
      contact: "me@example.com",
      includeProject: false,
      appVersion: "0.30.0 (abc1234)",
      userAgent: "UA/1",
      turnstileToken: "tok",
    });
    expect("project" in p).toBe(false);
  });

  it("leaves the contact out when it is empty", () => {
    expect("contact" in buildPayload({ ...draft, contact: "  " }, context, "t", () => "{}")).toBe(
      false,
    );
  });

  it("reads the project only when it is ticked", () => {
    const getProject = vi.fn(() => '{"name":"Mine"}');
    buildPayload(draft, context, "t", getProject);
    expect(getProject).not.toHaveBeenCalled();
    const p = buildPayload({ ...draft, includeProject: true }, context, "t", getProject);
    expect(p.project).toBe('{"name":"Mine"}');
    expect(p.includeProject).toBe(true);
  });
});

describe("the GitHub page used without a Worker", () => {
  it("is the new-issue page with the form, the label, a title and the words", () => {
    const url = new URL(fallbackUrl(draft, context));
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUES_URL}/new`);
    expect(url.searchParams.get("template")).toBe("feedback.yml");
    expect(url.searchParams.get("labels")).toBe("feedback");
    expect(url.searchParams.get("title")).toBe("Feedback: The tray looks wrong");
    expect(url.searchParams.get("kind")).toBe("Problem");
    expect(url.searchParams.get("message")).toBe("The tray looks wrong\nsecond line");
    expect(url.searchParams.get("contact")).toBe("me@example.com");
    expect(url.searchParams.get("context")).toContain("0.30.0 (abc1234)");
    expect(url.searchParams.get("context")).toContain("UA/1");
  });

  it("cuts a long first line in the title", () => {
    const t = issueTitle("w".repeat(300));
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("sendFeedback", () => {
  const payload = buildPayload(draft, context, "tok", () => "{}");
  const json = (body: unknown, status = 200) => Response.json(body, { status });

  it("posts JSON and returns the issue", async () => {
    const f = vi.fn(async () =>
      json({ ok: true, issueUrl: "https://github.com/o/r/issues/3", number: 3 }, 201),
    );
    const r = await sendFeedback("https://w.example/", payload, f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, issueUrl: "https://github.com/o/r/issues/3", number: 3 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://w.example/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: "The tray looks wrong\nsecond line",
    });
  });

  it("says why when the Worker refuses, and keeps the words", async () => {
    const f = async () => json({ ok: false, message: "Too many messages from here." }, 429);
    const r = await sendFeedback("u", payload, f as unknown as typeof fetch);
    expect(r).toEqual({
      ok: false,
      message: "Too many messages from here. Your words are still here.",
    });
  });

  it("never throws: a network error or a page that is not JSON is the plain sentence", async () => {
    const down = async () => {
      throw new TypeError("offline");
    };
    expect(await sendFeedback("u", payload, down as unknown as typeof fetch)).toEqual({
      ok: false,
      message: FAILED_MESSAGE,
    });
    const html = async () => new Response("<html>", { status: 502 });
    expect(await sendFeedback("u", payload, html as unknown as typeof fetch)).toEqual({
      ok: false,
      message: FAILED_MESSAGE,
    });
  });
});
