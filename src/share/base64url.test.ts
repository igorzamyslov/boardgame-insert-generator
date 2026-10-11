import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "./base64url";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("base64url", () => {
  it("matches RFC 4648 test vectors (url alphabet, no padding)", () => {
    const enc = new TextEncoder();
    expect(toBase64Url(enc.encode(""))).toBe("");
    expect(toBase64Url(enc.encode("f"))).toBe("Zg");
    expect(toBase64Url(enc.encode("fo"))).toBe("Zm8");
    expect(toBase64Url(enc.encode("foo"))).toBe("Zm9v");
    expect(toBase64Url(enc.encode("foobar"))).toBe("Zm9vYmFy");
    expect(toBase64Url(bytes(0xfb, 0xff))).toBe("-_8");
  });

  it("round-trips any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (data) => {
        expect(fromBase64Url(toBase64Url(data))).toEqual(data);
      }),
    );
  });

  it.each(["Zm9v!", "Zm9v=", "Zm 9v", "Z", "Zm9vY", "é"])("rejects %j", (text) => {
    expect(fromBase64Url(text)).toBeNull();
  });
});
