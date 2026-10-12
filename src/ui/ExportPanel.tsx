// src/ui/ExportPanel.tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { bytesToBlob, downloadBlob, fileSlug } from "../app/download";
import {
  buildCombined3mf,
  buildPartsZip,
  buildStlZip,
  planExport,
  usableBed,
} from "../app/exportBuild";
import type { ExportOptions, ExportOutput } from "../app/exportBuild";
import type { MeshSource } from "../app/meshes";
import { buildErrorReason } from "../app/support";
import type { Printer, Settings, TraySpec } from "../model/types";

export type ExportKind = "parts" | "combined" | "stl";

const KINDS: ExportKind[] = ["parts", "combined", "stl"];

export const EXPORT_LABELS: Record<ExportKind, string> = {
  parts: "3MF per part (.zip)",
  combined: "One combined 3MF",
  stl: "STL files (.zip)",
};

export interface ExportPanelProps {
  trays: readonly TraySpec[];
  printer: Printer;
  settings: Settings;
  meshes: MeshSource;
  projectName: string;
  disabled: boolean;
  download?: (blob: Blob, filename: string) => void;
}

interface Busy {
  kind: ExportKind;
  done: number;
  total: number;
}

export function ExportPanel(p: ExportPanelProps) {
  const plan = useMemo(() => planExport(p.trays), [p.trays]);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<{ kind: ExportKind; message: string } | null>(null);
  const [failed, setFailed] = useState<ExportOutput["failed"]>([]);
  const [lastKind, setLastKind] = useState<ExportKind>("parts");
  const running = useRef<AbortController | null>(null);
  const download = p.download ?? downloadBlob;
  const slug = fileSlug(p.projectName);

  // A failed tray belongs to the layout it was built for.
  useEffect(() => {
    setFailed((f) => (f.length > 0 ? [] : f));
  }, [p.trays]);

  // Leaving the panel stops the export, so nothing downloads after the user has gone.
  useEffect(
    () => () => {
      running.current?.abort();
    },
    [],
  );

  async function run(kind: ExportKind): Promise<void> {
    const controller = new AbortController();
    running.current = controller;
    setLastKind(kind);
    setError(null);
    setFailed([]);
    setBusy({ kind, done: 0, total: plan.parts.length });
    const opts: ExportOptions = {
      getMesh: (spec) => p.meshes.get(spec, p.settings, controller.signal),
      onProgress: (progress) => {
        if (!controller.signal.aborted) {
          setBusy({ kind, ...progress });
        }
      },
    };
    // A cancelled export (or one whose panel has gone) downloads nothing.
    const finish = (out: ExportOutput, type: string, filename: string): void => {
      if (!controller.signal.aborted) {
        download(bytesToBlob(out.data, type), filename);
        setFailed(out.failed);
      }
    };
    try {
      if (kind === "parts") {
        finish(await buildPartsZip(plan.parts, opts), "application/zip", `${slug}-3mf-parts.zip`);
      } else if (kind === "combined") {
        finish(
          await buildCombined3mf(plan.parts, usableBed(p.printer), opts),
          "model/3mf",
          `${slug}.3mf`,
        );
      } else {
        finish(await buildStlZip(plan.parts, opts), "application/zip", `${slug}-stl.zip`);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError({ kind, message: buildErrorReason(e) });
      }
    } finally {
      if (running.current === controller) {
        running.current = null;
        setBusy(null);
      }
    }
  }

  function cancel(): void {
    running.current?.abort();
    running.current = null;
    setBusy(null);
  }

  const notExported = [...plan.skipped, ...failed];

  return (
    <div class="export-panel">
      <p class="hint">
        Every part prints open side up, the way it sits in the box. Parts are numbered as in the
        plan view and on the assembly page.
      </p>
      <div class="button-row">
        {KINDS.map((k) => (
          <button
            type="button"
            key={k}
            disabled={p.disabled || busy !== null || plan.parts.length === 0}
            onClick={() => {
              void run(k);
            }}
          >
            {EXPORT_LABELS[k]}
          </button>
        ))}
      </div>
      {busy ? (
        <div class="run-status" role="status">
          <progress value={busy.done} max={Math.max(1, busy.total)} aria-label="Building meshes" />
          <span>{`Building meshes ${busy.done}/${busy.total}…`}</span>
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : null}
      {error ? (
        <div class="run-error" role="alert">
          <p>{`Export failed: ${error.message}`}</p>
          <button
            type="button"
            disabled={p.disabled}
            onClick={() => {
              p.meshes.reset();
              void run(error.kind);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {notExported.length > 0 ? (
        <div class="export-skipped">
          <h3>Not exported</h3>
          <ul>
            {notExported.map((s) => (
              <li key={s.part.spec.key}>{`#${s.part.number} ${s.part.label}: ${s.reason}`}</li>
            ))}
          </ul>
          {failed.length > 0 ? (
            <button
              type="button"
              disabled={p.disabled || busy !== null}
              onClick={() => {
                p.meshes.reset();
                void run(lastKind);
              }}
            >
              Retry failed trays
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
