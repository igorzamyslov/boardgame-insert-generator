// src/ui/ExportPanel.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, fixtureProject, makeTray } from "../app/test-helpers";
import { GeometryBuildError } from "../geometry/client";
import { DEFAULT_PRINTER } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Component, FeatureSpec } from "../model/types";
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
  it("exports a zip of 3MF parts and lists the unsupported tray", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    expect(screen.getByText(/^Magnets: Uses feature "magnet"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    const stl = screen.getByRole("button", { name: "STL files (.zip)" });
    expect(stl.getAttribute("aria-disabled")).toBe("true");
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
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
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
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(off.download).toHaveBeenCalled());
    expect(
      vi.mocked(off.meshes.get).mock.calls.every(([spec]) => spec.partName === undefined),
    ).toBe(true);
  });

  it("says once how many parts are too small to carry their name, only while engraving is on", () => {
    const tiny = (key: string, stack: number) =>
      makeTray({ key, stack, w: 4, d: 4, h: 30, compartments: [] });
    const trays = [makeTray({ key: "a:p0:0", stack: 0 }), tiny("s1:p0:0", 1), tiny("s2:p0:0", 2)];
    const { container } = render(<ExportPanel {...props({ trays })} />);
    expect(container.textContent).toContain(
      "2 parts are too small to carry their name; the packing guide lists them.",
    );
    cleanup();
    const one = render(<ExportPanel {...props({ trays: trays.slice(0, 2) })} />);
    expect(one.container.textContent).toContain(
      "1 part is too small to carry its name; the packing guide lists it.",
    );
    cleanup();
    // nothing to say when every part has room, or when nothing is engraved
    const roomy = render(<ExportPanel {...props()} />);
    expect(roomy.container.textContent).not.toMatch(/too small to carry/);
    cleanup();
    const off = render(
      <ExportPanel {...props({ trays, settings: { ...DEFAULT_SETTINGS, engraveNames: false } })} />,
    );
    expect(off.container.textContent).not.toMatch(/too small to carry/);
  });

  it("exports the combined 3MF and the STL zip", async () => {
    const p = props();
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "One combined 3MF" }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    const names = vi.mocked(p.download ?? vi.fn()).mock.calls.map((c) => c[1]);
    expect(names).toEqual(["Wing-span.3mf", "Wing-span-stl.zip"]);
  });

  it("lists a tray whose build fails and still exports the rest", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    expect(screen.getByText(/^Deck A 2: .*compartments overlap/)).toBeTruthy();
  });

  it("shows a worker failure with Retry", async () => {
    const m = meshes();
    m.get.mockImplementation(() =>
      Promise.reject(new Error("Geometry worker failed: out of memory")),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/out of memory/));
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(m.reset).toHaveBeenCalled();
    await waitFor(() => expect(p.download).toHaveBeenCalled());
  });

  it("disables everything while the layout is not ready", () => {
    render(<ExportPanel {...props({ disabled: true })} />);
    for (const name of ["3MF per part (.zip)", "One combined 3MF", "STL files (.zip)"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });

  it("blocks every export of a stale layout and says why", () => {
    render(<ExportPanel {...props({ stale: true })} />);
    for (const name of ["3MF per part (.zip)", "One combined 3MF", "STL files (.zip)"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByText("Inputs changed — update the plan before exporting.")).toBeTruthy();
  });

  it("offers the exports again once the layout is current", () => {
    const view = render(<ExportPanel {...props({ stale: true })} />);
    view.rerender(<ExportPanel {...props({ stale: false })} />);
    expect(screen.getByRole("button", { name: "STL files (.zip)" }).hasAttribute("disabled")).toBe(
      false,
    );
    expect(screen.queryByText(/update the plan before exporting/)).toBeNull();
  });

  it("disables Retry and Retry failed trays for a stale layout", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "a:p0:0"
        ? Promise.reject(new GeometryBuildError("boom", "WorkerError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 }),
    );
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    const retry = await screen.findByRole("button", { name: "Retry failed trays" });
    view.rerender(<ExportPanel {...p} stale />);
    expect(retry.hasAttribute("disabled")).toBe(true);
  });

  it("cancels an export under way: nothing is downloaded and the buttons come back", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    expect(m.get.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "3MF per part (.zip)" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(p.download).not.toHaveBeenCalled();
  });

  it("aborts the export when the panel goes away", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    act(() => {
      view.unmount();
    });
    expect(m.get.mock.calls[0]?.[2]?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.download).not.toHaveBeenCalled();
  });

  it("retries the failed trays from the Not exported list", async () => {
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "b:p0:0"
        ? Promise.reject(new GeometryBuildError("Tray b:p0:0: too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(1));
    m.get.mockImplementation(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }));
    fireEvent.click(screen.getByRole("button", { name: "Retry failed trays" }));
    // Only the failed tray is forgotten: the cache the 3D view shares stays.
    expect(m.reset).not.toHaveBeenCalled();
    expect(m.forget).toHaveBeenCalledTimes(1);
    const [forgotten, forSettings] = m.forget.mock.calls[0] ?? [];
    expect(forgotten?.map((t) => t.key)).toEqual(["b:p0:0"]);
    expect(forSettings).toBe(DEFAULT_SETTINGS);
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/^Deck A 2: .*took too long/)).toBeNull());
    expect(screen.queryByRole("button", { name: "Retry failed trays" })).toBeNull();
    expect(screen.getByText(/^Magnets: /)).toBeTruthy();
  });

  it("disables Retry while the layout is not ready", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed: oom")));
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    view.rerender(<ExportPanel {...p} disabled />);
    expect(screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled")).toBe(true);
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
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    expect(screen.getByText(/^Deck A 2: .*compartments overlap/)).toBeTruthy();
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "a:p0:0", stack: 0 }), magnet]} />);
    expect(screen.queryByText(/compartments overlap/)).toBeNull();
    expect(screen.getByText(/Magnets/)).toBeTruthy();
  });

  it("puts the focus on the export buttons when Cancel goes away", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    render(<ExportPanel {...props({ meshes: m })} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "3MF per part (.zip)" }),
    );
  });

  it("drops a running export when the layout changes", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />);
    expect(m.get.mock.calls[0]?.[2]?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull());
    expect(screen.getByRole("button", { name: "STL files (.zip)" }).hasAttribute("disabled")).toBe(
      false,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(p.download).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    // Only the unsupported tray is listed: no failure of the old plan came back.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("puts the focus on the export buttons when an export finishes under the focused Cancel", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    (await screen.findByRole("button", { name: "Cancel" })).focus();
    finish();
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull());
    // Effects run after the DOM update: wait for the hand-over.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "3MF per part (.zip)" }),
      ),
    );
  });

  it("puts the focus on the export buttons when a layout change drops the focused Cancel", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    (await screen.findByRole("button", { name: "Cancel" })).focus();
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull());
    // Effects run after the DOM update: wait for the hand-over.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "3MF per part (.zip)" }),
      ),
    );
  });

  it("leaves the focus alone when Cancel did not have it", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    const view = render(
      <>
        <input aria-label="elsewhere" />
        <ExportPanel {...p} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    await screen.findByRole("button", { name: "Cancel" });
    const elsewhere = screen.getByLabelText("elsewhere");
    elsewhere.focus();
    view.rerender(
      <>
        <input aria-label="elsewhere" />
        <ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />
      </>,
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull());
    expect(document.activeElement).toBe(elsewhere);
  });

  it("clears an export error when the layout changes", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed: oom")));
    const p = props({ meshes: m });
    const view = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/oom/));
    view.rerender(<ExportPanel {...p} trays={[makeTray({ key: "z:p0:0", stack: 0 }), magnet]} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists the three downloads as rows with a hint and a Download button", () => {
    const { container } = render(<ExportPanel {...props()} />);
    const rows = container.querySelectorAll(".export-options > .export-option");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector("strong")?.textContent).toBe("3MF per part (.zip)");
    expect(rows[0]?.textContent).toMatch(/Recommended: one file per tray/);
    expect(rows[1]?.textContent).toMatch(/for a slicer that opens a whole project/);
    expect(rows[2]?.textContent).toMatch(/for older slicers/);
    const buttons = [...rows].map((r) => r.querySelector("button"));
    expect(buttons.map((b) => b?.textContent)).toEqual(["Download", "Download", "Download"]);
    expect(buttons.map((b) => b?.classList.contains("primary"))).toEqual([true, false, false]);
  });

  it("titles the panel with the tray count and focuses the title on mount", () => {
    render(<ExportPanel {...props()} />);
    const heading = screen.getByRole("heading", { name: "Export all 2 parts" });
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("says what was downloaded in the row of the last download only", async () => {
    const p = props();
    const { container } = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await screen.findByText(/^Downloaded Wing-span-3mf-parts\.zip/);
    const rows = container.querySelectorAll(".export-option");
    expect(rows[0]?.querySelector('[role="status"]')?.textContent).toBe(
      "Downloaded Wing-span-3mf-parts.zip (2 of 2 trays).",
    );
    fireEvent.click(screen.getByRole("button", { name: "STL files (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(container.querySelectorAll(".export-option")[2]?.textContent).toMatch(
        /Downloaded Wing-span-stl\.zip/,
      ),
    );
    expect(
      container.querySelectorAll(".export-option")[0]?.querySelector("[role=status]"),
    ).toBeNull();
  });

  it("shows the build progress in trays and ignores clicks on the busy buttons", async () => {
    const m = meshes();
    m.get.mockImplementation(waitsForAbort);
    const p = props({ meshes: m });
    render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await screen.findByRole("button", { name: "Cancel" });
    expect(screen.getByText("Building the trays… 0 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Building the trays").tagName).toBe("PROGRESS");
    const callsBefore = m.get.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "One combined 3MF" }));
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    expect(m.get.mock.calls.length).toBe(callsBefore);
    for (const name of ["3MF per part (.zip)", "One combined 3MF", "STL files (.zip)"]) {
      const b = screen.getByRole("button", { name });
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.hasAttribute("disabled")).toBe(false);
    }
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "STL files (.zip)" }).hasAttribute("aria-disabled"),
      ).toBe(false),
    );
  });

  it("puts a failure in an error notice with Retry outside the alert", async () => {
    const m = meshes();
    m.get.mockImplementation(() => Promise.reject(new Error("Geometry worker failed: oom")));
    render(<ExportPanel {...props({ meshes: m })} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Error: Export failed: Geometry worker failed: oom");
    expect(alert.querySelector(".notice-level")?.textContent).toBe("Error:");
    const notice = alert.parentElement;
    expect(notice?.classList.contains("pf-notice--error")).toBe(true);
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(notice?.contains(retry)).toBe(true);
    expect(alert.contains(retry)).toBe(false);
  });

  it("warns how many trays were not exported and says a spare tray can be skipped", async () => {
    const spare = makeTray({ key: "s:p0:0", stack: 2, part: "leftover" });
    const m = meshes();
    m.get.mockImplementation((spec) =>
      spec.key === "s:p0:0"
        ? Promise.reject(new GeometryBuildError("too slow", "TimeoutError"))
        : Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
    );
    const p = props({ meshes: m, trays: [makeTray({ key: "a:p0:0", stack: 0 }), spare, magnet] });
    const { container } = render(<ExportPanel {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const notice = container.querySelector(".pf-notice--warn");
    expect(notice?.querySelector(".notice-level")?.textContent).toBe("Warning:");
    expect(notice?.textContent).toMatch(/2 of 3 trays weren't exported\./);
    expect(
      screen.getByText(/^Spare by [\w ]+: .*It only fills a gap, so you can skip it\./),
    ).toBeTruthy();
    expect(screen.getByText(/^Magnets: Uses feature/).textContent).not.toMatch(/only fills a gap/);
    expect(notice?.contains(screen.getByRole("button", { name: "Retry failed trays" }))).toBe(true);
  });
});
