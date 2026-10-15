import fc from "fast-check";
import { deflateSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { newProject } from "../model/defaults";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import type { CardsComponent, ParseResult } from "../model/types";
import { APP_VERSION } from "../model/version";
import { sampleProject } from "../test-support/sample";
import { toBase64Url } from "./base64url";
import {
  InflateLimitError,
  MAX_INFLATED_BYTES,
  decodeHash,
  encodeHash,
  inflateCapped,
} from "./link";

function expectOk(result: ParseResult) {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`);
  }
  return result;
}

function expectError(result: ParseResult): string {
  if (result.ok) {
    throw new Error("expected an error");
  }
  return result.error;
}

/** A link whose payload is `text` deflated, bypassing serializeProject. */
function linkOf(text: string): string {
  return `#1.${toBase64Url(deflateSync(strToU8(text)))}`;
}

describe("encodeHash / decodeHash", () => {
  it("round-trips a full project, including its stored layout", () => {
    const p = sampleProject();
    const hash = encodeHash(p, noForeign());
    expect(hash).toMatch(/^#1\.[A-Za-z0-9_-]+$/);
    expect(expectOk(decodeHash(hash)).project).toEqual({ ...p, createdWith: APP_VERSION });
  });

  it("round-trips a project with no components", () => {
    const p = newProject();
    expect(expectOk(decodeHash(encodeHash(p, noForeign()))).project).toEqual(p);
  });

  it("carries fillToTop through a share link", () => {
    const p = sampleProject();
    const off = { ...p, settings: { ...p.settings, fillToTop: false } };
    expect(expectOk(decodeHash(encodeHash(off, noForeign()))).project.settings.fillToTop).toBe(
      false,
    );
    expect(expectOk(decodeHash(encodeHash(p, noForeign()))).project.settings.fillToTop).toBe(true);
  });

  it("keeps foreign components, unknown values and unknown fields of a newer-minor project", () => {
    const raw = JSON.parse(serializeProject(newProject(), noForeign())) as Record<string, unknown>;
    raw.schemaVersion = "0.1.11";
    raw.components = [{ id: "dial0001", kind: "dial", diameter: 40 }];
    raw.futureField = { nested: [1, 2, 3] };
    (raw.settings as Record<string, unknown>).leftover = "hollow";
    const loaded = expectOk(parseProject(raw));
    expect(loaded.foreign.components).toHaveLength(1);
    expect(loaded.foreign.values).toEqual([{ path: "/settings/leftover", raw: "hollow" }]);

    const again = expectOk(decodeHash(encodeHash(loaded.project, loaded.foreign)));
    expect(again.foreign).toEqual(loaded.foreign);
    expect(again.project).toEqual({ ...loaded.project, createdWith: APP_VERSION });
    expect(serializeProject(again.project, again.foreign)).toBe(
      serializeProject(loaded.project, loaded.foreign),
    );
    expect(JSON.parse(serializeProject(again.project, again.foreign))).toMatchObject({
      futureField: { nested: [1, 2, 3] },
      settings: { leftover: "hollow" },
    });
  });

  it("round-trips non-ASCII project names", () => {
    const p = { ...newProject(), name: "Ünïcödé 🎲 日本語" };
    expect(expectOk(decodeHash(encodeHash(p, noForeign()))).project.name).toBe(p.name);
  });

  it("accepts the hash without '#', and a whole URL", () => {
    const hash = encodeHash(sampleProject(), noForeign());
    expect(decodeHash(hash.slice(1)).ok).toBe(true);
    expect(decodeHash(`https://example.org/insert-generator/${hash}`).ok).toBe(true);
  });
});

describe("decodeHash: links damaged on the way", () => {
  const hash = encodeHash(sampleProject(), noForeign());

  it("rejects every truncation with a clear message", () => {
    for (let cut = 3; cut < hash.length; cut++) {
      expect(expectError(decodeHash(hash.slice(0, cut)))).toMatch(/incomplete or damaged/);
    }
  });

  it("ignores line breaks and spaces inserted by mail and chat apps", () => {
    const wrapped = hash.replace(/(.{60})/g, "$1\n ");
    expect(decodeHash(wrapped).ok).toBe(true);
  });

  it("ignores punctuation swallowed from the surrounding text", () => {
    expect(decodeHash(`${hash}).`).ok).toBe(true);
    expect(decodeHash(`${hash}>`).ok).toBe(true);
  });

  it("ignores zero-width characters and soft hyphens inserted into the payload", () => {
    const mid = Math.floor(hash.length / 2);
    for (const invisible of ["\u200b", "\u200c", "\u200d", "\u2060", "\u00ad", "\ufeff"]) {
      expect(decodeHash(`${hash.slice(0, mid)}${invisible}${hash.slice(mid)}`).ok).toBe(true);
    }
  });

  it("accepts '=' padding added by encoders that pad", () => {
    for (const padding of ["=", "=="]) {
      expect(decodeHash(`${hash}${padding}`).ok).toBe(true);
    }
  });

  it("rejects characters outside base64url, and bytes that are not deflate or not JSON", () => {
    expect(expectError(decodeHash("#1.@@@@"))).toMatch(/incomplete or damaged/);
    expect(
      expectError(decodeHash(`#1.${toBase64Url(strToU8("plain text, not deflate"))}`)),
    ).toMatch(/incomplete or damaged/);
    expect(expectError(decodeHash(linkOf("{not json")))).toMatch(/incomplete or damaged/);
    expect(expectError(decodeHash("#1."))).toMatch(/incomplete or damaged/);
  });

  it("rejects a payload that inflates to invalid UTF-8", () => {
    const link = `#1.${toBase64Url(deflateSync(new Uint8Array([0x22, 0xff, 0xfe, 0x22])))}`;
    expect(expectError(decodeHash(link))).toMatch(/incomplete or damaged/);
  });

  it("handles a long run of trailing punctuation without slowing down", () => {
    const started = Date.now();
    expect(decodeHash(`#1.${"!".repeat(200_000)}a${"!".repeat(200_000)}`).ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("decodeHash: refused links", () => {
  it("rejects an unknown link format", () => {
    expect(expectError(decodeHash("#2.abcd"))).toMatch(/link format 2/);
  });

  it("rejects a hash that is not a project link", () => {
    expect(expectError(decodeHash(""))).toMatch(/doesn't contain an insert generator project/);
    expect(expectError(decodeHash("#section-3"))).toMatch(/doesn't contain/);
  });

  it("caps the inflated size at 1 MB", () => {
    const bomb = linkOf(`"${" ".repeat(MAX_INFLATED_BYTES + 10)}"`);
    expect(bomb.length).toBeLessThan(5000);
    expect(expectError(decodeHash(bomb))).toMatch(/more than 1 MB/);
  });

  it("applies the spec §5 bounds", () => {
    const p = sampleProject();
    const cards = p.components[0] as CardsComponent;
    p.components[0] = { ...cards, decks: [{ name: "Huge", count: 999_999 }] };
    expect(expectError(decodeHash(encodeHash(p, noForeign())))).toMatch(/at most 2000/);
  });

  it("refuses JSON nested deeper than the reader allows instead of throwing", () => {
    const deep = `${"[".repeat(200)}${"]".repeat(200)}`;
    expect(expectError(decodeHash(linkOf(deep)))).toBeTruthy();
  });
});

describe("decodeHash never throws", () => {
  it("returns a result for arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        expect(typeof decodeHash(text).ok).toBe("boolean");
        expect(typeof decodeHash(`#1.${text}`).ok).toBe("boolean");
      }),
      { numRuns: 500 },
    );
  });

  it("returns a result for arbitrary base64url-shaped payloads", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (data) => {
        expect(typeof decodeHash(`#1.${toBase64Url(data)}`).ok).toBe("boolean");
      }),
      { numRuns: 500 },
    );
  });

  it("returns a result for a valid link with damaged characters", () => {
    const hash = encodeHash(sampleProject(), noForeign());
    fc.assert(
      fc.property(fc.nat({ max: hash.length - 1 }), fc.string({ maxLength: 3 }), (at, junk) => {
        expect(typeof decodeHash(`${hash.slice(0, at)}${junk}${hash.slice(at + 1)}`).ok).toBe(
          "boolean",
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe("inflateCapped", () => {
  it("stops a deflate bomb while inflating, before the stream ends", () => {
    const bomb = deflateSync(new Uint8Array(50 * 1024 * 1024));
    // Cutting the stream's tail makes a non-streaming inflater fail with "unexpected EOF"
    // instead; only a streaming one reaches the cap first.
    expect(() => inflateCapped(bomb.subarray(0, bomb.length - 3), MAX_INFLATED_BYTES)).toThrow(
      InflateLimitError,
    );
  });

  it("treats empty input as truncated data, not as an empty result", () => {
    expect(() => inflateCapped(new Uint8Array(0), 100)).toThrow(/unexpected EOF/);
    expect(() => inflateCapped(new Uint8Array(0), 100)).not.toThrow(InflateLimitError);
  });

  it("returns data up to the cap exactly", () => {
    const data = strToU8("x".repeat(5000));
    expect(inflateCapped(deflateSync(data), 5000)).toEqual(data);
    expect(() => inflateCapped(deflateSync(data), 4999)).toThrow(/exceeds 4999 bytes/);
  });
});
