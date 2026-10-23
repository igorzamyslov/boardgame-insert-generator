// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeshSource } from "../app/meshes";
import { cubeMesh, fixtureProject, makeTray } from "../app/test-helpers";
import type { TraySpec } from "../model/types";
import { useFilament } from "./useFilament";
import type { Filament } from "./useFilament";

afterEach(cleanup);

const project = fixtureProject();
const specs: TraySpec[] = [makeTray({ key: "a", w: 72, d: 96 })];

function built(): MeshSource["get"] {
  return vi.fn(() =>
    Promise.resolve({ mesh: cubeMesh([72, 96, 40]), volumeMm3: 72 * 96 * 40 * 0.4 }),
  );
}

function source(get: MeshSource["get"]): MeshSource {
  return { get, reset: vi.fn(), forget: vi.fn(), dispose: vi.fn() };
}

/** Renders the hook and keeps the latest result. */
function mount(meshes: MeshSource, opts?: { stale?: boolean; retry?: number }) {
  const seen: { current: Filament | null } = { current: null };
  function Probe(p: { meshes: MeshSource; opts?: { stale?: boolean; retry?: number } }) {
    seen.current = useFilament(p.meshes, specs, project.settings, project.printer, p.opts);
    return null;
  }
  const view = render(<Probe meshes={meshes} opts={opts} />);
  return {
    seen,
    again: (next?: { stale?: boolean; retry?: number }) =>
      view.rerender(<Probe meshes={meshes} opts={next} />),
  };
}

describe("useFilament", () => {
  it("counts the built parts", async () => {
    const m = source(built());
    const { seen } = mount(m);
    expect(seen.current).toEqual({ status: "counting" });
    await waitFor(() => expect(seen.current?.status).toBe("ready"));
  });

  it("builds nothing while the plan is stale, and counts once it is current", async () => {
    const get = built();
    const { seen, again } = mount(source(get), { stale: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();
    expect(seen.current).toEqual({ status: "counting" });
    again({ stale: false });
    await waitFor(() => expect(seen.current?.status).toBe("ready"));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("counts again on a retry after a failure, and the later success wins", async () => {
    const get = vi.fn<MeshSource["get"]>().mockRejectedValueOnce(new Error("no"));
    get.mockImplementation(built());
    const { seen, again } = mount(source(get), { retry: 0 });
    await waitFor(() => expect(seen.current?.status).toBe("unavailable"));
    again({ retry: 1 });
    await waitFor(() => expect(seen.current?.status).toBe("ready"));
  });
});
