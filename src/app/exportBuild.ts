// src/app/exportBuild.ts
import { gridLayout, partFileName, to3mf, toStl, zipFiles } from "../export";
import type { Mesh } from "../geometry/types";
import { buildSpecOf, numberParts } from "../instructions/numbering";
import type { NumberedPart } from "../instructions/numbering";
import type { Printer, TraySpec } from "../model/types";
import { nextMacrotask } from "../util/macrotask";
import type { BuiltMesh } from "./meshes";
import { buildErrorReason, unsupportedReason } from "./support";

export interface ExportPlan {
  parts: NumberedPart[];
  skipped: { part: NumberedPart; reason: string }[];
}

export interface ExportProgress {
  done: number;
  total: number;
}

export interface ExportOptions {
  getMesh: (spec: TraySpec) => Promise<BuiltMesh>;
  /** Ask for each part with its number to engrave (settings.engraveNumbers). Default: off. */
  engrave?: boolean;
  onProgress: (p: ExportProgress) => void;
  yieldToUi?: () => Promise<void>;
}

export interface ExportOutput {
  data: Uint8Array;
  failed: { part: NumberedPart; reason: string }[];
  included: number;
}

export const GRID_GAP_MM = 5;

export class NothingToExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NothingToExportError";
  }
}

export function planExport(trays: readonly TraySpec[]): ExportPlan {
  const parts: NumberedPart[] = [];
  const skipped: ExportPlan["skipped"] = [];
  for (const part of numberParts(trays)) {
    const reason = unsupportedReason(part.spec);
    if (reason === null) {
      parts.push(part);
    } else {
      skipped.push({ part, reason });
    }
  }
  return { parts, skipped };
}

export function objectName(part: NumberedPart): string {
  return `${String(part.number).padStart(2, "0")} ${part.label}`;
}

/** Mesh frame: origin at the outer min corner (plan 3), so the footprint is max x / max y. */
export function meshFootprint(mesh: Mesh): { w: number; d: number } {
  let w = 0;
  let d = 0;
  for (let i = 0; i + 2 < mesh.positions.length; i += 3) {
    w = Math.max(w, mesh.positions[i] ?? 0);
    d = Math.max(d, mesh.positions[i + 1] ?? 0);
  }
  return { w, d };
}

/**
 * The mesh of a part as it prints. A merged part whose members stand on different floors
 * (`merged.flipped`) only prints without supports upside down, so it is turned half a turn about
 * the X axis (a rotation, not a mirror) and put back on the bed; every other part prints as it is
 * built. The mesh frame is the part's own box: its depth `d` and height `h` are the spec's.
 */
export function printMesh(spec: TraySpec, mesh: Mesh): Mesh {
  if (!spec.merged?.flipped) {
    return mesh;
  }
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    positions[i] = mesh.positions[i] ?? 0;
    positions[i + 1] = spec.d - (mesh.positions[i + 1] ?? 0);
    positions[i + 2] = spec.h - (mesh.positions[i + 2] ?? 0);
  }
  return { positions, indices: mesh.indices };
}

/**
 * The printable XY area, spec §5: `bedX − 2·bedMargin` by `bedY − 2·bedMargin`, the same rule as
 * the layout's bed (`layout/context.ts` works in 0.01 mm units and floors them).
 */
export function usableBed(p: Printer): { x: number; y: number } {
  return { x: p.bedX - 2 * p.bedMargin, y: p.bedY - 2 * p.bedMargin };
}

interface Built {
  part: NumberedPart;
  mesh: Mesh;
}

async function collect(
  parts: readonly NumberedPart[],
  opts: ExportOptions,
): Promise<{ built: Built[]; failed: ExportOutput["failed"] }> {
  const pause = opts.yieldToUi ?? nextMacrotask;
  const total = parts.length;
  const built: Built[] = [];
  const failed: ExportOutput["failed"] = [];
  opts.onProgress({ done: 0, total });
  for (const [i, part] of parts.entries()) {
    try {
      const { mesh } = await opts.getMesh(buildSpecOf(part, opts.engrave === true));
      built.push({ part, mesh: printMesh(part.spec, mesh) });
    } catch (e) {
      // A cancelled export is not a part's failure: stop and let the caller see the abort.
      if (e instanceof Error && e.name === "AbortError") {
        throw e;
      }
      failed.push({ part, reason: buildErrorReason(e) });
    }
    opts.onProgress({ done: i + 1, total });
    await pause();
  }
  if (built.length === 0) {
    throw new NothingToExportError(failed[0]?.reason ?? "There are no printable parts.");
  }
  return { built, failed };
}

export async function buildPartsZip(
  parts: readonly NumberedPart[],
  opts: ExportOptions,
): Promise<ExportOutput> {
  const pause = opts.yieldToUi ?? nextMacrotask;
  const { built, failed } = await collect(parts, opts);
  const files: { name: string; data: Uint8Array }[] = [];
  for (const b of built) {
    files.push({
      name: partFileName(b.part.number, b.part.label, "3mf"),
      data: to3mf([{ name: objectName(b.part), mesh: b.mesh }]),
    });
    await pause();
  }
  return { data: zipFiles(files), failed, included: built.length };
}

export async function buildCombined3mf(
  parts: readonly NumberedPart[],
  bed: { x: number; y: number },
  opts: ExportOptions,
): Promise<ExportOutput> {
  const { built, failed } = await collect(parts, opts);
  const offsets = gridLayout(
    built.map((b) => meshFootprint(b.mesh)),
    bed,
    GRID_GAP_MM,
  );
  const data = to3mf(
    built.map((b, i) => ({
      name: objectName(b.part),
      mesh: b.mesh,
      transform: offsets[i] ?? [0, 0, 0],
    })),
  );
  return { data, failed, included: built.length };
}

export async function buildStlZip(
  parts: readonly NumberedPart[],
  opts: ExportOptions,
): Promise<ExportOutput> {
  const pause = opts.yieldToUi ?? nextMacrotask;
  const { built, failed } = await collect(parts, opts);
  const files: { name: string; data: Uint8Array }[] = [];
  for (const b of built) {
    files.push({
      name: partFileName(b.part.number, b.part.label, "stl"),
      data: toStl(b.mesh, objectName(b.part)),
    });
    await pause();
  }
  return { data: zipFiles(files), failed, included: built.length };
}
