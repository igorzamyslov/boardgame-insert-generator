// worker/feedback/src/logic.ts
// The pure parts of the feedback Worker: checking what the app sent, building the GitHub issue
// and deciding who may call it. No network, no Cloudflare types, so vitest runs it in Node.

export const KINDS = ["idea", "problem", "other"] as const;
export type Kind = (typeof KINDS)[number];

export const LIMITS = {
  /** Characters of the person's own words. */
  message: 5000,
  contact: 200,
  version: 40,
  userAgent: 300,
  token: 2048,
  /** The project file the app attaches, as text: more than the app's own 1 MB file cap is refused. */
  project: 1_000_000,
  /** GitHub's limit on an issue body is 65,536 characters; stay clear of it. */
  body: 64_000,
  title: 70,
} as const;

/** The labels an issue gets: always `feedback`, and one that says what kind. */
export const KIND_LABELS: Record<Kind, readonly string[]> = {
  idea: ["feedback", "enhancement"],
  problem: ["feedback", "bug"],
  other: ["feedback"],
};

export interface Feedback {
  message: string;
  kind: Kind;
  contact: string;
  appVersion: string;
  userAgent: string;
  turnstileToken: string;
  /** The project file's text, when the person chose to attach it. */
  project: string | null;
}

export type Checked = { ok: true; value: Feedback } | { ok: false; error: string };

function text(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Checks the JSON the app posts. Messages are plain: the app may show them. */
export function validate(body: unknown): Checked {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "That doesn't look like feedback." };
  }
  const b = body as Record<string, unknown>;
  const message = text(b.message)?.trim();
  if (message === undefined || message === "") {
    return { ok: false, error: "Write a message first." };
  }
  if (message.length > LIMITS.message) {
    return {
      ok: false,
      error: `The message is over ${LIMITS.message.toLocaleString("en-US")} characters.`,
    };
  }
  const kind = b.kind;
  if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "Choose what kind of feedback this is." };
  }
  const token = text(b.turnstileToken);
  if (token === null || token === "" || token.length > LIMITS.token) {
    return { ok: false, error: "The check that you are a person is missing." };
  }
  const contact = (text(b.contact) ?? "").trim().slice(0, LIMITS.contact);
  const wantsProject = b.includeProject === true;
  let project: string | null = null;
  if (wantsProject) {
    const p = text(b.project);
    if (p === null || p === "") {
      return { ok: false, error: "The insert design to attach is missing." };
    }
    if (p.length > LIMITS.project) {
      return { ok: false, error: "The insert design is too big to attach." };
    }
    project = p;
  }
  return {
    ok: true,
    value: {
      message,
      kind: kind as Kind,
      contact,
      appVersion: (text(b.appVersion) ?? "").trim().slice(0, LIMITS.version),
      userAgent: (text(b.userAgent) ?? "").trim().slice(0, LIMITS.userAgent),
      turnstileToken: token,
      project,
    },
  };
}

/** Stops a pasted `@name` from notifying a stranger on GitHub. An address like me@host.com stays whole. */
export function defang(s: string): string {
  return s.replace(/(?<![A-Za-z0-9._%+-])@(?=[A-Za-z0-9])/g, "@\u200b");
}

/** "Feedback: " and the first line of the message, cut to about 70 characters. */
export function buildTitle(message: string): string {
  const first = message.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const line = defang(first.replace(/\s+/g, " ").trim());
  const cut = line.length > LIMITS.title ? `${line.slice(0, LIMITS.title - 1).trimEnd()}…` : line;
  return `Feedback: ${cut}`;
}

/** A code fence longer than any run of backticks inside `s`. */
function fenceFor(s: string): string {
  let longest = 2;
  for (const m of s.matchAll(/`+/g)) {
    longest = Math.max(longest, m[0].length);
  }
  return "`".repeat(longest + 1);
}

/** The attached project in a collapsed block, cut with a note when it would not fit in `room`. */
export function projectBlock(project: string, room: number): string {
  const head = "<details>\n<summary>Insert design (project file)</summary>\n\n";
  const tail = "\n\n</details>";
  const wrap = (body: string, note: string): string => {
    const fence = fenceFor(body);
    return `${head}${note}${fence}json\n${body}\n${fence}${tail}`;
  };
  const whole = wrap(project, "");
  if (whole.length <= room) {
    return whole;
  }
  // A fence of a few backticks and the note are the overhead; cut the file to what is left.
  const note = (kept: number): string =>
    `Cut here: the first ${kept.toLocaleString("en-US")} of ${project.length.toLocaleString("en-US")} characters.\n\n`;
  const overhead = wrap("", note(project.length)).length + 8;
  const kept = Math.max(0, room - overhead);
  if (kept < 200) {
    return "";
  }
  return wrap(project.slice(0, kept), note(kept));
}

/** The issue body: the message, then version, browser, contact and the project. Under `LIMITS.body`. */
export function buildBody(f: Feedback): string {
  const rows: string[] = [];
  rows.push(`**Kind:** ${f.kind}`);
  rows.push(`**App version:** ${f.appVersion === "" ? "unknown" : defang(f.appVersion)}`);
  rows.push(`**Browser:** ${f.userAgent === "" ? "unknown" : defang(f.userAgent)}`);
  if (f.contact !== "") {
    rows.push(`**How to reach them:** ${defang(f.contact)}`);
  }
  const base = `${defang(f.message)}\n\n---\n\n${rows.join("  \n")}\n`;
  if (f.project === null) {
    return base;
  }
  const block = projectBlock(f.project, LIMITS.body - base.length - 2);
  return block === ""
    ? `${base}\n_The insert design was too big to attach._\n`
    : `${base}\n${block}\n`;
}

/** The request body for GitHub's "create an issue". */
export function buildIssue(f: Feedback): { title: string; body: string; labels: string[] } {
  return { title: buildTitle(f.message), body: buildBody(f), labels: [...KIND_LABELS[f.kind]] };
}

const LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

/** The origin to answer with, or null when this one may not call the Worker. */
export function allowedOrigin(origin: string | null, configured: string): string | null {
  if (origin === null || origin === "") {
    return null;
  }
  const list = configured
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter((s) => s !== "");
  if (list.includes(origin) || LOCAL_ORIGIN.test(origin)) {
    return origin;
  }
  return null;
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}
