// scripts/design/renderBoard.test.mjs
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { boardPreview, renderBoard } from "./renderBoard.mjs";

function dom(html) {
  return new JSDOM(html).window.document;
}

function attributeNames(document) {
  return [...document.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.name));
}

describe("renderBoard", () => {
  it("expands sc-for over renderVals", async () => {
    const html = await renderBoard("NoFit.dc.html");
    for (const text of [
      "Market deck",
      "Starter decks",
      "Event cards",
      "Coins and cubes",
      "Resource tokens",
      "Dice",
      "Hex tiles",
      "Heroes",
      "Heroes don't fit yet",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("{{");
  });

  it("unwraps sc-if and sc-for into their children", async () => {
    const html = await renderBoard("Main.dc.html");
    expect(html).not.toContain("<sc-if");
    expect(html).not.toContain("<sc-for");
    const document = dom(html);
    const root = document.querySelector("x-dc");
    expect(root).not.toBeNull();
    const scElements = [...(root?.querySelectorAll("*") ?? [])].filter((el) =>
      el.localName.startsWith("sc-"),
    );
    expect(scElements).toEqual([]);
    expect(document.querySelector("header")?.children).toHaveLength(9);

    const open = dom(await renderBoard("Main.dc.html", { state: { menu: true } }));
    expect(open.querySelector("header")?.children).toHaveLength(10);
    expect(open.querySelector("header")?.textContent).toContain("Your inserts");
  });

  it("strips handlers and hints", async () => {
    for (const file of ["Main.dc.html", "Edit.dc.html", "Exporting.dc.html"]) {
      const names = attributeNames(dom(await renderBoard(file)));
      expect(names.filter((n) => n.startsWith("on") || n.startsWith("hint-"))).toEqual([]);
    }
  });

  it("applies the data-props defaults", async () => {
    const edit = await renderBoard("Edit.dc.html");
    expect(edit).toContain("Keep it next to");
    const closed = await renderBoard("Edit.dc.html", { props: { moreOpen: false } });
    expect(closed).toContain("More options");
    expect(closed).not.toContain("Keep it next to");
  });

  it("prints booleans and blanks", async () => {
    const main = dom(await renderBoard("Main.dc.html"));
    expect(main.querySelector('[aria-haspopup="menu"]')?.getAttribute("aria-expanded")).toBe(
      "false",
    );
    const older = await renderBoard("Main.dc.html", { props: { notice: "olderVersion" } });
    expect(older).not.toContain("undefined");
  });

  it("renders static boards", async () => {
    expect(await renderBoard("Empty.dc.html")).toContain("Let's build an insert for your game");
  });

  it("uses local fonts only", async () => {
    const html = await renderBoard("Main.dc.html");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("support.js");
    expect(html).toContain("file://");
    expect(html).toContain("figtree-latin-500-normal.woff2");
  });

  it("reads the preview size", () => {
    expect(boardPreview("MobileWorkspace.dc.html")).toEqual({ width: 390, height: 844 });
    expect(boardPreview("Flow.dc.html")).toEqual({ width: 1848, height: 800 });
  });
});
