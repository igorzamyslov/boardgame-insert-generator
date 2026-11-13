// worker/feedback/src/logic.test.ts
import { describe, expect, it } from "vitest";
import {
  KIND_LABELS,
  LIMITS,
  allowedOrigin,
  buildBody,
  buildIssue,
  buildTitle,
  corsHeaders,
  projectBlock,
  validate,
  type Feedback,
} from "./logic";

const ok = {
  message: "The tray names are great.",
  kind: "idea",
  appVersion: "0.30.0",
  userAgent: "Mozilla/5.0 Test",
  turnstileToken: "tok",
};

function value(over: Partial<Feedback> = {}): Feedback {
  return {
    message: "Hello",
    kind: "idea",
    contact: "",
    appVersion: "0.30.0",
    userAgent: "UA",
    turnstileToken: "t",
    project: null,
    ...over,
  };
}

describe("validate", () => {
  it("takes a plain message", () => {
    const r = validate(ok);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({
        message: ok.message,
        kind: "idea",
        project: null,
        contact: "",
      });
    }
  });

  it("refuses what is not an object, an empty message, a long one and an unknown kind", () => {
    expect(validate(null).ok).toBe(false);
    expect(validate([]).ok).toBe(false);
    expect(validate({ ...ok, message: "   " }).ok).toBe(false);
    expect(validate({ ...ok, message: "x".repeat(LIMITS.message + 1) }).ok).toBe(false);
    expect(validate({ ...ok, message: "x".repeat(LIMITS.message) }).ok).toBe(true);
    expect(validate({ ...ok, kind: "rant" }).ok).toBe(false);
    expect(validate({ ...ok, turnstileToken: "" }).ok).toBe(false);
  });

  it("keeps the project only when includeProject is true", () => {
    const withIt = validate({ ...ok, includeProject: true, project: '{"a":1}' });
    expect(withIt.ok && withIt.value.project).toBe('{"a":1}');
    const without = validate({ ...ok, includeProject: false, project: '{"a":1}' });
    expect(without.ok && without.value.project).toBeNull();
    expect(validate({ ...ok, includeProject: true }).ok).toBe(false);
    expect(
      validate({ ...ok, includeProject: true, project: "x".repeat(LIMITS.project + 1) }).ok,
    ).toBe(false);
  });

  it("trims and caps the small fields", () => {
    const r = validate({ ...ok, contact: `  ${"c".repeat(500)}  `, userAgent: "u".repeat(900) });
    expect(r.ok && r.value.contact.length).toBe(LIMITS.contact);
    expect(r.ok && r.value.userAgent.length).toBe(LIMITS.userAgent);
  });
});

describe("buildTitle", () => {
  it("is Feedback: and the first line", () => {
    expect(buildTitle("Nice app\nMore words")).toBe("Feedback: Nice app");
    expect(buildTitle("\n\n  Second  \n")).toBe("Feedback: Second");
  });
  it("cuts a long line to about 70 characters", () => {
    const t = buildTitle("w".repeat(200));
    expect(t.startsWith("Feedback: ")).toBe(true);
    expect(t.length).toBeLessThanOrEqual("Feedback: ".length + LIMITS.title);
    expect(t.endsWith("…")).toBe(true);
  });
  it("does not notify anybody", () => {
    expect(buildTitle("thanks @someone")).not.toContain("@someone");
    expect(buildBody(value({ message: "mail me@host.com" }))).toContain("me@host.com");
  });
});

describe("buildBody", () => {
  it("has the message, version, browser and contact", () => {
    const body = buildBody(value({ contact: "me@example.com" }));
    expect(body).toContain("Hello");
    expect(body).toContain("**App version:** 0.30.0");
    expect(body).toContain("**Browser:** UA");
    expect(body).toContain("**How to reach them:** me@example.com");
  });
  it("leaves the contact line out when there is none", () => {
    expect(buildBody(value())).not.toContain("How to reach");
  });
  it("puts the project in a collapsed block", () => {
    const body = buildBody(value({ project: '{"name":"x"}' }));
    expect(body).toContain("<details>");
    expect(body).toContain('{"name":"x"}');
  });
  it("uses a longer fence than any backticks inside the project", () => {
    const block = projectBlock("a ``` b", 10_000);
    expect(block).toContain("````json");
  });
  it("cuts a big project with a note and stays under the limit", () => {
    const big = "x".repeat(200_000);
    const body = buildBody(value({ project: big, message: "m".repeat(5000) }));
    expect(body.length).toBeLessThanOrEqual(LIMITS.body);
    expect(body).toContain("Cut here");
    expect(body).toContain("of 200,000 characters");
  });
  it("says so when no room is left for the project", () => {
    const body = buildBody(value({ project: "x".repeat(5000), message: "m".repeat(5000) }));
    expect(body.length).toBeLessThanOrEqual(LIMITS.body);
    const tight = projectBlock("x".repeat(5000), 100);
    expect(tight).toBe("");
  });
});

describe("buildIssue", () => {
  it("labels by kind, always with feedback", () => {
    expect(buildIssue(value({ kind: "idea" })).labels).toEqual(["feedback", "enhancement"]);
    expect(buildIssue(value({ kind: "problem" })).labels).toEqual(["feedback", "bug"]);
    expect(buildIssue(value({ kind: "other" })).labels).toEqual(["feedback"]);
    for (const labels of Object.values(KIND_LABELS)) {
      expect(labels[0]).toBe("feedback");
    }
  });
});

describe("CORS", () => {
  const pages = "https://igorzamyslov.github.io";
  it("lets the Pages origin and local dev origins in", () => {
    expect(allowedOrigin(pages, pages)).toBe(pages);
    expect(allowedOrigin(pages, `${pages}/`)).toBe(pages);
    expect(allowedOrigin("http://localhost:5173", pages)).toBe("http://localhost:5173");
    expect(allowedOrigin("http://127.0.0.1:4173", pages)).toBe("http://127.0.0.1:4173");
  });
  it("keeps everyone else out", () => {
    expect(allowedOrigin("https://evil.example", pages)).toBeNull();
    expect(allowedOrigin("https://localhost.evil.example", pages)).toBeNull();
    expect(allowedOrigin("http://localhost.evil.example:5173", pages)).toBeNull();
    expect(allowedOrigin(null, pages)).toBeNull();
    expect(allowedOrigin("", pages)).toBeNull();
  });
  it("answers with the one origin, never *", () => {
    const h = corsHeaders(pages);
    expect(h["access-control-allow-origin"]).toBe(pages);
    expect(h.vary).toBe("Origin");
  });
});
