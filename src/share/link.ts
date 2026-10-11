import { Inflate, deflateSync, strToU8 } from "fflate";
import { parseProject, serializeProject } from "../model/schema";
import type { ForeignData, ParseResult, Project } from "../model/types";
import { fromBase64Url, isBase64UrlChar, toBase64Url } from "./base64url";

/** Version of the `#<format>.<payload>` link format (spec §8.4). */
export const HASH_FORMAT = 1;
/** Inflated JSON larger than this is refused (spec §8.4). */
export const MAX_INFLATED_BYTES = 1024 * 1024;
/** Hash budget for typical projects without a stored layout (fixtures test, spec §8.4). */
export const LINK_TARGET_CHARS = 1900;
/**
 * A whole share URL longer than this gets a "may be cut" warning (plan 5): Discord's
 * 2 000-character message limit. Fixtures with a stored layout stay under it on GitHub Pages.
 */
export const LINK_MAX_URL_CHARS = 2000;

const CHUNK_BYTES = 1024;

/** Whitespace plus zero-width and soft-hyphen characters that chat apps insert into long links. */
const INVISIBLE = /[\s\u00ad\u200b-\u200d\u2060\ufeff]+/g;

const DAMAGED =
  "This link is incomplete or damaged. It may have been cut off when it was copied or sent. Ask for the link again, or for the project file.";

/** `#1.<base64url(deflate(json))>` */
export function encodeHash(p: Project, foreign: ForeignData): string {
  const deflated = deflateSync(strToU8(serializeProject(p, foreign)), { level: 9 });
  return `#${HASH_FORMAT}.${toBase64Url(deflated)}`;
}

export class InflateLimitError extends Error {}

/**
 * Inflates raw DEFLATE data and throws InflateLimitError once the output
 * passes `cap` bytes. Input is fed 1 KB at a time, so a deflate bomb can't
 * allocate much beyond the cap (DEFLATE expands at most ≈ 1032:1).
 * Throws on damaged, truncated or empty data.
 */
export function inflateCapped(data: Uint8Array, cap: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let size = 0;
  let finished = false;
  const inflate = new Inflate((chunk, final) => {
    finished = finished || final;
    size += chunk.length;
    if (size > cap) {
      throw new InflateLimitError(`Inflated data exceeds ${cap} bytes`);
    }
    parts.push(chunk.slice());
  });
  for (let i = 0; i < data.length; i += CHUNK_BYTES) {
    inflate.push(data.subarray(i, i + CHUNK_BYTES), i + CHUNK_BYTES >= data.length);
  }
  if (!finished) {
    // fflate doesn't flag an empty input as truncated, so say so here.
    throw new Error("unexpected EOF");
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/**
 * Drops trailing characters outside the base64url alphabet: the `).` of "(see link).", and
 * `=` padding added by encoders that pad.
 */
function trimTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && !isBase64UrlChar(text[end - 1])) {
    end--;
  }
  return text.slice(0, end);
}

function decodeUnchecked(hash: string): ParseResult {
  const fromHash = hash.includes("#") ? hash.slice(hash.indexOf("#") + 1) : hash;
  const text = fromHash.replace(INVISIBLE, "");
  const m = /^(\d+)\.(.*)$/.exec(text);
  if (!m) {
    return fail("This link doesn't contain an insert generator project.");
  }
  const [, format = "", rest = ""] = m;
  if (format !== String(HASH_FORMAT)) {
    return fail(
      `This link uses link format ${format}, which this app version can't read. Update the app, or ask for the project file.`,
    );
  }
  const bytes = fromBase64Url(trimTrailingPunctuation(rest));
  if (!bytes || bytes.length === 0) {
    return fail(DAMAGED);
  }
  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(
      inflateCapped(bytes, MAX_INFLATED_BYTES),
    );
  } catch (e) {
    if (e instanceof InflateLimitError) {
      return fail("This link holds more than 1 MB of project data, which is over the limit.");
    }
    return fail(DAMAGED);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail(DAMAGED);
  }
  return parseProject(raw);
}

/**
 * Reads a link hash (`#1.…`, `1.…`, or a whole URL containing one). Tolerates
 * what chat apps and mail clients do to links: inserted line breaks, spaces or
 * zero-width characters, trailing punctuation such as `).` swallowed from the surrounding text,
 * and `=` padding added by encoders that pad.
 * Never throws; the result says why a link can't be opened.
 */
export function decodeHash(hash: string): ParseResult {
  try {
    return decodeUnchecked(hash);
  } catch (error) {
    // Last-resort guard for the never-throws rule: every expected failure is handled above, so
    // reaching this means a bug. Log it so it isn't hidden behind the user-facing message.
    console.error("Reading a link failed unexpectedly", error);
    return fail(DAMAGED);
  }
}
