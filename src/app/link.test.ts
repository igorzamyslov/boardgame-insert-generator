// src/app/link.test.ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ITERATIONS, optimize } from "../layout";
import { FIXTURES, fixtureInput } from "../layout/test-fixtures";
import type { FixtureName } from "../layout/test-fixtures";
import { parseProject } from "../model/schema";
import { LINK_MAX_URL_CHARS, encodeHash } from "../share";
import { fileSlug } from "./download";
import { copyLink, shareLink } from "./link";

describe("shareLink", () => {
  it("replaces an existing fragment", () => {
    expect(shareLink("https://x.test/app/#1.old", "#1.new")).toBe("https://x.test/app/#1.new");
    expect(shareLink("https://x.test/app/", "#1.new")).toBe("https://x.test/app/#1.new");
  });
});

describe("copyLink", () => {
  it("copies and flags whole links over the 2 000-character message limit", async () => {
    const write = vi.fn(() => Promise.resolve());
    expect(await copyLink("short", write)).toEqual({ status: "copied", length: 5, tooLong: false });
    const limit = "x".repeat(LINK_MAX_URL_CHARS);
    expect((await copyLink(limit, write)).tooLong).toBe(false);
    expect(await copyLink(`${limit}x`, write)).toEqual({
      status: "copied",
      length: LINK_MAX_URL_CHARS + 1,
      tooLong: true,
    });
  });

  it("reports a refused clipboard with the link to copy by hand", async () => {
    const write = vi.fn(() => Promise.reject(new Error("denied")));
    expect(await copyLink("abc", write)).toEqual({
      status: "failed",
      length: 3,
      tooLong: false,
      link: "abc",
      error: "denied",
    });
  });
});

// The real deployment: the whole URL should fit a Discord message (2 000 characters).
const PAGES_URL = "https://igorzamyslov.github.io/static-web-apps/insert-generator/";

/** The share link of a fixture with its optimized layout stored, on the real deploy URL. */
function fixtureLink(name: FixtureName): string {
  const parsed = parseProject(FIXTURES[name]);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const { layout } = optimize(fixtureInput(name), 1, DEFAULT_ITERATIONS);
  expect(layout).not.toBeNull();
  return shareLink(
    PAGES_URL,
    encodeHash({ ...parsed.project, layout: layout ?? undefined }, parsed.foreign),
  );
}

describe("share links of the fixtures with a stored layout", () => {
  for (const name of ["cards-heavy", "bits-heavy", "small-tiles"] as const) {
    it(`${name} fits in ${LINK_MAX_URL_CHARS} characters on GitHub Pages`, () => {
      expect(fixtureLink(name).length).toBeLessThanOrEqual(LINK_MAX_URL_CHARS);
    });
  }

  // The largest fixture is a few characters over the advisory limit: the warning path.
  it("tiles-minis is over the limit, so copyLink warns", async () => {
    const link = fixtureLink("tiles-minis");
    expect(link.length).toBeGreaterThan(LINK_MAX_URL_CHARS);
    const result = await copyLink(link, () => Promise.resolve());
    expect(result).toEqual({ status: "copied", length: link.length, tooLong: true });
  });
});

describe("fileSlug", () => {
  it("keeps safe characters only", () => {
    expect(fileSlug("  Ark Nova: Marine ")).toBe("Ark-Nova-Marine");
    expect(fileSlug("???")).toBe("insert");
  });

  it("transliterates accents instead of dropping the letters", () => {
    expect(fileSlug("Würfelkönig")).toBe("Wurfelkonig");
    expect(fileSlug("Café Crème")).toBe("Cafe-Creme");
    expect(fileSlug("Ark Nova\u0301")).toBe("Ark-Nova");
  });

  it("falls back for a name with no Latin letters", () => {
    expect(fileSlug("日本語のゲーム")).toBe("insert");
    expect(fileSlug("Игра 2")).toBe("2");
  });

  it("avoids Windows reserved device names", () => {
    for (const name of ["CON", "con", "Prn", "AUX", "nul", "COM1", "com9", "LPT1", "lpt9"]) {
      expect(fileSlug(name)).toBe(`${name}-insert`);
    }
    expect(fileSlug("con.txt")).toBe("con.txt-insert");
    expect(fileSlug("CONSOLE")).toBe("CONSOLE");
    expect(fileSlug("COM10")).toBe("COM10");
    expect(fileSlug("Nul Game")).toBe("Nul-Game");
  });

  it("caps the length without leaving a trailing separator", () => {
    expect(fileSlug("a".repeat(200))).toBe("a".repeat(80));
    const cut = `${"a".repeat(79)} ${"b".repeat(50)}`;
    expect(fileSlug(cut)).toBe("a".repeat(79));
  });
});
