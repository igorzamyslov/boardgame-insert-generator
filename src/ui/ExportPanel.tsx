// src/ui/ExportPanel.tsx
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
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
import { trayNames } from "../instructions/naming";
import { numberParts } from "../instructions/numbering";
import type { LayoutSummary } from "../layout/types";
import type { Component, Printer, Settings, TraySpec } from "../model/types";
import { formatPrintTime } from "./Summary";
import "./export.css";

export type ExportKind = "parts" | "combined" | "stl";

/** The two files kept behind "Other formats": the default is the one combined 3MF. */
const OTHER_KINDS: ExportKind[] = ["parts", "stl"];

export const EXPORT_LABELS: Record<ExportKind, string> = {
  parts: "3MF per part (.zip)",
  combined: "3MF",
  stl: "STL files (.zip)",
};

export const SUPPORT_LINKS = [
  { name: "Ko-fi", href: "https://ko-fi.com/igorzamyslov" },
  { name: "PayPal", href: "https://paypal.me/igorzamyslov" },
] as const;

export interface ExportPanelProps {
  trays: readonly TraySpec[];
  /** The components the trays hold: the trays are named after them. */
  components?: readonly Component[];
  printer: Printer;
  settings: Settings;
  meshes: MeshSource;
  projectName: string;
  /** The plan's totals, for the filament and the print time; without them only the parts show. */
  summary?: LayoutSummary | null;
  /** Opens the packing guide; without it the panel offers none. */
  onOpenGuide?: () => void;
  /** The layout is still being made: nothing can be built yet. */
  disabled: boolean;
  /** The inputs no longer match the layout: exporting would build trays for other settings. */
  stale?: boolean;
  download?: (blob: Blob, filename: string) => void;
  /** The id of the title, for a dialog that is named by it. */
  titleId?: string;
}

interface Busy {
  kind: ExportKind;
  done: number;
  total: number;
}

