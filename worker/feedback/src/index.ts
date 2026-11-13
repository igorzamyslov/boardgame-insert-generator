// worker/feedback/src/index.ts
// Cloudflare Worker: takes feedback from the app and opens a GitHub issue labelled `feedback`.
// No storage anywhere. Secrets: GITHUB_TOKEN, TURNSTILE_SECRET. See ../README.md.
import { allowedOrigin, buildIssue, corsHeaders, validate } from "./logic";

export interface Env {
  GITHUB_TOKEN: string;
  TURNSTILE_SECRET: string;
  /** "owner/name" of the repository that gets the issues. */
  GITHUB_REPO: string;
  /** Comma-separated origins besides localhost, e.g. "https://igorzamyslov.github.io". */
  ALLOWED_ORIGINS: string;
  /** Workers Rate Limiting binding. */
  RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

type Fetch = typeof fetch;

const MAX_REQUEST_CHARS = 1_200_000;
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function reply(
  status: number,
  body: { ok: boolean; error?: string; message?: string; issueUrl?: string; number?: number },
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(origin === null ? {} : corsHeaders(origin)),
    },
  });
}

async function turnstileOk(env: Env, token: string, ip: string, f: Fetch): Promise<boolean> {
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip !== "") {
    form.set("remoteip", ip);
  }
  try {
    const res = await f(SITEVERIFY, { method: "POST", body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/** The whole request handler; `f` is injectable so tests can mock the network. */
export async function handle(request: Request, env: Env, f: Fetch = fetch): Promise<Response> {
  const origin = allowedOrigin(request.headers.get("origin"), env.ALLOWED_ORIGINS);
  if (request.method === "OPTIONS") {
    return origin === null
      ? new Response(null, { status: 403 })
      : new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (origin === null) {
    return reply(
      403,
      { ok: false, error: "origin", message: "This address may not send feedback." },
      null,
    );
  }
  if (request.method !== "POST") {
    return reply(405, { ok: false, error: "method", message: "Use POST." }, origin);
  }

  const raw = await request.text();
  if (raw.length > MAX_REQUEST_CHARS) {
    return reply(
      413,
      { ok: false, error: "too_large", message: "That is too much to send." },
      origin,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply(
      400,
      { ok: false, error: "bad_request", message: "That doesn't look like feedback." },
      origin,
    );
  }
  const checked = validate(json);
  if (!checked.ok) {
    return reply(400, { ok: false, error: "bad_request", message: checked.error }, origin);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const limited = await env.RATE_LIMITER.limit({ key: ip === "" ? "unknown" : ip });
  if (!limited.success) {
    return reply(
      429,
      {
        ok: false,
        error: "rate_limited",
        message: "Too many messages from here. Try again in a minute.",
      },
      origin,
    );
  }
  if (!(await turnstileOk(env, checked.value.turnstileToken, ip, f))) {
    return reply(
      400,
      {
        ok: false,
        error: "captcha",
        message: "The check that you are a person failed. Try again.",
      },
      origin,
    );
  }

  let res: Response;
  try {
    res = await f(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "insert-generator-feedback",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify(buildIssue(checked.value)),
    });
  } catch {
    return reply(
      502,
      { ok: false, error: "upstream", message: "GitHub could not be reached." },
      origin,
    );
  }
  if (!res.ok) {
    // The status is useful in the Worker's logs; the body might echo request details, so it stays out.
    console.error(`GitHub answered ${res.status}`);
    return reply(502, { ok: false, error: "upstream", message: "GitHub did not take it." }, origin);
  }
  const issue = (await res.json()) as { html_url?: string; number?: number };
  return reply(201, { ok: true, issueUrl: issue.html_url, number: issue.number }, origin);
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
};
