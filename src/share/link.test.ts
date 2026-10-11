import fc from "fast-check";
import { deflateSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { newProject } from "../model/defaults";
import { noForeign, parseProject, serializeProject } from "../model/schema";
import type { CardsComponent, ParseResult } from "../model/types";
import { APP_VERSION } from "../model/version";
import { sampleProject } from "../test-support/sample";
import { toBase64Url } from "./base64url";
import { MAX_INFLATED_BYTES, decodeHash, encodeHash, inflateCapped } from "./link";

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

  it("keeps foreign components from a newer-minor project", () => {
    const raw = JSON.parse(serializeProject(newProject(), noForeign())) as Record<string, unknown>;
    raw.schemaVersion = "0.1.9";
    raw.components = [{ id: "dial0001", kind: "dial", diameter: 40 }];
    const loaded = expectOk(parseProject(raw));
    const again = expectOk(decodeHash(encodeHash(loaded.project, loaded.foreign)));
    expect(again.foreign).toEqual(loaded.foreign);
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
  it("returns data up to the cap exactly", () => {
    const data = strToU8("x".repeat(5000));
    expect(inflateCapped(deflateSync(data), 5000)).toEqual(data);
    expect(() => inflateCapped(deflateSync(data), 4999)).toThrow(/exceeds 4999 bytes/);
  });
});
