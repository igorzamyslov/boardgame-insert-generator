// src/ui/ExportPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, makeTray } from "../app/test-helpers";
import { GeometryBuildError } from "../geometry/client";
import { DEFAULT_PRINTER } from "../model/defaults";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { FeatureSpec } from "../model/types";
import { ExportPanel } from "./ExportPanel";
import type { ExportPanelProps } from "./ExportPanel";

afterEach(cleanup);

function meshes() {
  const get = vi.fn<MeshSource["get"]>(() =>
    Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1000 }),
  );
  const reset = vi.fn();
  return { get, reset, dispose: vi.fn() };
}

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

function props(over: Partial<ExportPanelProps> = {}): ExportPanelProps {
  return {
    trays: [makeTray({ key: "a:p0:0", stack: 0 }), makeTray({ key: "b:p0:0", stack: 1 }), magnet],
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
    expect(screen.getByText(/#3 Magnets: Uses feature "magnet"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3MF per part (.zip)" }));
    expect(screen.getByRole("button", { name: "STL files (.zip)" }).hasAttribute("disabled")).toBe(
      true,
    );
    await waitFor(() => expect(p.download).toHaveBeenCalled());
    const [blob, name] = vi.mocked(p.download ?? vi.fn()).mock.calls[0] ?? [];
    expect(name).toBe("Wing-span-3mf-parts.zip");
    expect(blob).toBeInstanceOf(Blob);
    expect(p.meshes.get).toHaveBeenCalledTimes(2);
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
    expect(screen.getByText(/#2 .*compartments overlap/)).toBeTruthy();
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
});
