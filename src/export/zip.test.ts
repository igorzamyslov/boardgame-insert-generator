import { describe, expect, it } from "vitest";
import { unzipSync, strToU8 } from "fflate";
import { zipFiles } from "./zip";
import { partFileName } from "./names";

describe("zipFiles", () => {
  it("round-trips files", () => {
    const zip = zipFiles([
      { name: "01-a.stl", data: strToU8("hello") },
      { name: "02-b.3mf", data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files)).toEqual(["01-a.stl", "02-b.3mf"]);
    expect(files["02-b.3mf"]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("is deterministic", () => {
    const files = [{ name: "a.stl", data: strToU8("x".repeat(1000)) }];
    expect(zipFiles(files)).toEqual(zipFiles(files));
  });

  it("rejects duplicate names", () => {
    const data = new Uint8Array([1]);
    expect(() =>
      zipFiles([
        { name: "a.stl", data },
        { name: "a.stl", data },
      ]),
    ).toThrow(/Duplicate/);
  });

  it("stores .3mf entries and deflates the rest", () => {
    const data = strToU8("y".repeat(5000));
    const zip = zipFiles([
      { name: "a.3mf", data },
      { name: "b.stl", data },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // Local file headers: method at +8, compressed size at +18.
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(18, true)).toBe(5000);
    const second = 30 + "a.3mf".length + 5000;
    expect(view.getUint16(second + 8, true)).toBe(8);
    expect(view.getUint32(second + 18, true)).toBeLessThan(5000);
    expect(unzipSync(zip)["b.stl"]).toEqual(data);
  });

  it("round-trips many files with emoji and umlaut source names", () => {
    const files = Array.from({ length: 250 }, (_, i) => ({
      name: partFileName(
        i + 1,
        i % 2 === 0 ? "Würfel 🎲" : "Plättchen ✨",
        i % 3 === 0 ? "stl" : "3mf",
      ),
      data: new Uint8Array([i % 256, (i >> 8) & 255]),
    }));
    const out = unzipSync(zipFiles(files));
    expect(Object.keys(out)).toEqual(files.map((f) => f.name));
    for (const f of files) {
      expect(out[f.name]).toEqual(f.data);
    }
  });
});
