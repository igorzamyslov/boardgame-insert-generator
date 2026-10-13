// src/ui/ExportPanel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
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
  /** The inputs no longer match the layout: exporting would build trays for other settings. */
  stale?: boolean;
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
  const buttonRow = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const download = p.download ?? downloadBlob;
  const slug = fileSlug(p.projectName);
  const blocked = p.disabled || p.stale === true;

  // Preact calls a ref with null just before it removes the element, while it still has the
  // focus: whatever makes Cancel go away (a finished or aborted export, not only a click on it)
  // leaves the focus to be handed on. A stable callback, so it only runs on mount and unmount.
  const watchCancel = useCallback((el: HTMLButtonElement | null) => {
    if (el === null && cancelButton.current && document.activeElement === cancelButton.current) {
      refocus.current = true;
    }
    cancelButton.current = el;
  }, []);

  // A running export, a failed tray and an export error belong to the layout they were built for.
  useEffect(() => {
    if (running.current) {
      running.current.abort();
      running.current = null;
      setBusy(null);
    }
    setFailed((f) => (f.length > 0 ? [] : f));
    setError(null);
  }, [p.trays]);

  // Cancel unmounted with the progress bar: hand the focus to the first export button.
  useEffect(() => {
    if (busy === null && refocus.current) {
      refocus.current = false;
      buttonRow.current?.querySelector("button")?.focus();
    }
  }, [busy]);

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
    refocus.current = true;
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
      {p.stale ? <p class="hint">Inputs changed — update the plan before exporting.</p> : null}
      <div class="button-row" ref={buttonRow}>
        {KINDS.map((k) => (
          <button
            type="button"
            key={k}
            disabled={blocked || busy !== null || plan.parts.length === 0}
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
          <button type="button" ref={watchCancel} onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : null}
      {error ? (
        <div class="run-error" role="alert">
          <p>{`Export failed: ${error.message}`}</p>
          <button
            type="button"
            disabled={blocked}
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
              disabled={blocked || busy !== null}
              onClick={() => {
                p.meshes.forget(
                  failed.map((f) => f.part.spec),
                  p.settings,
                );
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
