// src/ui/ExportPanel.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, fixtureProject, makeTray } from "../app/test-helpers";
import { GeometryBuildError } from "../geometry/client";
import type { TraySpec } from "../model/types";
import { DEFAULT_PRINTER } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Component, FeatureSpec } from "../model/types";
import { loadSeed } from "../test-support/harbourKings";
import css from "./export.css?raw";
import { shadeOf } from "./identity";
import { ExportPanel } from "./ExportPanel";
import type { ExportPanelProps } from "./ExportPanel";

afterEach(cleanup);

function meshes() {
  const get = vi.fn<MeshSource["get"]>(() =>
    Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
  );
  const reset = vi.fn();
  const forget = vi.fn<MeshSource["forget"]>();
  return { get, reset, forget, dispose: vi.fn() };
}

/** A build that never finishes by itself and rejects like the geometry client when aborted. */
const waitsForAbort: MeshSource["get"] = (_spec, _settings, signal) =>
  new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => {
      reject(new GeometryBuildError("cancelled", "AbortError"));
    });
  });

const magnet = makeTray({
  key: "m:p0:0",
  stack: 5,
  compartments: [
    {
      x: 2,
      y: 2,
      w: 9,
      d: 9,
      floorZ: 1.2,
      kind: "well",
      contents: "Magnets",
      features: [{ type: "magnet" } as unknown as FeatureSpec],
    },
  ],
});

/** The two components the trays hold, so the trays are named "Deck A 1", "Deck A 2" and "Magnets". */
const components: Component[] = ["Deck A", "Magnets"].map((name, i) => ({
  ...structuredClone(fixtureProject().components[0] as Component),
  id: `comp000${i}`,
  name,
}));

/** The total under the layer rows: it has its figure once every part is counted. */
const totalLine = (): string | null => document.querySelector(".export-total")?.textContent ?? null;
/** The grams of each layer's row: a space while the parts are counted, none when they cannot be. */
const layerGrams = (): string[] =>
  Array.from(document.querySelectorAll(".export-layer__grams"), (e) => e.textContent ?? "");
/** The tray pills of the print plan, in order. */
const chipsOf = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".export-chip"));

/** The two other file types sit behind "Other formats". */
function openOtherFormats(): void {
  fireEvent.click(screen.getByRole("button", { name: "Other formats" }));
}

/**
 * The panel counts the filament from the same meshes the export builds, asking for each part on
 * its own as it opens. Waits for the count to end and forgets those asks, so what a test counts
 * after it is the export's.
 */
async function counted(p: ExportPanelProps): Promise<void> {
  await waitFor(() => expect(totalLine()).toMatch(/^Total about/));
  vi.mocked(p.meshes.get).mockClear();
}

const PER_PART = "One 3MF per part (.zip)";
const STL = "STL files (.zip)";
const COMBINED = "Download the 3MF file";

/** The aria-disabled state a blocked or busy button shows. */
const isOff = (el: HTMLElement): boolean => el.getAttribute("aria-disabled") === "true";

function props(over: Partial<ExportPanelProps> = {}): ExportPanelProps {
  return {
    trays: [makeTray({ key: "a:p0:0", stack: 0 }), makeTray({ key: "b:p0:0", stack: 1 }), magnet],
    components,
    printer: DEFAULT_PRINTER,
    settings: DEFAULT_SETTINGS,
    meshes: meshes(),
    projectName: "Wing span",
    disabled: false,
    download: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

/** A plan's spacer: the part that is not a tray of its own. */
const spacer = makeTray({
  key: "a:p0:0:spacer",
  part: "spacer",
  path: "",
  solid: true,
  compartments: [],
});

/** What a failed or skipped part is shown in: a box with its name and reason. */
const problems = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".export-problem"),
];

