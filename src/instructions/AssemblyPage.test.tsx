// src/instructions/AssemblyPage.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureProject, makeLayout, makeTray } from "../app/test-helpers";
import { printableParts } from "../layout";
import type { Component, FeatureSpec, StoredLayout } from "../model/types";
import { COPY_RULINGS } from "../screens/copy-rulings";
import { loadSeed } from "../test-support/harbourKings";
import { unruled } from "../test-support/boardCopy";
import { AssemblyPage } from "./AssemblyPage";
import printCss from "./assembly.css?raw";

afterEach(cleanup);

/** The print rules: the last block of the file. */
const printBlock = printCss.slice(printCss.indexOf("@media print"));

/** The cards-heavy project with the one component the trays below hold: "Deck A". */
function deckProject() {
  const project = fixtureProject();
  const deck: Component = {
    ...structuredClone(project.components[0] as Component),
    name: "Deck A",
  };
  return { ...project, components: [deck] };
}

const layout = makeLayout("h", [
  makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
  makeTray({ key: "b:p0:0", stack: 0, level: 1, z: 40 }),
]);

describe("AssemblyPage", () => {
  it("shows one picture per layer, each with its parts", () => {
    const project = { ...deckProject(), name: "Wing span" };
    render(<AssemblyPage project={project} layout={layout} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wing span — packing guide");
    const images = screen.getAllByRole("img");
    // The exploded view, then one picture per layer.
    expect(images).toHaveLength(3);
    expect(images[1]?.getAttribute("alt")).toMatch(/Layer 1 \(bottom\)/);
    expect(images[1]?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    // Two layers, each a table of a header row and its one part.
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("names the layers, marking the top one, and lists the trays in each picture's alt text", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["How it goes together", "Layer 1 (bottom)", "Layer 2 (top)"]);
    const images = screen.getAllByRole("img");
    expect(images[1]?.getAttribute("alt")).toBe("Layer 1 (bottom): tray Deck A 1");
    expect(images[2]?.getAttribute("alt")).toBe("Layer 2 (top): tray Deck A 2");
    expect(document.querySelectorAll(".assembly-layer")).toHaveLength(2);
  });

  it("shows the exploded view with the trays in assembly order, before the layers", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    const exploded = screen.getByRole("img", { name: /^Exploded view/ });
    expect(exploded.getAttribute("alt")).toBe(
      "Exploded view of the trays in assembly order: Deck A 1, Deck A 2",
    );
    expect(exploded.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(exploded.closest("section")?.getAttribute("aria-labelledby")).toBe("exploded-title");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.id)).toEqual([
      "exploded-title",
      "layer-title-1",
      "layer-title-2",
    ]);
  });

  it("prints the exploded view: a vector image the print rules keep whole, its button left off", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    const section = document.querySelector(".assembly-exploded") as HTMLElement;
    const img = section.querySelector("img.assembly-svg") as HTMLImageElement;
    // An <img> of an SVG data URL, not a canvas: it is in the print output and stays sharp.
    expect(decodeURIComponent(img.src)).toContain("<svg");
    expect(section.querySelector("canvas")).toBeNull();
    expect(section.querySelector("button")?.className).toContain("no-print");
    expect(printBlock).toMatch(/\.assembly-exploded,[^{]*\{[^}]*break-inside:\s*avoid/);
  });

  it("downloads the exploded view as a PNG", async () => {
    const toPng = vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" })));
    const download = vi.fn();
    render(
      <AssemblyPage
        project={{ ...deckProject(), name: "Wing span" }}
        layout={layout}
        onBack={vi.fn()}
        toPng={toPng}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of the exploded view" }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download.mock.calls[0]?.[1]).toBe("Wing-span-exploded.png");
  });

  it("has no (top) when there is one layer", () => {
    render(
      <AssemblyPage
        project={deckProject()}
        layout={makeLayout("h", [makeTray()])}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Layer 1 (bottom)" })).toBeTruthy();
    expect(screen.queryByText(/\(top\)/)).toBeNull();
  });

  it("makes the parts table readable: caption, row headers and a position column", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    const table = screen.getByRole("table", {
      name: "Layer 1 (bottom), in the order to put them in",
    });
    expect(table.querySelector("caption")?.className).toBe("visually-hidden");
    // The layer is the section's heading, not a column.
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(heads).toEqual(["Name", "Engraved as", "Size", "Position", "Holds", "Lift"]);
    expect(
      [...document.querySelectorAll("tbody th")].map((th) => [
        th.textContent,
        th.getAttribute("scope"),
      ]),
    ).toEqual([
      ["Deck A 1", "row"],
      ["Deck A 2", "row"],
    ]);
    expect(table.querySelector("tbody tr")?.textContent).toContain(
      "0 mm from the left, 0 mm from the front",
    );
  });

  it("is one section per layer: its picture, then its parts, and no second list of the same", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: /^Packing order/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "What goes where" })).toBeNull();
    expect(screen.queryAllByRole("list")).toHaveLength(0);
    const second = screen.getByRole("region", { name: "Layer 2 (top)" });
    const parts = [...second.querySelectorAll("img, table")].map((e) => e.localName);
    expect(parts).toEqual(["img", "table"]);
    expect([...second.querySelectorAll("tbody th")].map((th) => th.textContent)).toEqual([
      "Deck A 2",
    ]);
  });

  it("shows names, never numbers: in the table and the pictures' text", () => {
    const withSpacer = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
      makeTray({ key: "a:p0:0:spacer", part: "spacer", path: "", solid: true, compartments: [] }),
    ]);
    render(<AssemblyPage project={deckProject()} layout={withSpacer} onBack={vi.fn()} />);
    const rows = [...document.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(rows[0]).toContain("Deck A");
    expect(rows[1]).toContain("Spacer by Deck A");
    expect(rows[1]).toContain("Goes into Deck A");
    expect(document.body.textContent).not.toMatch(/#\d/);
    for (const img of screen.getAllByRole("img")) {
      expect(img.getAttribute("alt")).not.toMatch(/#\d|\b\d \w/);
    }
  });

  it("shows what each part is engraved as, while the engraving is on", () => {
    const withSpacer = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
      makeTray({ key: "a:p0:0:spacer", part: "spacer", path: "", solid: true, compartments: [] }),
      makeTray({ key: "t:p0:0", stack: 1, x: 120, w: 4, d: 4, compartments: [] }),
    ]);
    const { rerender } = render(
      <AssemblyPage project={deckProject()} layout={withSpacer} onBack={vi.fn()} />,
    );
    const heads = [...(document.querySelectorAll("thead")[0]?.querySelectorAll("th") ?? [])].map(
      (th) => th.textContent,
    );
    expect(heads).toEqual(["Name", "Engraved as", "Size", "Position", "Holds", "Lift"]);
    const cells = [...document.querySelectorAll("tbody tr")].map(
      (tr) => tr.children[1]?.textContent,
    );
    // the tray's short name in capitals, a dash for a plate, and a note for a part with no room
    // (the small tray is in the layer above: layer 2's table follows layer 1's)
    expect(cells).toEqual(["DECK", "—", "Too small for its name"]);
    const off = { ...deckProject(), settings: { ...deckProject().settings, engraveNames: false } };
    rerender(<AssemblyPage project={off} layout={withSpacer} onBack={vi.fn()} />);
    expect(screen.queryByText("Engraved as")).toBeNull();
  });

  it("refers to trays by name", () => {
    const project = { ...deckProject(), name: "Wing span" };
    const withExtras = makeLayout("h", [
      makeTray({ key: "a:p0:0", stack: 0, level: 0 }),
      makeTray({ key: "b:p0:0", stack: 0, level: 1, z: 40 }),
      makeTray({ key: "a:p0:0:spacer", part: "spacer", path: "", solid: true, compartments: [] }),
    ]);
    render(<AssemblyPage project={project} layout={withExtras} onBack={vi.fn()} />);
    // The tables call their first column "Name" and their rows by name, under their layer's heading.
    const names = (layerName: string): (string | null)[] =>
      [...screen.getByRole("region", { name: layerName }).querySelectorAll("tbody th")].map(
        (th) => th.textContent,
      );
    expect(names("Layer 1 (bottom)")).toEqual(["Deck A 1", "Spacer by Deck A 2"]);
    expect(names("Layer 2 (top)")).toEqual(["Deck A 2"]);
    expect(screen.getAllByRole("columnheader", { name: "Name" })).toHaveLength(2);
    expect(screen.queryByRole("columnheader", { name: "Tray" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Layer" })).toBeNull();
    // Nowhere does the page speak of a tray by its number, or call a tray a part.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/#\d|\b(tray|part) \d/i);
    expect(text).not.toMatch(/\bpart\b/i);
    for (const img of screen.getAllByRole("img")) {
      expect(img.getAttribute("alt")).not.toMatch(/#\d|\b(tray|part) \d/i);
    }
    // The pictures name the trays too: a name in capitals on each.
    const layerOne = decodeURIComponent(
      (screen.getAllByRole("img")[1] as HTMLImageElement).src.replace(/^[^,]*,/, ""),
    );
    expect(layerOne).toContain(">DECK 1<");
  });

  it("keeps the table's roles explicit, so the phone cards still read as a table", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    const table = screen.getAllByRole("table")[0] as HTMLElement;
    expect(table.getAttribute("role")).toBe("table");
    expect(table.querySelectorAll("thead[role=rowgroup], tbody[role=rowgroup]")).toHaveLength(2);
    expect([...table.querySelectorAll("tr")].every((tr) => tr.getAttribute("role") === "row")).toBe(
      true,
    );
    expect(table.querySelectorAll("th[role=columnheader]")).toHaveLength(6);
    expect(table.querySelectorAll("tbody th[role=rowheader]")).toHaveLength(1);
    expect(
      [...table.querySelectorAll("td")].every((td) => td.getAttribute("role") === "cell"),
    ).toBe(true);
  });

  it("keeps the toolbar and the buttons at 44 px and drops the toolbar from print", () => {
    expect(printCss).toMatch(/\.assembly button\s*\{[^}]*min-height:\s*var\(--control-h\)/);
    expect(printBlock).toMatch(/\.no-print[^{]*\{[^}]*display:\s*none/);
    // No sheets on paper, and the table's rows stay whole.
    expect(printBlock).toMatch(
      /\.assembly > section\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*none/,
    );
    expect(printBlock).toMatch(/\.parts-table tr\s*\{[^}]*break-inside:\s*avoid/);
  });

  it("leaves every screen-only control off the printed page, the kit's buttons included", () => {
    // Every button that is only for the screen carries `no-print`: the toolbar's two, the PNG ones.
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const b of buttons) {
      expect(b.closest(".no-print") ?? b.classList.contains("no-print")).toBeTruthy();
    }
    expect(screen.getAllByRole("button", { name: /^Download PNG/ })).toHaveLength(3);
    // The kit's `.k-btn` sets `display: inline-flex` at one class's weight, so a bare `.no-print`
    // lost to it and the download buttons printed: the rule must outweigh it.
    expect(printBlock).toMatch(/\.assembly \.no-print[^{]*\{[^}]*display:\s*none/);
    // The headers' page chrome is off too.
    expect(printBlock).toMatch(/\.ws-header[^{]*\{[^}]*display:\s*none/);
  });

  it("starts each layer on a page of its own in print, and repeats a long table's header", () => {
    expect(printBlock).toMatch(/\.assembly-layer ~ \.assembly-layer\s*\{[^}]*break-before:\s*page/);
    // After the exploded view the first layer starts a page too; with no exploded view it does not.
    expect(printBlock).toMatch(/\.assembly-exploded ~ \.assembly-layer/);
    expect(printBlock).toMatch(/\.parts-table thead\s*\{[^}]*display:\s*table-header-group/);
    expect(printBlock).toMatch(/\.assembly-layer__picture[^{]*\{[^}]*break-inside:\s*avoid/);
  });

  it("stacks the layers and the table rows on a phone, below 760 px", () => {
    const phone =
      /@media screen and \(width < 760px\)\s*\{([\s\S]*?)\n\}/.exec(printCss)?.[1] ?? "";
    expect(phone).toMatch(
      /\.assembly-layer__body\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
    expect(phone).toMatch(/\.parts-table tr\s*\{[^}]*display:\s*grid/);
    expect(phone).toMatch(/attr\(data-label\)/);
  });

  it("for a stale layout says so and offers no PNG or print, but still goes back", () => {
    const print = vi.fn();
    const onBack = vi.fn();
    render(
      <AssemblyPage project={deckProject()} layout={layout} onBack={onBack} print={print} stale />,
    );
    expect(screen.getByText(/The plan is out of date/)).toBeTruthy();
    const printButton = screen.getByRole("button", { name: "Print or save as PDF" });
    expect(printButton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(printButton);
    expect(print).not.toHaveBeenCalled();
    for (const b of screen.getAllByRole("button", { name: /^Download PNG/ })) {
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    fireEvent.click(screen.getByRole("button", { name: "Back to your insert" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows no stale hint for a current layout", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    expect(screen.queryByText(/out of date/)).toBeNull();
  });

  it("tells a reader the plan went out of date while the guide was open, in a region that was already there", () => {
    const view = render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("");
    view.rerender(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} stale />);
    expect(screen.getByRole("status")).toBe(live);
    expect(live.textContent).toMatch(/The plan is out of date/);
  });

  it("prints and goes back", () => {
    const print = vi.fn();
    const onBack = vi.fn();
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={onBack} print={print} />);
    fireEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to your insert" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("downloads a PNG per layer and reports failures", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const toPng = vi.fn(() => Promise.resolve(blob));
    const download = vi.fn();
    const project = { ...deckProject(), name: "Wing span" };
    const view = render(
      <AssemblyPage
        project={project}
        layout={layout}
        onBack={vi.fn()}
        toPng={toPng}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 2" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(blob, "Wing-span-layer-2.png"));
    view.unmount();
    render(
      <AssemblyPage
        project={project}
        layout={layout}
        onBack={vi.fn()}
        toPng={() => Promise.reject(new Error("canvas blocked"))}
        download={download}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 1" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/canvas blocked/));
  });

  it("disables the PNG buttons while one is being made, so one click downloads once", async () => {
    let finish: (b: Blob) => void = () => undefined;
    const toPng = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        }),
    );
    const download = vi.fn();
    render(
      <AssemblyPage
        project={deckProject()}
        layout={layout}
        onBack={vi.fn()}
        toPng={toPng}
        download={download}
      />,
    );
    const first = screen.getByRole("button", { name: "Download PNG of layer 1" });
    fireEvent.click(first);
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Download PNG of layer 2" }));
    expect(toPng).toHaveBeenCalledTimes(1);
    expect(first.getAttribute("aria-disabled")).toBe("true");
    finish(new Blob(["png"]));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(first.getAttribute("aria-disabled")).toBeNull());
  });

  it("says so when the layout has no trays instead of showing empty sections", () => {
    render(<AssemblyPage project={deckProject()} layout={makeLayout("h", [])} onBack={vi.fn()} />);
    expect(screen.getByRole("note").textContent).toMatch(/no trays/);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Back to your insert" })).toBeTruthy();
  });
});

describe("AssemblyPage for a group's trays (spec §7.7)", () => {
  const base = deckProject();
  const other: Component = {
    ...structuredClone(base.components[0] as Component),
    id: "hero0001",
    name: "Hero",
  };
  const deck = base.components[0] as Component;
  const project = {
    ...base,
    components: [deck, other],
    groups: [
      {
        id: "kit",
        name: "Player kit",
        copies: 2,
        access: "often" as const,
        memberIds: [deck.id, other.id],
      },
    ],
  };
  const well = (id: string, contents: string, x: number) => ({
    x,
    y: 2,
    w: 30,
    d: 30,
    floorZ: 1.2,
    kind: "well" as const,
    contents,
    componentId: id,
    features: [],
  });
  const kit = (n: number) =>
    makeTray({
      key: `kit:p${n}:0`,
      stack: n,
      x: n * 100,
      compartments: [well(deck.id, "Deck A ×12", 2), well(other.id, "Hero ×1", 40)],
    });
  const kitLayout = makeLayout("h", [kit(0), kit(1)]);

  it("reads Player kit 1 and 2 in the row names and the pictures, with Holds in tray order", () => {
    render(<AssemblyPage project={project} layout={kitLayout} onBack={vi.fn()} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("th")?.textContent)).toEqual([
      "Player kit 1",
      "Player kit 2",
    ]);
    for (const row of rows) {
      expect(row.querySelector('td[data-label="Holds"]')?.textContent).toBe("Deck A ×12, Hero ×1");
    }
    expect(screen.getByRole("img", { name: /^Layer 1 \(bottom\)/ }).getAttribute("alt")).toBe(
      "Layer 1 (bottom): trays Player kit 1, Player kit 2",
    );
    expect(document.body.textContent).not.toMatch(/\(P\d+\)/);
  });
});

describe("AssemblyPage: taking it out", () => {
  const cut: FeatureSpec = {
    type: "wallCutout",
    side: "left",
    at: 10,
    width: 18,
    depth: 12,
    floorNotch: 0,
  };
  const withCut = (over: Parameters<typeof makeTray>[0]) =>
    makeTray({
      compartments: [
        {
          x: 1.6,
          y: 1.6,
          w: 96.8,
          d: 76.8,
          floorZ: 1.2,
          kind: "well",
          contents: "Deck A ×40",
          features: [cut],
        },
      ],
      ...over,
    });
  const gripped = makeLayout("h", [
    withCut({ key: "a:p0:0", stack: 0, level: 0 }),
    withCut({ key: "b:p0:0", stack: 0, level: 1, z: 40 }),
  ]);
  const strip = makeTray({
    key: "leftover:0",
    part: "leftover",
    solid: true,
    compartments: [],
    stack: 9,
    x: 0,
    y: 80.2,
    w: 100,
    d: 10,
  });
  const flagged = makeLayout("h", [withCut({ key: "a:p0:0" }), strip]);
  const liftCells = () =>
    [...document.querySelectorAll('tbody td[data-label="Lift"]')].map((td) => td.textContent ?? "");

  it("adds a Lift column to each layer's table, one line a row", () => {
    render(<AssemblyPage project={deckProject()} layout={gripped} onBack={vi.fn()} />);
    const table = screen.getByRole("table", {
      name: "Layer 1 (bottom), in the order to put them in",
    });
    expect(screen.getAllByRole("columnheader", { name: "Lift" })).toHaveLength(2);
    expect(
      [...table.querySelectorAll("tbody tr")].map(
        (tr) => tr.querySelector("td:last-child")?.textContent,
      ),
    ).toEqual(["Lift it by the finger cut"]);
    expect(liftCells()).toEqual(["Lift it by the finger cut", "Lift it by the finger cut"]);
  });

  it("says once, above the layers, to start with the top layer and read each table from the last row up", () => {
    render(<AssemblyPage project={deckProject()} layout={gripped} onBack={vi.fn()} />);
    const note = document.querySelector(".assembly-takeout") as HTMLElement;
    expect(note.textContent).toBe(
      "Taking it out. Start with the top layer. Read its table from the last row up, then do the same for the layer below.",
    );
    // above the exploded view and the layers, and not a section of its own
    const sections = [...document.querySelectorAll(".assembly > *")];
    expect(sections.indexOf(note)).toBeLessThan(
      sections.indexOf(document.querySelector(".assembly-exploded") as Element),
    );
    expect(note.closest("section")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Taking it out/ })).toBeNull();
  });

  it("flags nothing, and adds no note, when every part has a grip", () => {
    render(<AssemblyPage project={deckProject()} layout={gripped} onBack={vi.fn()} />);
    expect(document.querySelector(".assembly-flag")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("flags a part with no grip of its own in its row and names it in one note above the layers", () => {
    render(<AssemblyPage project={deckProject()} layout={flagged} onBack={vi.fn()} />);
    const note = screen.getByRole("note");
    expect(note.textContent).toBe(
      "No grip of its own: Spacer by Deck A. Each needs something else out first.",
    );
    // the note comes before the first layer
    expect(
      note.compareDocumentPosition(document.querySelector(".assembly-layer") as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const rows = [...document.querySelectorAll("tbody tr")];
    const strip = rows.find((r) => r.querySelector("th")?.textContent === "Spacer by Deck A");
    const cell = strip?.querySelector('td[data-label="Lift"]') as HTMLElement;
    expect(cell.querySelector(".assembly-flag")?.textContent).toBe("No grip of its own");
    expect(cell.textContent).toBe("No grip of its own Take out Deck A first, then tip it out");
    expect(cell.getAttribute("data-grip")).toBe("none");
    // the tray beside it has a cut and carries no flag
    const tray = rows.find((r) => r.querySelector("th")?.textContent === "Deck A");
    expect(tray?.querySelector(".assembly-flag")).toBeNull();
  });

  it("lifts a tray with no finger cut by the chamfer on the strip beside it, and does not flag it", () => {
    // Deck A's finger cut is off; the strip beside it is 10 mm across, chamfered on both long edges
    const bare = makeTray({ key: "a:p0:0" });
    const thin = makeTray({
      key: "leftover:0",
      part: "leftover",
      solid: true,
      compartments: [],
      stack: 9,
      x: 100.2,
      y: 0,
      w: 10,
      d: 80,
      features: [
        { type: "topChamfer", side: "left", from: 0, to: 80, size: 4 },
        { type: "topChamfer", side: "right", from: 0, to: 80, size: 4 },
      ],
    });
    render(
      <AssemblyPage
        project={deckProject()}
        layout={makeLayout("h", [bare, thin])}
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.querySelector(".assembly-flag")).toBeNull();
    expect(liftCells().sort()).toEqual([
      "Lift it by the chamfer beside it",
      "Pinch it by its chamfered edges",
    ]);
    const rulings = COPY_RULINGS.filter(
      (r) => r.states === "all" || r.states.includes("packing-guide"),
    );
    expect(
      unruled(liftCells(), { literals: new Set(), rulings, data: new Set(), engine: new Set() }),
    ).toEqual([]);
  });

  it("flags in words, not in colour alone, and prints the flag as a black outline", () => {
    expect(printBlock).toMatch(/\.assembly-flag\s*\{[^}]*border:\s*1px solid #000/);
    expect(printBlock).toMatch(/\.assembly-takeout\s*\{[^}]*break-inside:\s*avoid/);
    expect(printCss).toMatch(/\.assembly-flag\s*\{[^}]*display:\s*block/);
  });

  it("keeps the flag and the line in one box of the phone's card", () => {
    render(<AssemblyPage project={deckProject()} layout={flagged} onBack={vi.fn()} />);
    for (const td of document.querySelectorAll('tbody td[data-label="Lift"]')) {
      expect(td.children).toHaveLength(1);
      expect(td.children[0]?.localName).toBe("span");
    }
  });

  it("says nothing of a lift when the guide has nothing to pack", () => {
    render(<AssemblyPage project={deckProject()} layout={makeLayout("h", [])} onBack={vi.fn()} />);
    expect(document.querySelector(".assembly-takeout")).toBeNull();
  });

  it("prints only words the copy rulings allow", () => {
    render(<AssemblyPage project={deckProject()} layout={flagged} onBack={vi.fn()} />);
    const strings = [
      ...liftCells().map((t) => t.replace(/^No grip of its own /, "")),
      ...[...document.querySelectorAll(".assembly-takeout p")].map((p) =>
        (p.textContent ?? "").replace(/^Taking it out\. /, ""),
      ),
      ...screen.getAllByRole("columnheader", { name: "Lift" }).map((th) => th.textContent ?? ""),
      "No grip of its own",
    ];
    const rulings = COPY_RULINGS.filter(
      (r) => r.states === "all" || r.states.includes("packing-guide"),
    );
    expect(rulings.length).toBeGreaterThan(8);
    expect(
      unruled(strings, { literals: new Set(), rulings, data: new Set(), engine: new Set() }),
    ).toEqual([]);
  });

  it("pinches the strip beside the Event cards by its chamfers, and flags the one spacer left without a grip", () => {
    const { project } = loadSeed("harbour-kings", true);
    const trays = printableParts(project.layout?.trays ?? [], {
      components: project.components,
      settings: project.settings,
      printer: project.printer,
      locks: project.locks,
    }).trays;
    render(
      <AssemblyPage
        project={project}
        layout={{ ...(project.layout as StoredLayout), trays }}
        onBack={vi.fn()}
      />,
    );
    // the spacer by Starter decks 1 is 7.4 mm of filler too thin for two chamfers: the page says so
    const flag = document.querySelector(".assembly-takeout__flag");
    expect(flag?.textContent).toContain("Spacer by Starter decks 1");
    expect(flag?.textContent).not.toContain("Spacer by Event cards");
    const top = screen.getByRole("region", { name: "Layer 2 (top)" });
    const lines = [...top.querySelectorAll("tbody tr")].map((tr) => [
      tr.querySelector("th")?.textContent,
      tr.querySelector('td[data-label="Lift"]')?.textContent,
    ]);
    expect(lines).toContainEqual(["Spacer by Event cards", "Pinch it by its chamfered edges"]);
    expect(lines).toContainEqual(["Event cards", "Lift it by the finger cut"]);
  });

  it("closes the guide with where the paper goes, after the last layer", () => {
    const project = deckProject();
    const paper = {
      area: 0,
      name: "Rulebook",
      x: 0,
      y: 0,
      w: 200,
      d: 120,
      z: 40,
    };
    const { container } = render(
      <AssemblyPage project={project} layout={{ ...layout, reserved: [paper] }} onBack={vi.fn()} />,
    );
    const step = screen.getByText(
      /^Lay the Rulebook \(200 × 120 mm, \d+(\.\d+)? mm thick\) flat on the trays in the front left corner\.$/,
    );
    const layers = [...container.querySelectorAll(".assembly-layer")];
    expect(layers.at(-1)?.compareDocumentPosition(step)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("says nothing of paper when no area is kept free", () => {
    render(<AssemblyPage project={deckProject()} layout={layout} onBack={vi.fn()} />);
    expect(screen.queryByText(/^Lay the /)).toBeNull();
  });
});
