// src/feedback/feedback.ts
// The feedback form's logic with no screen: what is sent, where, and the GitHub page used when no
// Worker is set. The only place in the app that makes a request to another host (DESIGN §2
// Hosting, decision log 2026-11-13).

export const FEEDBACK_KINDS = ["idea", "problem", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const KIND_LABELS: Record<FeedbackKind, string> = {
  idea: "Idea",
  problem: "Problem",
  other: "Something else",
};

/** The most the form takes; the Worker refuses more. */
export const MESSAGE_LIMIT = 5000;

export const ISSUES_URL = "https://github.com/igorzamyslov/boardgame-insert-generator/issues";

export interface FeedbackConfig {
  /** The Worker's address; "" when none is set. */
  url: string;
  /** Cloudflare Turnstile's public site key; "" when none is set. */
  siteKey: string;
}

/** Reads the build's settings. The Worker is used only when both are present. */
export function readConfig(env: {
  VITE_FEEDBACK_URL?: string;
  VITE_TURNSTILE_SITEKEY?: string;
}): FeedbackConfig {
  return {
    url: (env.VITE_FEEDBACK_URL ?? "").trim(),
    siteKey: (env.VITE_TURNSTILE_SITEKEY ?? "").trim(),
  };
}

export function hasWorker(c: FeedbackConfig): boolean {
  return c.url !== "" && c.siteKey !== "";
}

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  contact: string;
  includeProject: boolean;
}

export interface FeedbackContext {
  appVersion: string;
  userAgent: string;
}

export interface FeedbackPayload {
  message: string;
  kind: FeedbackKind;
  contact?: string;
  includeProject: boolean;
  /** The project file's text: present only when the person ticked "Attach my insert design". */
  project?: string;
  appVersion: string;
  userAgent: string;
  turnstileToken: string;
}

/** What goes to the Worker. The project is read (`getProject`) only when it is to be attached. */
export function buildPayload(
  draft: FeedbackDraft,
  context: FeedbackContext,
  token: string,
  getProject: () => string,
): FeedbackPayload {
  const contact = draft.contact.trim();
  return {
    message: draft.message.trim(),
    kind: draft.kind,
    ...(contact === "" ? {} : { contact }),
    includeProject: draft.includeProject,
    ...(draft.includeProject ? { project: getProject() } : {}),
    appVersion: context.appVersion,
    userAgent: context.userAgent,
    turnstileToken: token,
  };
}

/** "Feedback: " and the first line, about 70 characters (the Worker titles its issues the same way). */
export function issueTitle(message: string): string {
  const first = message.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const line = first.replace(/\s+/g, " ").trim();
  return `Feedback: ${line.length > 70 ? `${line.slice(0, 69).trimEnd()}…` : line}`;
}

/**
 * GitHub's new-issue page with the words filled in (the form in .github/ISSUE_TEMPLATE/feedback.yml;
 * its field ids are the query names). The design file is not sent this way: an address can't hold it.
 */
export function fallbackUrl(draft: FeedbackDraft, context: FeedbackContext): string {
  const q = new URLSearchParams({
    template: "feedback.yml",
    labels: "feedback",
    title: issueTitle(draft.message),
    kind: KIND_LABELS[draft.kind],
    message: draft.message.trim(),
    contact: draft.contact.trim(),
    context: `App version: ${context.appVersion}\nBrowser: ${context.userAgent}`,
  });
  return `${ISSUES_URL}/new?${q.toString()}`;
}

export type SendResult =
  { ok: true; issueUrl: string | null; number: number | null } | { ok: false; message: string };

export const FAILED_MESSAGE = "It didn't go through. Your words are still here: try again.";

/** Posts the feedback to the Worker. Never throws: a failure is a plain sentence to show. */
export async function sendFeedback(
  url: string,
  payload: FeedbackPayload,
  doFetch: typeof fetch = fetch,
): Promise<SendResult> {
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data: { ok?: boolean; message?: string; issueUrl?: string; number?: number } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      // not JSON: the generic sentence below
    }
    if (res.ok && data.ok === true) {
      return { ok: true, issueUrl: data.issueUrl ?? null, number: data.number ?? null };
    }
    return {
      ok: false,
      message:
        typeof data.message === "string" && data.message !== ""
          ? `${data.message} Your words are still here.`
          : FAILED_MESSAGE,
    };
  } catch {
    return { ok: false, message: FAILED_MESSAGE };
  }
}
