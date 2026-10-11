import { describe, expect, it } from "vitest";
import { partFileName } from "./names";

describe("partFileName", () => {
  it("pads the index and keeps safe characters", () => {
    expect(partFileName(1, "Main_deck-1.v2", "3mf")).toBe("01-Main_deck-1.v2.3mf");
    expect(partFileName(12, "Bits", "stl")).toBe("12-Bits.stl");
    expect(partFileName(123, "Bits", "stl")).toBe("123-Bits.stl");
  });

  it("transliterates umlauts and drops accents", () => {
    expect(partFileName(3, "Würfel & Plättchen", "3mf")).toBe("03-Wuerfel-Plaettchen.3mf");
    expect(partFileName(4, "Café crème Straße", "3mf")).toBe("04-Cafe-creme-Strasse.3mf");
  });

  it("drops combining accents from decomposed input", () => {
    // "u" + combining diaeresis is not in the umlaut table: the accent is dropped.
    expect(partFileName(4, "Würfel", "stl")).toBe("04-Wurfel.stl");
  });

  it("replaces emoji, slashes and spaces and collapses repeats", () => {
    expect(partFileName(5, "🎲🎲 dice / tokens  ×52", "stl")).toBe("05-dice-tokens-52.stl");
    expect(partFileName(6, "a..b__c--d", "stl")).toBe("06-a.b_c-d.stl");
    expect(partFileName(7, "../../etc/passwd", "stl")).toBe("07-etc-passwd.stl");
  });

  it("falls back to 'part' and caps the length", () => {
    expect(partFileName(8, "🎲", "3mf")).toBe("08-part.3mf");
    expect(partFileName(9, "", "3mf")).toBe("09-part.3mf");
    const long = partFileName(10, "x".repeat(300), "3mf");
    expect(long).toBe(`10-${"x".repeat(60)}.3mf`);
  });

  it("never ends the name part with a separator after truncation", () => {
    const name = partFileName(11, `${"a".repeat(59)} b`, "stl");
    expect(name).toBe(`11-${"a".repeat(59)}.stl`);
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
      const name = partFileName(2, input, "3mf");
      expect(name).toMatch(/^02-[A-Za-z0-9][A-Za-z0-9._-]*\.3mf$/);
      expect(name.length).toBeLessThanOrEqual(3 + 60 + 4);
    }
    expect(partFileName(2, "ÄÖÜ äöü ß", "3mf")).toBe("02-AeOeUe-aeoeue-ss.3mf");
  });

  it("gives unique names to many parts with the same contents", () => {
    const names = new Set<string>();
    for (let i = 1; i <= 1000; i += 1) {
      names.add(partFileName(i, "Karten 🃏", "3mf"));
    }
    expect(names.size).toBe(1000);
    expect(partFileName(100, "Karten 🃏", "3mf")).toBe("100-Karten.3mf");
    expect(partFileName(1000, "Karten 🃏", "3mf")).toBe("1000-Karten.3mf");
  });
});