export function ExportPanel(p: ExportPanelProps) {
  const plan = useMemo(() => planExport(p.trays), [p.trays]);
  // Every part is called as on the screens and the packing guide, in files and the list below.
  const names = useMemo(
    () => trayNames(numberParts(p.trays), p.components ?? []),
    [p.trays, p.components],
  );
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<{ kind: ExportKind; message: string } | null>(null);
  const [failed, setFailed] = useState<ExportOutput["failed"]>([]);
  const [lastKind, setLastKind] = useState<ExportKind>("combined");
  const [moreOpen, setMoreOpen] = useState(false);
  const [downloaded, setDownloaded] = useState<{ kind: ExportKind; filename: string } | null>(null);
  const busyHintId = useId();
  const reasonId = useId();
  const moreId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const running = useRef<AbortController | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const stopButton = useRef<HTMLButtonElement | null>(null);
  const download = p.download ?? downloadBlob;
  const slug = fileSlug(p.projectName);
  const blockedReason = p.stale
    ? "Update the plan first."
    : p.disabled
      ? "The plan is updating."
      : null;
  const off = blockedReason !== null || plan.parts.length === 0 || busy !== null;

  // Preact calls a ref with null just before it removes the element, while it still has the
  // focus: whatever makes Stop go away (a finished or aborted export, not only a click on it)
  // leaves the focus to be handed on. A stable callback, so it only runs on mount and unmount.
  const watchStop = useCallback((el: HTMLButtonElement | null) => {
    if (el === null && stopButton.current && document.activeElement === stopButton.current) {
      refocus.current = true;
    }
    stopButton.current = el;
  }, []);

  // The panel opens on demand (in a dialog): start at its heading.
  useEffect(() => {
    title.current?.focus();
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
    setDownloaded(null);
  }, [p.trays]);

  // Stop unmounted with the progress bar: hand the focus to Download.
  useEffect(() => {
    if (busy === null && refocus.current) {
      refocus.current = false;
      primary.current?.focus();
    }
  }, [busy]);

  // Leaving the panel (closing its dialog) stops the export, so nothing downloads after the user
  // has gone.
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
    setDownloaded(null);
    setBusy({ kind, done: 0, total: plan.parts.length });
    const opts: ExportOptions = {
      getMesh: (spec) => p.meshes.get(spec, p.settings, controller.signal),
      names,
      engrave: p.settings.engraveNames,
      onProgress: (progress) => {
        if (!controller.signal.aborted) {
          setBusy({ kind, ...progress });
        }
      },
    };
    // A stopped export (or one whose panel has gone) downloads nothing.
    const finish = (out: ExportOutput, type: string, filename: string): void => {
      if (!controller.signal.aborted) {
        download(bytesToBlob(out.data, type), filename);
        setFailed(out.failed);
        setDownloaded({ kind, filename });
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

  function start(kind: ExportKind): void {
    if (!off) {
      void run(kind);
    }
  }

  function stop(): void {
    refocus.current = true;
    running.current?.abort();
    running.current = null;
    setBusy(null);
  }

  const retryOff = blockedReason !== null || busy !== null;
  const describedBy = busy !== null ? busyHintId : blockedReason !== null ? reasonId : undefined;
  const notExported = [...plan.skipped, ...failed];

  return (
    <div class="export-panel">
      <h2 class="export-title" id={p.titleId} tabIndex={-1} ref={title}>
        Download
      </h2>
      <dl class="export-facts">
        <div>
          <dt>Parts</dt>
          <dd>{plan.parts.length}</dd>
        </div>
        {p.summary ? (
          <>
            <div>
              <dt>Filament</dt>
              <dd>{`≈ ${Math.round(p.summary.filamentAtInfillG)} g`}</dd>
            </div>
            <div>
              <dt>Print time</dt>
              <dd>{`≈ ${formatPrintTime(p.summary.printMinutes)}`}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {blockedReason !== null ? (
        <p class="hint" id={reasonId}>
          {blockedReason}
        </p>
      ) : null}
      <div class="export-primary">
        <button
          type="button"
          class="primary"
          ref={primary}
          aria-disabled={off ? "true" : undefined}
          aria-describedby={describedBy}
          onClick={() => start("combined")}
        >
          Download 3MF
        </button>
        <p class="export-done" role="status">
          {downloaded ? `Downloaded ${downloaded.filename}.` : ""}
        </p>
      </div>
      {p.onOpenGuide ? (
        <button
          type="button"
          aria-disabled={p.stale ? "true" : undefined}
          aria-describedby={p.stale ? reasonId : undefined}
          onClick={() => {
            if (!p.stale) {
              p.onOpenGuide?.();
            }
          }}
        >
          Open the packing guide
        </button>
      ) : null}
      <div class="export-more">
        <button
          type="button"
          class="quiet export-toggle"
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? moreId : undefined}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          Other formats
        </button>
        {moreOpen ? (
          <div class="export-options" id={moreId}>
            {OTHER_KINDS.map((k) => (
              <div class="export-option" key={k}>
                <strong>{EXPORT_LABELS[k]}</strong>
                <button
                  type="button"
                  aria-label={`Download ${EXPORT_LABELS[k]}`}
                  aria-disabled={off ? "true" : undefined}
                  aria-describedby={describedBy}
                  onClick={() => start(k)}
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {busy ? (
        <span id={busyHintId} class="visually-hidden">
          Available when the build finishes.
        </span>
      ) : null}
      {busy ? (
        <div class="run-status" role="status">
          <progress
            value={busy.done}
            max={Math.max(1, busy.total)}
            aria-label="Building the files"
          />
          <span>{`Building ${busy.done} of ${busy.total}`}</span>
          <button type="button" ref={watchStop} onClick={stop}>
            Stop
          </button>
        </div>
      ) : null}
      {error ? (
        <div class="pf-notice pf-notice--error">
          <div role="alert">
            <strong class="notice-level">Error:</strong> {`Download failed: ${error.message}`}
          </div>
          <button
            type="button"
            aria-disabled={retryOff ? "true" : undefined}
            onClick={() => {
              if (!retryOff) {
                p.meshes.reset();
                void run(error.kind);
              }
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {notExported.length > 0 ? (
        <div class="export-failed">
          <h3>Not exported</h3>
          <ul>
            {notExported.map((s) => (
              <li key={s.part.spec.key}>
                {`${names.get(s.part.spec.key)?.full ?? s.part.label}: ${s.reason}`}
              </li>
            ))}
          </ul>
          {failed.length > 0 ? (
            <button
              type="button"
              aria-disabled={retryOff ? "true" : undefined}
              onClick={() => {
                if (retryOff) {
                  return;
                }
                p.meshes.forget(
                  failed.map((f) => f.part.spec),
                  p.settings,
                );
                void run(lastKind);
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      <p class="export-support">
        <span>Support it</span>
        {SUPPORT_LINKS.map((l) => (
          <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer">
            {l.name}
            <span class="visually-hidden"> (opens in a new tab)</span>
          </a>
        ))}
      </p>
    </div>
  );
}
