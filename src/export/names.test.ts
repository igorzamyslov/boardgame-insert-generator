import { describe, expect, it } from "vitest";
import { partFileName, uniqueFileNames } from "./names";

describe("partFileName", () => {
  it("keeps safe characters and puts no number in front", () => {
    expect(partFileName("Main_deck-1.v2", "3mf")).toBe("Main_deck-1.v2.3mf");
    expect(partFileName("Bits", "stl")).toBe("Bits.stl");
  });

  it("transliterates umlauts and drops accents", () => {
    expect(partFileName("Würfel & Plättchen", "3mf")).toBe("Wuerfel-Plaettchen.3mf");
    expect(partFileName("Café crème Straße", "3mf")).toBe("Cafe-creme-Strasse.3mf");
  });

  it("drops combining accents from decomposed input", () => {
    // "u" + combining diaeresis is not in the umlaut table: the accent is dropped.
    expect(partFileName("Wu\u0308rfel", "stl")).toBe("Wurfel.stl");
  });

  it("replaces emoji, slashes and spaces and collapses repeats", () => {
    expect(partFileName("🎲🎲 dice / tokens  ×52", "stl")).toBe("dice-tokens-52.stl");
    expect(partFileName("a..b__c--d", "stl")).toBe("a.b_c-d.stl");
    expect(partFileName("../../etc/passwd", "stl")).toBe("etc-passwd.stl");
  });

  it("falls back to 'part' and caps the length", () => {
    expect(partFileName("🎲", "3mf")).toBe("part.3mf");
    expect(partFileName("", "3mf")).toBe("part.3mf");
    expect(partFileName("x".repeat(300), "3mf")).toBe(`${"x".repeat(60)}.3mf`);
  });

  it("never ends the name part with a separator after truncation", () => {
    expect(partFileName(`${"a".repeat(59)} b`, "stl")).toBe(`${"a".repeat(59)}.stl`);
  });

  it("only ever produces portable ASCII names for emoji, CJK and umlaut input", () => {
    const inputs = [
      "🎲 Würfel 🃏 Karten",
      "ÄÖÜ äöü ß",
      "日本語 トレイ",
      "👨‍👩‍👧‍👦 family",
      'con: <aux> | "nul" ? *',
      "\u0000\u001f tab\tname\n",
    ];
    for (const input of inputs) {
      const name = partFileName(input, "3mf");
      expect(name).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*\.3mf$|^part\.3mf$/);
      expect(name.length).toBeLessThanOrEqual(60 + 4);
    }
    expect(partFileName("ÄÖÜ äöü ß", "3mf")).toBe("AeOeUe-aeoeue-ss.3mf");
  });
});

describe("uniqueFileNames", () => {
  it("counts the repeats of a name, without regard to case, before the extension", () => {
    expect(uniqueFileNames(["Dice.3mf", "dice.3mf", "Cards.3mf", "Dice.3mf"])).toEqual([
      "Dice.3mf",
      "dice-2.3mf",
      "Cards.3mf",
      "Dice-3.3mf",
    ]);
  });

  it("gives many parts with names that clean to the same text distinct file names", () => {
    const names = uniqueFileNames(
      Array.from({ length: 200 }, (_, i) => partFileName(`Karten 🃏${"!".repeat(i % 3)}`, "3mf")),
    );
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(200);
  });
});