describe("ExportPanel", () => {
  it("titles itself Ready to print and names what it holds", () => {
    const withSpacer = props({
      trays: [makeTray({ key: "a:p0:0", stack: 0 }), makeTray({ key: "b:p0:0", stack: 1 }), spacer],
      titleId: "export-title",
    });
    render(<ExportPanel {...withSpacer} />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Ready to print" });
    expect(h1.id).toBe("export-title");
    expect(h1.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(h1);
    // the dialog is named by it
    expect(screen.getByRole("dialog", { name: "Ready to print" })).toBeTruthy();
    expect(screen.queryByText(/for Wing span/)).toBeNull();
    expect(screen.getByText("Layer 1 · 2 trays")).toBeTruthy();
    cleanup();
    // the seed the boards are drawn with
    const { project } = loadSeed("harbour-kings");
    render(
      <ExportPanel
        {...props({
          trays: project.layout?.trays ?? [],
          components: project.components,
          projectName: project.name,
        })}
      />,
    );
    expect(screen.getByText(/^Layer 1 \(bottom\) · \d+ trays$/)).toBeTruthy();
    expect(screen.getByText(/^Layer 2 \(top\) · \d+ trays?$/)).toBeTruthy();
  });

  it("says a layer's trays in its own words, and its spacers when it has no tray", () => {
    render(<ExportPanel {...props()} />);
    expect(screen.getByText("Layer 1 · 2 trays")).toBeTruthy();
    cleanup();
    render(<ExportPanel {...props({ trays: [makeTray({ key: "a:p0:0", stack: 0 })] })} />);
    expect(screen.getByText("Layer 1 · 1 tray")).toBeTruthy();
    cleanup();
    render(<ExportPanel {...props({ trays: [spacer] })} />);
    expect(screen.getByText("Layer 1 · 1 spacer")).toBeTruthy();
    expect(chipsOf()).toHaveLength(0);
  });

  it("groups the parts by layer, bottom first, each with the grams on it", async () => {
    const trays = [
      makeTray({ key: "a:p0:0", stack: 0 }),
      makeTray({ key: "b:p0:0", stack: 1, level: 1 }),
      { ...spacer, level: 1 },
    ];
    render(<ExportPanel {...props({ trays })} />);
    const titles = Array.from(
      document.querySelectorAll(".export-layer__title"),
      (e) => e.textContent,
    );
    expect(titles).toEqual(["Layer 1 (bottom) · 1 tray", "Layer 2 (top) · 1 tray"]);
    await waitFor(() => expect(layerGrams().every((g) => /^about \d+ g$/.test(g))).toBe(true));
    expect(totalLine()).toMatch(/^Total about \d+ g · 1 spacer included$/);
  });

  it("folds the trays past the third into one + n pill that names them", () => {
    const trays = [0, 1, 2, 3, 4].map((i) => makeTray({ key: `a${i}:p0:0`, stack: i }));
    render(<ExportPanel {...props({ trays })} />);
    const chips = chipsOf();
    expect(chips.map((c) => c.textContent)).toEqual(["Deck A 1", "Deck A 2", "Deck A 3", "+ 2"]);
    expect(chips[3]?.getAttribute("title")).toBe("Deck A 4, Deck A 5");
    expect(chips[3]?.style.getPropertyValue("--shade-fill")).toBe("");
  });

  it("shows a pill per tray in its colour, and none for the spacers", () => {
    const trays = [
      makeTray({ key: "a:p0:0", stack: 0 }),
      makeTray({ key: "b:p0:0", stack: 1 }),
      spacer,
      { ...spacer, key: "b:p0:0:spacer" },
    ];
    render(<ExportPanel {...props({ trays })} />);
    const chips = chipsOf();
    expect(chips.map((c) => c.textContent)).toEqual(["Deck A 1", "Deck A 2"]);
    // a tray's pill takes its component's shade
    expect(chips[0]?.style.getPropertyValue("--shade-fill")).toMatch(/^light-dark\(#/);
    // the spacers are counted in the total line
    expect(screen.queryByText("2 spacers")).toBeNull();
  });

  it("gives a long tray name its whole text in a title and cuts it by CSS", () => {
    const long = "The Very Long Name Of A Card Deck Here 40";
    const named: Component[] = [{ ...(components[0] as Component), name: long }];
    const deck = makeTray({
      compartments: [
        {
          x: 1.6,
          y: 1.6,
          w: 96.8,
          d: 76.8,
          floorZ: 1.2,
          kind: "well",
          contents: `${long} ×40`,
          features: [],
        },
      ],
    });
    render(<ExportPanel {...props({ components: named, trays: [deck] })} />);
    const chip = chipsOf()[0] as HTMLElement;
    expect(chip.getAttribute("title")).toBe(long);
    expect(css).toMatch(/\.export-chip\s*\{[^}]*max-width:\s*100%/);
    expect(css).toMatch(/\.export-chip\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  it("shows the filament of the built parts per layer and in all, and no print time", async () => {
    render(<ExportPanel {...props()} />);
    // each layer's figure holds its place while the parts are counted
    expect(layerGrams()).toEqual(["\u00a0"]);
    expect(totalLine()).toBeNull();
    // two buildable parts, each a cube of 10 mm (1 000 mm³, 440 mm³ of shell at 15 % infill): 2 × 0.65 g
    await waitFor(() => expect(layerGrams()).toEqual(["about 1 g"]));
    expect(totalLine()).toBe("Total about 1 g");
    expect(screen.queryByText("Print time")).toBeNull();
    expect(screen.queryByText("Filament")).toBeNull();
    expect(document.body.textContent).not.toMatch(/≈|\bh\b|\bmin\b/);
  });

  it("asks for the meshes the export asks for, so counting the filament builds nothing twice", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    await waitFor(() => expect(layerGrams()).toEqual(["about 1 g"]));
    // the fit test's slices are counted too, but are not part of this file
    const notFit = (json: string): boolean => !json.includes('"key":"fit-');
    const counted = vi
      .mocked(p.meshes.get)
      .mock.calls.map(([spec]) => JSON.stringify(spec))
      .filter(notFit);
    vi.mocked(p.meshes.get).mockClear();
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByRole("heading", { level: 1, name: "All 2 parts are ready" });
    const exported = vi.mocked(p.meshes.get).mock.calls.map(([spec]) => JSON.stringify(spec));
    expect(exported).toEqual(counted);
  });

  it("downloads a fit test: one plate with a slice of each well, cut with its item's name", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    // quiet: no button in the body, one item in "Other formats"
    expect(screen.queryByRole("button", { name: /^Fit test print/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Other formats" }));
    fireEvent.click(screen.getByRole("button", { name: /^Fit test print/ }));
    await screen.findByRole("heading", { level: 1, name: "The fit test print is ready" });
    const name = vi.mocked(p.download ?? vi.fn()).mock.calls[0]?.[1];
    expect(name).toBe("Wing-span-fit-test.3mf");
    const asked = vi.mocked(p.meshes.get).mock.calls.map(([spec]) => spec);
    expect(
      asked.filter((s) => s.key.startsWith("fit-")).every((s) => s.partName !== undefined),
    ).toBe(true);
  });

  it("leaves the grams out when a part cannot be built", async () => {
    const m = meshes();
    m.get.mockImplementation(() =>
      Promise.reject(new GeometryBuildError("too slow", "TimeoutError")),
    );
    render(<ExportPanel {...props({ meshes: m })} />);
    expect(layerGrams()).toEqual(["\u00a0"]);
    await waitFor(() => expect(layerGrams()).toEqual([""]));
    expect(totalLine()).toBeNull();
  });

  it("downloads one combined 3MF by default", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    await counted(p);
    // One primary button, and the other formats are not on screen yet.
    expect(screen.queryByRole("button", { name: PER_PART })).toBeNull();
    const primary = screen.getByRole("button", { name: COMBINED });
    expect(primary.classList.contains("k-btn--primary")).toBe(true);
    expect(screen.queryByText(/^One file with all/)).toBeNull();
    fireEvent.click(primary);
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    const [blob, name] = vi.mocked(p.download ?? vi.fn()).mock.calls[0] ?? [];
    expect(name).toBe("Wing-span.3mf");
    expect((blob as Blob).type).toBe("model/3mf");
    // One file holding every printable part as a named object, never a numbered one.
    const zip = unzipSync(new Uint8Array(await (blob as Blob).arrayBuffer()));
    expect(Object.keys(zip)).toContain("3D/3dmodel.model");
    const model = new TextDecoder().decode(zip["3D/3dmodel.model"]);
    expect([...model.matchAll(/<object [^>]*name="([^"]*)"/g)].map((m) => m[1])).toEqual([
      "Deck A 1",
      "Deck A 2",
    ]);
    expect(model.match(/<item /g)).toHaveLength(2);
    expect(p.meshes.get).toHaveBeenCalledTimes(2);
    // the build is over: every part is ready, in one file, and there is no second download
    expect(
      await screen.findByRole("heading", { level: 1, name: "All 2 parts are ready" }),
    ).toBeTruthy();
    expect(screen.getByText("One file with every part.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: COMBINED })).toBeNull();
  });

  it("is done with a Back to the plan, and says the file's name for a screen reader", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    const back = await screen.findByRole("button", { name: "Back to the plan" });
    expect(back.classList.contains("k-btn--secondary")).toBe(true);
    expect(back.classList.contains("k-btn--dialog")).toBe(true);
    // the live region was on the page before it spoke
    expect(document.querySelector("[data-live='build']")?.textContent).toBe(
      "Downloaded Wing-span.3mf.",
    );
    fireEvent.click(back);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from its Close button", () => {
    const p = props();
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("support links open in a new tab", () => {
    render(<ExportPanel {...props()} />);
    const kofi = screen.getByRole("link", { name: /^Ko-fi/ });
    const paypal = screen.getByRole("link", { name: /^PayPal/ });
    expect(kofi.getAttribute("href")).toBe("https://ko-fi.com/igorzamyslov");
    expect(paypal.getAttribute("href")).toBe("https://paypal.me/igorzamyslov");
    for (const link of [kofi, paypal]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(screen.getByText(/^Support this tool/).tagName).toBe("P");
    // one quiet line of text: the support row is not a second call to action
    expect(kofi.classList.contains("k-btn")).toBe(false);
  });

  it("says nothing about slicers or what the files open in", () => {
    const { container } = render(<ExportPanel {...props()} />);
    openOtherFormats();
    expect(container.textContent).not.toMatch(/slicer|recommended|compatible|works with/i);
  });

  it("offers neither a report, a restart nor a download without the failed part", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new GeometryBuildError("too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    render(<ExportPanel {...props({ meshes: m })} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByRole("heading", { name: "Not exported" });
    expect(document.body.textContent).not.toMatch(/Copy a report|Start again|Download without/i);
  });

  it("opens the packing guide from its button", () => {
    const onOpenGuide = vi.fn();
    render(<ExportPanel {...props({ onOpenGuide })} />);
    const card = screen.getByRole("button", { name: /^Packing guide/ });
    expect(card.textContent).toBe("Packing guide");
    fireEvent.click(card);
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
    cleanup();
    render(<ExportPanel {...props()} />);
    expect(screen.queryByRole("button", { name: /^Packing guide/ })).toBeNull();
  });

  it("keeps the packing guide closed while the plan is out of date", () => {
    const onOpenGuide = vi.fn();
    render(<ExportPanel {...props({ onOpenGuide, stale: true })} />);
    const guide = screen.getByRole("button", { name: /^Packing guide/ });
    expect(isOff(guide)).toBe(true);
    expect(document.getElementById(guide.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Make a new plan first.",
    );
    fireEvent.click(guide);
    expect(onOpenGuide).not.toHaveBeenCalled();
  });

  it("hides the other formats until asked, then offers each as a button", () => {
    render(<ExportPanel {...props()} />);
    const toggle = screen.getByRole("button", { name: "Other formats" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    openOtherFormats();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("button", { name: PER_PART }).classList.contains("k-btn--secondary"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: STL })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: PER_PART })).toBeNull();
  });

  it("exports a zip of 3MF parts and lists the unsupported tray as not exported", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    await counted(p);
    expect(screen.getByRole("heading", { level: 2, name: "Not exported" })).toBeTruthy();
    expect(screen.getByText(/^Magnets: Uses feature "magnet"/)).toBeTruthy();
    // nothing to try again: the part is not one the files can hold
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: PER_PART }));
    // while it builds there is only the bar and Stop
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: STL })).toBeNull();
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const [blob, name] = vi.mocked(p.download ?? vi.fn()).mock.calls[0] ?? [];
    expect(name).toBe("Wing-span-3mf-parts.zip");
    expect(blob).toBeInstanceOf(Blob);
    expect(p.meshes.get).toHaveBeenCalledTimes(2);
    // a zip is not "one file with every part": it says what was downloaded
    await screen.findByRole("heading", { level: 1, name: "All 2 parts are ready" });
    expect(document.querySelector(".export-sub")?.textContent).toBe(
      "Downloaded Wing-span-3mf-parts.zip.",
    );
  });

  it("engraves each tray's short name and calls its file by its full name, never by a number", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    await counted(p);
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: PER_PART }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const asked = vi.mocked(p.meshes.get).mock.calls.map(([spec]) => [spec.key, spec.partName]);
    expect(asked).toEqual([
      ["a:p0:0", "Deck 1"],
      ["b:p0:0", "Deck 2"],
    ]);
    const [blob] = vi.mocked(p.download ?? vi.fn()).mock.calls[0] ?? [];
    const zip = unzipSync(new Uint8Array(await (blob as Blob).arrayBuffer()));
    expect(Object.keys(zip)).toEqual(["Deck-A-1.3mf", "Deck-A-2.3mf"]);
    cleanup();
    const off = props({ settings: { ...DEFAULT_SETTINGS, engraveNames: false }, meshes: meshes() });
    render(<ExportPanel {...off} />);
    await counted(off);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(off.download).toHaveBeenCalled());
    expect(
      vi.mocked(off.meshes.get).mock.calls.every(([spec]) => spec.partName === undefined),
    ).toBe(true);
  });

  it("says nothing about parts too small to carry their name", () => {
    const tiny = makeTray({ key: "s1:p0:0", stack: 1, w: 4, d: 4, h: 30, compartments: [] });
    const { container } = render(
      <ExportPanel {...props({ trays: [makeTray({ key: "a:p0:0", stack: 0 }), tiny] })} />,
    );
    expect(container.textContent).not.toMatch(/too small/);
  });

  it("exports the STL zip from Other formats", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: STL }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    expect(vi.mocked(p.download ?? vi.fn()).mock.calls.map((c) => c[1])).toEqual([
      "Wing-span-stl.zip",
    ]);
  });

  it("lists a tray whose build fails by name and still downloads the rest", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(
            new GeometryBuildError("Tray b:p0:0: compartments overlap", "TraySpecError"),
          )
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    expect(
      await screen.findByRole("heading", { level: 1, name: "1 of 2 parts are ready" }),
    ).toBeTruthy();
    expect(screen.getByText(/^Deck A 2: .*compartments overlap/)).toBeTruthy();
    // the file is downloaded: this is not the done phase, and it has no second download
    expect(screen.queryByRole("button", { name: "Back to the plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: COMBINED })).toBeNull();
  });

  it("shows a worker failure with Try again", async () => {
    const m = meshes();
    m.get.mockImplementation(() =>
      Promise.reject(new Error("Geometry worker failed: out of memory")),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/out of memory/));
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(m.reset).toHaveBeenCalled();
    await waitFor(() => expect(p.download).toHaveBeenCalled());
  });

  it("counts the filament again on Try again: the count's failure is not final", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed")));
    render(<ExportPanel {...props({ meshes: m })} />);
    await waitFor(() => expect(layerGrams()).toEqual([""]));
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/worker failed/));
    // the next builds stay open (still being counted), so the tile is back while they run
    m.get.mockImplementation(waitsForAbort);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(layerGrams()).toEqual(["\u00a0"]);
  });

  it("builds nothing for the filament tile while the plan is out of date", async () => {
    const p = props({ stale: true });
    render(<ExportPanel {...p} />);
    await Promise.resolve();
    await Promise.resolve();
    expect(p.meshes.get).not.toHaveBeenCalled();
  });

  it("keeps every download off while the layout is not ready, and says why", async () => {
    const p = props({ disabled: true });
    render(<ExportPanel {...p} />);
    await counted(p);
    openOtherFormats();
    for (const name of [COMBINED, PER_PART, STL]) {
      const b = screen.getByRole("button", { name });
      expect(isOff(b)).toBe(true);
      fireEvent.click(b);
    }
    expect(screen.getByText("The plan is updating.")).toBeTruthy();
    // the reason takes the caption's place: one line under the primary
    expect(screen.queryByText(/^One file with all/)).toBeNull();
    expect(p.meshes.get).not.toHaveBeenCalled();
    expect(p.download).not.toHaveBeenCalled();
  });

  it("blocks every download of a stale layout and says why", () => {
    render(<ExportPanel {...props({ stale: true })} />);
    openOtherFormats();
    for (const name of [COMBINED, PER_PART, STL]) {
      expect(isOff(screen.getByRole("button", { name }))).toBe(true);
    }
    const primary = screen.getByRole("button", { name: COMBINED });
    const reason = document.getElementById(primary.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Make a new plan first.");
  });

  it("offers the downloads again once the layout is current", () => {
    const view = render(<ExportPanel {...props({ stale: true })} />);
    view.rerender(<ExportPanel {...props({ stale: false })} />);
    openOtherFormats();
    expect(isOff(screen.getByRole("button", { name: STL }))).toBe(false);
    expect(screen.queryByText("Make a new plan first.")).toBeNull();
    expect(
      screen.getByRole("button", { name: COMBINED }).getAttribute("aria-describedby"),
    ).toBeNull();
  });

  it("keeps Try again off for a stale layout", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "a:p0:0"
        ? Promise.reject(new GeometryBuildError("boom", "WorkerError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }),
    );
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    const retry = await screen.findByRole("button", { name: "Try again" });
    view.rerender(<ExportPanel {...p} stale />);
    expect(isOff(retry)).toBe(true);
    // the reason is read with the button
    expect(document.getElementById(retry.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Make a new plan first.",
    );
    fireEvent.click(retry);
    expect(m.forget).not.toHaveBeenCalled();
  });

  it("stops an export under way: nothing is downloaded and the buttons come back", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    expect(m.get.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(isOff(screen.getByRole("button", { name: COMBINED }))).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Ready to print" })).toBeTruthy();
    expect(p.download).not.toHaveBeenCalled();
  });

  it("aborts the export when the panel goes away", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    act(() => {
      view.unmount();
    });
    expect(m.get.mock.calls[0]?.[2]?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.download).not.toHaveBeenCalled();
  });

  it("tries the failed trays again from the Not exported list", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new GeometryBuildError("Tray b:p0:0: too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    // Only the failed tray is forgotten: the cache the 3D view shares stays.
    expect(m.reset).not.toHaveBeenCalled();
    expect(m.forget).toHaveBeenCalledTimes(1);
    const [forgotten, forSettings] = m.forget.mock.calls[0] ?? [];
    expect(forgotten?.map((t) => t.key)).toEqual(["b:p0:0"]);
    expect(forSettings).toBe(DEFAULT_SETTINGS);
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/^Deck A 2: /)).toBeNull());
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "All 2 parts are ready" })).toBeTruthy();
    // the tray the files cannot hold stays listed
    expect(screen.getByText(/^Magnets: /)).toBeTruthy();
  });

  it("forgets the spec it built, with the engraved name, so Try again builds once more", async () => {
    const m = meshes();
    const built: TraySpec[] = [];
    m.get.mockImplementation((spec) => {
      built.push(spec);
      return spec.key === "b:p0:0"
        ? Promise.reject(new GeometryBuildError("Tray b:p0:0: too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 });
    });
    const settings = { ...DEFAULT_SETTINGS, engraveNames: true };
    render(<ExportPanel {...props({ meshes: m, settings })} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    const tried = built.find((s) => s.key === "b:p0:0");
    // With engraving on, the cache key is made from the spec with its name.
    expect(tried?.partName).toBeTruthy();
    const [forgotten] = m.forget.mock.calls[0] ?? [];
    expect(forgotten).toEqual([tried]);
  });

  it("tries again with the format that failed", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new GeometryBuildError("too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: STL }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    expect(vi.mocked(p.download ?? vi.fn()).mock.calls.map((c) => c[1])).toEqual([
      "Wing-span-stl.zip",
      "Wing-span-stl.zip",
    ]);
  });

  it("keeps Try again off while the layout is not ready", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed: oom")));
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    view.rerender(<ExportPanel {...p} disabled />);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(isOff(retry)).toBe(true);
    expect(document.getElementById(retry.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "The plan is updating.",
    );
  });

  it("forgets the failed trays when the layout changes", async () => {
    const m = meshes();
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    await counted(p);
    m.get.mockImplementation(() =>
      Promise.reject(new GeometryBuildError("Tray x: compartments overlap", "TraySpecError")),
    );
    // Two trays fail, one export succeeds with none: use a mix so the export still downloads.
    m.get.mockImplementationOnce(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    expect(await screen.findByText(/^Deck A 2: .*compartments overlap/)).toBeTruthy();
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "a:p0:0", stack: 0 }), magnet]} />);
    expect(screen.queryByText(/compartments overlap/)).toBeNull();
    expect(screen.getByText(/Magnets/)).toBeTruthy();
    // the panel is where it began
    expect(screen.getByRole("heading", { level: 1, name: "Ready to print" })).toBeTruthy();
  });

  it("puts the focus back on Download when Stop goes away", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    render(<ExportPanel {...props({ meshes: m })} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    const stop = await screen.findByRole("button", { name: "Stop" });
    stop.focus();
    fireEvent.click(stop);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: COMBINED }));
  });

  it("drops a running export when the layout changes", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />);
    expect(m.get.mock.calls[0]?.[2]?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    expect(isOff(screen.getByRole("button", { name: COMBINED }))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.download).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    // Only the unsupported tray is listed: no failure of the old plan came back.
    expect(problems()).toHaveLength(1);
  });

  it("puts the focus on Back to the plan when an export finishes under the focused Stop", async () => {
    const m = meshes();
    let finish: () => void = () => undefined;
    m.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ mesh: cubeMesh(), volumeMm3: 1000 });
        }),
    );
    const p = props({ meshes: m, trays: [makeTray({ key: "a:p0:0", stack: 0 })] });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    (await screen.findByRole("button", { name: "Stop" })).focus();
    finish();
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    // Effects run after the DOM update: wait for the hand-over.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to the plan" })),
    );
  });

  it("puts the focus on the first Try again when an export finishes with a failed part", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new GeometryBuildError("too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    render(<ExportPanel {...props({ meshes: m })} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    (await screen.findByRole("button", { name: "Stop" })).focus();
    const retry = await screen.findByRole("button", { name: "Try again" });
    await waitFor(() => expect(document.activeElement).toBe(retry));
  });

  it("puts the focus back on Download when a layout change drops the focused Stop", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    (await screen.findByRole("button", { name: "Stop" })).focus();
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: COMBINED })),
    );
  });

  it("leaves the focus alone when Stop did not have it", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(
      <>
        <input aria-label="elsewhere" />
        <ExportPanel {...p} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByRole("button", { name: "Stop" });
    const elsewhere = screen.getByLabelText("elsewhere");
    elsewhere.focus();
    view.rerender(
      <>
        <input aria-label="elsewhere" />
        <ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />
      </>,
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stop" })).toBeNull());
    expect(document.activeElement).toBe(elsewhere);
  });

  it("clears an export error when the layout changes", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed: oom")));
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/oom/));
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says what was downloaded to a screen reader, only for the last download", async () => {
    const p = props();
    const view = render(<ExportPanel {...p} />);
    const live = document.querySelector<HTMLElement>("[data-live='build']") as HTMLElement;
    expect(live.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByRole("heading", { name: /parts are ready$/ });
    expect(live.textContent).toBe("Downloaded Wing-span.3mf.");
    // another plan: what was downloaded was for the old one
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />);
    expect(live.textContent).toBe("");
  });

  it("shows progress and Stop while building, and the ready controls give way", async () => {
    const m = meshes();
    let release: () => void = () => undefined;
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    await counted(p);
    m.get
      .mockImplementationOnce(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }))
      .mockImplementation(
        (_spec, _settings, signal) =>
          new Promise((resolve, reject) => {
            release = () => resolve({ mesh: cubeMesh(), volumeMm3: 1000 });
            signal?.addEventListener("abort", () =>
              reject(new GeometryBuildError("c", "AbortError")),
            );
          }),
      );
    // the live region is on the page before the build starts, and the Stop button is not in it
    const live = document.querySelector<HTMLElement>("[data-live='build']") as HTMLElement;
    expect(live.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Building your print file",
    });
    expect(heading.getAttribute("style")).toBeNull();
    expect(live.textContent).toBe("Building the files.");
    expect(live.contains(screen.getByRole("button", { name: "Stop" }))).toBe(false);
    await screen.findByText("1 of 2 parts built");
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    // nothing else is offered while it builds
    for (const name of [COMBINED, "Other formats", /^Packing guide/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    await waitFor(() => expect(m.get).toHaveBeenCalledTimes(2));
    release();
    await screen.findByRole("heading", { level: 1, name: "All 2 parts are ready" });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("puts a failure in a box with Try again outside the alert", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed: oom")));
    render(<ExportPanel {...props({ meshes: m })} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Error: Download failed: Geometry worker failed: oom");
    expect(alert.querySelector(".notice-level")?.textContent).toBe("Error:");
    const box = alert.parentElement;
    expect(box?.classList.contains("export-problem")).toBe(true);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(box?.contains(retry)).toBe(true);
    expect(alert.contains(retry)).toBe(false);
  });

  it("lists what was not exported by name, plainly, with one Try again under the boxes", async () => {
    const spare = makeTray({ key: "s:p0:0", stack: 2, part: "leftover" });
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "s:p0:0"
        ? Promise.reject(new GeometryBuildError("too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const p = props({ meshes: m, trays: [makeTray({ key: "a:p0:0", stack: 0 }), spare, magnet] });
    const { container } = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const section = (await screen.findByRole("heading", { level: 2, name: "Not exported" }))
      .parentElement as HTMLElement;
    expect(section.classList.contains("export-failed")).toBe(true);
    expect(container.querySelectorAll(".export-failed")).toHaveLength(1);
    expect(problems()).toHaveLength(2);
    expect(screen.getByText(/^Spare by [\w ]+: /)).toBeTruthy();
    expect(screen.getByText(/^Magnets: Uses feature/)).toBeTruthy();
    // Plain and short: no count, no advice.
    expect(section.textContent).not.toMatch(/weren't|skip|gap|warning|bug/i);
    // ONE Try again (it rebuilds the whole file), after the boxes, in no box; the skipped tray has none
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    expect(problems().some((box) => box.contains(retry))).toBe(false);
    expect(section.contains(retry)).toBe(true);
    expect(section.lastElementChild).toBe(retry);
  });

  it("gives two failed parts one Try again, not one each", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "a:p0:0" || spec.key === "b:p0:0"
        ? Promise.reject(new GeometryBuildError("too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const trays = [
      makeTray({ key: "a:p0:0", stack: 0 }),
      makeTray({ key: "b:p0:0", stack: 1 }),
      makeTray({ key: "c:p0:0", stack: 2 }),
    ];
    render(<ExportPanel {...props({ meshes: m, trays })} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByRole("heading", { level: 1, name: "1 of 3 parts are ready" });
    expect(problems()).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
  });

  it("shows a tray the files cannot hold as a plain note once every part is ready", async () => {
    render(<ExportPanel {...props()} />);
    // before the build: a box, as the list is the news
    expect(problems()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByRole("heading", { level: 1, name: "All 2 parts are ready" });
    expect(problems()).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Not exported" })).toBeNull();
    const note = document.querySelector(".export-note") as HTMLElement;
    expect(note.textContent).toMatch(/^Not exported/);
    expect(note.textContent).toMatch(/Magnets: Uses feature "magnet"/);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("moves the focus to Stop when Download goes away under a keyboard user", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    render(<ExportPanel {...props({ meshes: m })} />);
    const download = screen.getByRole("button", { name: COMBINED });
    download.focus();
    expect(document.activeElement).toBe(download);
    // Enter on a button is a click
    fireEvent.click(download);
    expect(download.isConnected).toBe(false);
    const stop = await screen.findByRole("button", { name: "Stop" });
    await waitFor(() => expect(document.activeElement).toBe(stop));
  });

  it("does not take the focus from elsewhere when the build starts", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    render(
      <>
        <input aria-label="elsewhere" />
        <ExportPanel {...props({ meshes: m })} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByRole("button", { name: "Stop" });
    const elsewhere = screen.getByLabelText("elsewhere");
    elsewhere.focus();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(elsewhere);
  });

  it("shows no Not exported list when everything can be exported", () => {
    render(<ExportPanel {...props({ trays: [makeTray({ key: "a:p0:0", stack: 0 })] })} />);
    expect(screen.queryByRole("heading", { name: "Not exported" })).toBeNull();
  });

  describe("on a phone", () => {
    it("has the bar with Close, the title block, Send file and the foot with Download", () => {
      const onSendFile = vi.fn();
      const p = props({ phone: true, onSendFile, onOpenGuide: vi.fn() });
      render(<ExportPanel {...p} />);
      const dialog = screen.getByRole("dialog", { name: "Ready to print" });
      expect(dialog.classList.contains("export-dialog--phone")).toBe(true);
      const send = screen.getByRole("button", { name: "Send file" });
      expect(send.classList.contains("k-btn--secondary")).toBe(true);
      fireEvent.click(send);
      expect(onSendFile).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: /^Packing guide/ }).textContent).toBe(
        "Packing guide",
      );
      // the primary and its caption are in the fixed foot, after everything else
      const foot = dialog.querySelector(".export-foot") as HTMLElement;
      expect(foot.contains(screen.getByRole("button", { name: COMBINED }))).toBe(true);
      expect(foot.previousElementSibling?.classList.contains("export-body")).toBe(true);
      // Close is in the bar above the title block
      const bar = dialog.querySelector(".export-bar") as HTMLElement;
      expect(bar.contains(screen.getByRole("button", { name: "Close" }))).toBe(true);
    });

    it("leaves Send file out of a desktop's dialog", () => {
      render(<ExportPanel {...props({ onSendFile: vi.fn() })} />);
      expect(screen.queryByRole("button", { name: "Send file" })).toBeNull();
    });
  });

  it("makes every control at least 44 px, and the dialog fill a phone", async () => {
    // the buttons are the kit's (44 px, 48 and 54 for the cta); the one of its own is the support
    // line's links, 20 px of text with a hit area that makes them 44
    expect(css).toMatch(/\.export-support a::before\s*\{[^}]*inset:\s*-12px -4px/);
    expect(css).toMatch(/\.export-problem__retry::before\s*\{[^}]*inset:\s*-2px 0/);
    const kit = (await import("../kit/kit.css?raw")).default;
    expect(kit).toMatch(
      /@media \(width < 600px\)\s*\{\s*\.k-dialog,\s*\.k-drawer\s*\{[^}]*height:\s*100dvh/,
    );
    const style = (await import("../style.css?raw")).default;
    expect(style).toMatch(/--control-h/);
  });
});

describe("ExportPanel for a group's trays", () => {
  const kit = {
    id: "kit",
    name: "Player kit",
    copies: 2,
    access: "often" as const,
    memberIds: ["comp0000", "comp0001"],
  };
  const well = (id: string, contents: string) => ({
    x: 2,
    y: 2,
    w: 20,
    d: 20,
    floorZ: 1.2,
    kind: "well" as const,
    contents,
    componentId: id,
    features: [],
  });
  const copy = (n: number) =>
    makeTray({
      key: `kit:p${n}:0`,
      stack: n,
      compartments: [well("comp0000", "Deck A ×10"), well("comp0001", "Magnets ×4")],
    });
  const hex = { ...(components[0] as Component), id: "comp0002", name: "Hex tiles" };
  const own = makeTray({
    key: "own:p0:0",
    stack: 5,
    compartments: [well("comp0002", "Hex tiles ×5")],
  });
  const asked = () =>
    props({ trays: [copy(0), copy(1), own], groups: [kit], components: [...components, hex] });

  it("lists a chip per copy, named by the group, in its group's hue", () => {
    render(<ExportPanel {...asked()} />);
    const chips = chipsOf();
    expect(chips.map((c) => c.textContent)).toEqual(["Player kit 1", "Player kit 2", "Hex tiles"]);
    const neutral = shadeOf("group", 0);
    // (the one group is the project's first: its hue is the first)
    for (const chip of chips.slice(0, 2)) {
      expect(chip.style.getPropertyValue("--shade-fill")).toBe(neutral.fill);
      expect(chip.style.getPropertyValue("--shade-line")).toBe(neutral.line);
      expect(chip.style.getPropertyValue("--shade-ink")).toBe(neutral.ink);
      expect(chip.getAttribute("data-group")).toBe("true");
    }
    // an ungrouped tray's chip is still its kind's colour
    expect(chips[2]?.getAttribute("data-group")).toBeNull();
    expect(chips[2]?.style.getPropertyValue("--shade-fill")).not.toBe(neutral.fill);
  });

  it("draws the group's chip with a line of its own, so it shows on the sheet", () => {
    expect(css).toMatch(
      /\.export-chip\[data-group="true"\]\s*\{[^}]*border:\s*1\.5px solid var\(--shade-line/,
    );
  });

  it("calls each copy's file by the group's name, and engraves its short name", async () => {
    const p = asked();
    render(<ExportPanel {...p} />);
    await counted(p);
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: PER_PART }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const [blob] = vi.mocked(p.download ?? vi.fn()).mock.calls[0] ?? [];
    const zip = unzipSync(new Uint8Array(await (blob as Blob).arrayBuffer()));
    expect(Object.keys(zip)).toEqual(["Player-kit-1.3mf", "Player-kit-2.3mf", "Hex-tiles.3mf"]);
    const engraved = vi.mocked(p.meshes.get).mock.calls.map(([spec]) => spec.partName);
    expect(engraved).toEqual(["Player 1", "Player 2", "Hex"]);
  });
});
