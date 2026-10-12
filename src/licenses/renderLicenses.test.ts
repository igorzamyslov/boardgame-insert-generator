// src/licenses/renderLicenses.test.ts
import { describe, expect, it } from "vitest";
import { REQUIRED_PACKAGES, missingPackages, renderLicenses, toEntries } from "./renderLicenses";

describe("licenses file", () => {
  it("turns bundled dependencies into entries with license and notice text", () => {
    expect(
      toEntries([
        {
          name: "preact",
          version: "10.29.8",
          license: "MIT",
          licenseText: "MIT text",
          noticeText: null,
        },
        { name: null, version: "1", license: "MIT", licenseText: "x" },
        { name: "odd", version: null, license: null, licenseText: null, noticeText: "NOTICE only" },
      ]),
    ).toEqual([
      { name: "preact", version: "10.29.8", license: "MIT", text: "MIT text" },
      { name: "odd", version: "", license: "UNKNOWN", text: "NOTICE only" },
    ]);
  });

  it("renders sorted, de-duplicated sections under a header", () => {
    const text = renderLicenses(
      [
        { name: "three", version: "0.186.1", license: "MIT", text: "three text" },
        { name: "fflate", version: "0.8.3", license: "MIT", text: "fflate text" },
        { name: "three", version: "0.186.1", license: "MIT", text: "three text" },
      ],
      "Board Game Insert Generator",
    );
    expect(text.startsWith("Third-party software in Board Game Insert Generator")).toBe(true);
    expect(text.indexOf("fflate 0.8.3 — MIT")).toBeLessThan(text.indexOf("three 0.186.1 — MIT"));
    expect(text.split("three 0.186.1 — MIT")).toHaveLength(2);
  });

  it("finds missing required packages", () => {
    expect(missingPackages("manifold-3d three preact", REQUIRED_PACKAGES)).toEqual([
      "Clipper2",
      "@preact/signals",
      "fflate",
    ]);
  });
});
