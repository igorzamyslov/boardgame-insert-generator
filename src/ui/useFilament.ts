// src/ui/useFilament.ts
// The filament of a set of parts, from their built meshes (app/filament.ts). The meshes come from
// the same cache the export builds from, so what is counted here is not built twice.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { measurePart, partGrams } from "../app/filament";
import type { PartMeasure } from "../app/filament";
import type { MeshSource } from "../app/meshes";
import type { Printer, Settings, TraySpec } from "../model/types";

export type Filament =
  | { status: "counting" }
  | { status: "ready"; grams: number }
  /** A part could not be built (or there is no mesh source): there is no figure to give. */
  | { status: "unavailable" };

const isAbort = (e: unknown): boolean => e instanceof Error && e.name === "AbortError";

export interface FilamentOptions {
  /**
   * The plan is out of date (the viewer builds nothing then): nothing is built, and the count stays
   * "counting" until the plan is current again.
   */
  stale?: boolean;
  /**
   * Changes when the owner asked for another try (the dialog's Retry): the count starts again, and
   * a failure before it no longer counts.
   */
  retry?: number;
}

/**
 * The grams of `specs` as they print, once every one is built. The meshes are asked for one at a
 * time, so an export started meanwhile still has a free build slot. A new `specs` array with the
 * same parts (a pin moved another tray) does not start the count again: the count follows what the
 * parts and the settings say, not which objects carry them.
 */
export function useFilament(
  meshes: MeshSource | undefined,
  specs: readonly TraySpec[],
  settings: Settings,
  printer: Printer,
  { stale = false, retry = 0 }: FilamentOptions = {},
): Filament {
  // what the meshes depend on: the specs and the settings, as the mesh cache keys them
  const key = useMemo(() => JSON.stringify([specs, settings]), [specs, settings]);
  const latest = useRef({ specs, settings });
  latest.current = { specs, settings };
  const [measured, setMeasured] = useState<{ key: string; parts: PartMeasure[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (meshes === undefined || stale) {
      return;
    }
    setFailed(null);
    const { specs: wanted, settings: at } = latest.current;
    const controller = new AbortController();
    void (async () => {
      const parts: PartMeasure[] = [];
      try {
        for (const spec of wanted) {
          const built = await meshes.get(spec, at, controller.signal);
          if (controller.signal.aborted) {
            return;
          }
          parts.push(measurePart(built.mesh, built.volumeMm3));
        }
        setMeasured({ key, parts });
        setFailed(null);
      } catch (e) {
        if (!isAbort(e) && !controller.signal.aborted) {
          setFailed(key);
        }
      }
    })();
    return () => controller.abort();
  }, [meshes, key, stale, retry]);
  const grams = useMemo(
    () =>
      measured !== null && measured.key === key
        ? measured.parts.reduce((sum, m) => sum + partGrams(m, settings, printer.layerHeight), 0)
        : null,
    [measured, key, settings, printer.layerHeight],
  );
  if (meshes === undefined || specs.length === 0) {
    return { status: "unavailable" };
  }
  if (stale) {
    return { status: "counting" };
  }
  // a count that finished wins over a failure before it (a retry succeeded)
  if (grams !== null) {
    return { status: "ready", grams };
  }
  return failed === key ? { status: "unavailable" } : { status: "counting" };
}
