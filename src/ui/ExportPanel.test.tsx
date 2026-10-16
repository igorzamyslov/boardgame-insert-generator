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
import type { LayoutSummary } from "../layout/types";
import type { Component, FeatureSpec } from "../model/types";
import css from "./export.css?raw";
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

const summary: LayoutSummary = {
  fillPct: 80,
  trayCount: 3,
  stackCount: 2,
  fillerCount: 0,
  mergeFillers: false,
  mergeRisers: false,
  filamentG: 210,
  filamentAtInfillG: 123.4,
  infillPct: 15,
  printMinutes: 14 * 60 + 5,
  longestPartMinutes: 200,
  playLimit: 1,
  playX: 0.4,
  playY: 0.4,
  crossX: 2,
  crossY: 1,
};

/** The two other file types sit behind "Other formats". */
function openOtherFormats(): void {
  fireEvent.click(screen.getByRole("button", { name: "Other formats" }));
}

const PER_PART = "Download 3MF per part (.zip)";
const STL = "Download STL files (.zip)";
const COMBINED = "Download 3MF";

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
    ...over,
  };
}

describe("ExportPanel", () => {
  it("downloads one combined 3MF by default", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    // One primary button, and the other formats are not on screen yet.
    expect(screen.queryByRole("button", { name: PER_PART })).toBeNull();
    const primary = screen.getByRole("button", { name: COMBINED });
    expect(primary.classList.contains("primary")).toBe(true);
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
    expect(await screen.findByText("Downloaded Wing-span.3mf.")).toBeTruthy();
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
    expect(screen.getByText("Support it")).toBeTruthy();
  });

  it("shows the parts, the filament and the print time as numbers", () => {
    const { container } = render(<ExportPanel {...props({ summary })} />);
    const facts = [...container.querySelectorAll(".export-facts > div")].map((d) => [
      d.querySelector("dt")?.textContent,
      d.querySelector("dd")?.textContent,
    ]);
    expect(facts).toEqual([
      ["Parts", "2"],
      ["Filament", "≈ 123 g"],
      ["Print time", "≈ 14 h"],
    ]);
    cleanup();
    const bare = render(<ExportPanel {...props()} />);
    expect(
      [...bare.container.querySelectorAll(".export-facts dt")].map((d) => d.textContent),
    ).toEqual(["Parts"]);
  });

  it("says nothing about slicers or what the files open in", () => {
    const { container } = render(<ExportPanel {...props({ summary })} />);
    openOtherFormats();
    expect(container.textContent).not.toMatch(/slicer|recommended|compatible|works with/i);
  });

  it("titles the dialog and focuses the title on mount", () => {
    render(<ExportPanel {...props()} titleId="export-title" />);
    const heading = screen.getByRole("heading", { name: "Download" });
    expect(heading.id).toBe("export-title");
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("opens the packing guide from its own button", () => {
    const onOpenGuide = vi.fn();
    render(<ExportPanel {...props({ onOpenGuide })} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the packing guide" }));
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
    cleanup();
    render(<ExportPanel {...props()} />);
    expect(screen.queryByRole("button", { name: "Open the packing guide" })).toBeNull();
  });

  it("keeps the packing guide closed while the plan is out of date", () => {
    const onOpenGuide = vi.fn();
    render(<ExportPanel {...props({ onOpenGuide, stale: true })} />);
    const guide = screen.getByRole("button", { name: "Open the packing guide" });
    expect(isOff(guide)).toBe(true);
    fireEvent.click(guide);
    expect(onOpenGuide).not.toHaveBeenCalled();
  });

  it("hides the other formats until asked, then lists each with a Download button", () => {
    render(<ExportPanel {...props()} />);
    const toggle = screen.getByRole("button", { name: "Other formats" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    openOtherFormats();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const per = screen.getByRole("button", { name: PER_PART });
    expect(per.textContent).toBe("Download");
    expect(screen.getByRole("button", { name: STL }).textContent).toBe("Download");
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: PER_PART })).toBeNull();
  });

  it("exports a zip of 3MF parts and lists the unsupported tray as not exported", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    expect(screen.getByRole("heading", { name: "Not exported" })).toBeTruthy();
    expect(screen.getByText(/^Magnets: Uses feature "magnet"/)).toBeTruthy();
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: PER_PART }));
    const stl = screen.getByRole("button", { name: STL });
    expect(isOff(stl)).toBe(true);
    const hint = document.getElementById(stl.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe("Available when the build finishes.");
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const [blob, name] = vi.mocked(p.download ?? vi.fn()).mock.calls[0] ?? [];
    expect(name).toBe("Wing-span-3mf-parts.zip");
    expect(blob).toBeInstanceOf(Blob);
    expect(p.meshes.get).toHaveBeenCalledTimes(2);
  });

  it("engraves each tray's short name and calls its file by its full name, never by a number", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
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
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: STL }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    const names = vi.mocked(p.download ?? vi.fn()).mock.calls.map((c) => c[1]);
    expect(names).toEqual(["Wing-span.3mf", "Wing-span-stl.zip"]);
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
    expect(screen.getByText(/^Deck A 2: .*compartments overlap/)).toBeTruthy();
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

  it("keeps every download off while the layout is not ready, and says why", async () => {
    const p = props({ disabled: true });
    render(<ExportPanel {...p} />);
    openOtherFormats();
    for (const name of [COMBINED, PER_PART, STL]) {
      const b = screen.getByRole("button", { name });
      expect(isOff(b)).toBe(true);
      fireEvent.click(b);
    }
    expect(screen.getByText("The plan is updating.")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    // Only the failed tray is forgotten: the cache the 3D view shares stays.
    expect(m.reset).not.toHaveBeenCalled();
    expect(m.forget).toHaveBeenCalledTimes(1);
    const [forgotten, forSettings] = m.forget.mock.calls[0] ?? [];
    expect(forgotten?.map((t) => t.key)).toEqual(["b:p0:0"]);
    expect(forSettings).toBe(DEFAULT_SETTINGS);
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/^Deck A 2: /)).toBeNull());
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
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
    m.get.mockImplementation(() =>
      Promise.reject(new GeometryBuildError("Tray x: compartments overlap", "TraySpecError")),
    );
    // Two trays fail, one export succeeds with none: use a mix so the export still downloads.
    m.get.mockImplementationOnce(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    expect(screen.getByText(/^Deck A 2: .*compartments overlap/)).toBeTruthy();
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "a:p0:0", stack: 0 }), magnet]} />);
    expect(screen.queryByText(/compartments overlap/)).toBeNull();
    expect(screen.getByText(/Magnets/)).toBeTruthy();
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
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("puts the focus back on Download when an export finishes under the focused Stop", async () => {
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
      expect(document.activeElement).toBe(screen.getByRole("button", { name: COMBINED })),
    );
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

  it("says what was downloaded, and only for the last download", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    await screen.findByText("Downloaded Wing-span.3mf.");
    openOtherFormats();
    fireEvent.click(screen.getByRole("button", { name: STL }));
    await screen.findByText("Downloaded Wing-span-stl.zip.");
    expect(screen.queryByText("Downloaded Wing-span.3mf.")).toBeNull();
    expect(screen.getAllByRole("status").some((s) => /Downloaded/.test(s.textContent ?? ""))).toBe(
      true,
    );
  });

  it("shows the build progress and ignores clicks on the busy buttons", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    openOtherFormats();
    // the live region is on the page before the build starts, and the Stop button is not in it
    const live = document.querySelector<HTMLElement>("[data-live='build']") as HTMLElement;
    expect(live.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: PER_PART }));
    await screen.findByRole("button", { name: "Stop" });
    expect(live.textContent).toBe("Building the files.");
    expect(live.contains(screen.getByRole("button", { name: "Stop" }))).toBe(false);
    expect(screen.getByText("Building 0 of 2").closest("[role=status]")).toBeNull();
    expect(screen.getByLabelText("Building the files").tagName).toBe("PROGRESS");
    const callsBefore = m.get.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    fireEvent.click(screen.getByRole("button", { name: PER_PART }));
    expect(m.get.mock.calls.length).toBe(callsBefore);
    for (const name of [COMBINED, PER_PART, STL]) {
      const b = screen.getByRole("button", { name });
      expect(isOff(b)).toBe(true);
      expect(b.hasAttribute("disabled")).toBe(false);
    }
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(isOff(screen.getByRole("button", { name: STL }))).toBe(false));
  });

  it("puts a failure in an error notice with Try again outside the alert", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed: oom")));
    render(<ExportPanel {...props({ meshes: m })} />);
    fireEvent.click(screen.getByRole("button", { name: COMBINED }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Error: Download failed: Geometry worker failed: oom");
    expect(alert.querySelector(".notice-level")?.textContent).toBe("Error:");
    const notice = alert.parentElement;
    expect(notice?.classList.contains("pf-notice--error")).toBe(true);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(notice?.contains(retry)).toBe(true);
    expect(alert.contains(retry)).toBe(false);
  });

  it("lists what was not exported by name, plainly, with one Try again for the failures", async () => {
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
    const section = container.querySelector(".export-failed");
    expect(section?.querySelector("h3")?.textContent).toBe("Not exported");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/^Spare by [\w ]+: /)).toBeTruthy();
    expect(screen.getByText(/^Magnets: Uses feature/)).toBeTruthy();
    // Plain and short: no count, no advice.
    expect(section?.textContent).not.toMatch(/weren't|skip|gap|warning/i);
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    expect(section?.contains(screen.getByRole("button", { name: "Try again" }))).toBe(true);
  });

  it("shows no Not exported list when everything can be exported", () => {
    render(<ExportPanel {...props({ trays: [makeTray({ key: "a:p0:0", stack: 0 })] })} />);
    expect(screen.queryByRole("heading", { name: "Not exported" })).toBeNull();
  });

  it("makes every control at least 44 px, and the dialog fill a phone", async () => {
    expect(css).toMatch(
      /\.export-panel button,\s*\.export-panel a\s*\{[^}]*min-width:\s*var\(--control-h\);[^}]*min-height:\s*var\(--control-h\)/,
    );
    const style = (await import("../style.css?raw")).default;
    expect(style).toMatch(/--control-h/);
    expect(style).toMatch(/@media \(width < 600px\)\s*\{\s*\.modal\s*\{[^}]*height:\s*100dvh/);
  });
});
