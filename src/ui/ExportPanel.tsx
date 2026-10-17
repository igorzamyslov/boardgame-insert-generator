// src/ui/ExportPanel.tsx
// The Download dialog (Export, MobileDownload) and the building of the file (Exporting): one
// dialog whose title and body follow the build: ready, building, done (every part is in the file)
// and partial (a part could not be built). DESIGN §5.
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
import { shotsHold } from "../app/shotsHold";
import { buildErrorReason } from "../app/support";
import { trayNames } from "../instructions/naming";
import { buildSpecOf, numberParts } from "../instructions/numbering";
import type { LayoutSummary } from "../layout/types";
import type { Component, Printer, Settings, TraySpec } from "../model/types";
import { Button, Card, CloseButton, Dialog, Icon, IconTile, ProgressBar } from "../kit";
import { formatGrams, formatPrintTime } from "./estimates";
import { componentIndexOfTray, shadeIndexOf, shadeVars } from "./identity";
import "./export.css";

export type ExportKind = "parts" | "combined" | "stl";

/** The two files kept behind "Other formats": the default is the one combined 3MF. */
const OTHER_KINDS: ExportKind[] = ["parts", "stl"];

export const EXPORT_LABELS: Record<ExportKind, string> = {
  parts: "One 3MF per part (.zip)",
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
  /** The plan's totals, for the filament and the print time; without them the tiles are left out. */
  summary?: LayoutSummary | null;
  /** Opens the packing guide; without it the panel offers none. */
  onOpenGuide?: () => void;
  /** The layout is still being made: nothing can be built yet. */
  disabled: boolean;
  /** The inputs no longer match the layout: exporting would build trays for other settings. */
  stale?: boolean;
  download?: (blob: Blob, filename: string) => void;
  /** The id of the title, which names the dialog. */
  titleId?: string;
  /** Close, "Back to the plan" and Escape: the owner takes the dialog away (which stops a build). */
  onClose: () => void;
  /** A phone's layout (MobileDownload): the bar with Close, a scrolling body and a foot. */
  phone?: boolean;
  /** Puts the insert's file into the phone's share sheet (the phone's Send file). */
  onSendFile?: () => void;
}

interface Busy {
  kind: ExportKind;
  done: number;
  total: number;
}

type View = "ready" | "building" | "done" | "partial";

const noun = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "8 trays and 2 spacers for Harbour Kings": what the file holds, for what insert. */
function subtitleOf(trays: number, spacers: number, name: string): string {
  const held =
    spacers === 0
      ? noun(trays, "tray", "trays")
      : trays === 0
        ? noun(spacers, "spacer", "spacers")
        : `${noun(trays, "tray", "trays")} and ${noun(spacers, "spacer", "spacers")}`;
  return `${held} for ${name === "" ? "(unnamed)" : name}`;
}

export function ExportPanel(p: ExportPanelProps) {
  const plan = useMemo(() => planExport(p.trays), [p.trays]);
  const components = p.components ?? [];
  // Every part is called as on the screens and the packing guide, in files and in the list below.
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
  const ownTitleId = useId();
  const titleId = p.titleId ?? ownTitleId;
  const reasonId = useId();
  const moreId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const running = useRef<AbortController | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const firstRetry = useRef<HTMLButtonElement | null>(null);
  const refocus = useRef(false);
  const stopButton = useRef<HTMLButtonElement | null>(null);
  const download = p.download ?? downloadBlob;
  const slug = fileSlug(p.projectName);
  const blockedReason = p.stale
    ? "Make a new plan first."
    : p.disabled
      ? "The plan is updating."
      : null;
  const off = blockedReason !== null || plan.parts.length === 0 || busy !== null;
  const total = plan.parts.length;
  const view: View =
    busy !== null
      ? "building"
      : downloaded !== null
        ? failed.length > 0
          ? "partial"
          : "done"
        : "ready";

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

  // Stop unmounted with the progress bar: hand the focus on to what the dialog shows now: Download,
  // Back to the plan, or the first part to try again.
  useEffect(() => {
    if (busy === null && refocus.current) {
      refocus.current = false;
      const target =
        view === "ready" ? primary.current : (back.current ?? firstRetry.current ?? title.current);
      target?.focus();
    }
  }, [busy, view]);

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
    let firstMesh = true;
    const opts: ExportOptions = {
      getMesh: async (spec) => {
        if (!firstMesh) {
          // Shots mode only (shotsHold.ts): keeps the build mid-way for its screenshot.
          await shotsHold("export");
        }
        firstMesh = false;
        return p.meshes.get(spec, p.settings, controller.signal);
      },
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
  // The reason a download is off, read with each control that is (visible: it takes the caption's place).
  const describedBy = blockedReason !== null ? reasonId : undefined;
  const notExported = [...plan.skipped, ...failed];
  const phone = p.phone === true;

  const trayChips = plan.parts.filter((part) => part.spec.part === "tray");
  const spacers = total - trayChips.length;
  const subtitle = subtitleOf(trayChips.length, spacers, p.projectName);

  const retryFailed = (): void => {
    if (retryOff) {
      return;
    }
    // The specs that were built (with their engraved name), not the plain ones: the mesh cache keys
    // on the whole spec.
    p.meshes.forget(
      failed.map((f) =>
        buildSpecOf(f.part, p.settings.engraveNames, names.get(f.part.spec.key)?.short),
      ),
      p.settings,
    );
    void run(lastKind);
  };

  let heading: string;
  let line: string | null = null;
  if (view === "building") {
    heading = "Building your print file";
    line = `${busy?.done ?? 0} of ${noun(busy?.total ?? total, "part", "parts")} built`;
  } else if (view === "done") {
    heading = total === 1 ? "The part is ready" : `All ${total} parts are ready`;
    line =
      downloaded?.kind === "combined"
        ? "One file with every part."
        : `Downloaded ${downloaded?.filename ?? ""}.`;
  } else if (view === "partial") {
    heading = `${total - failed.length} of ${total} ${total === 1 ? "part is" : "parts are"} ready`;
  } else {
    heading = "Ready to print";
    line = subtitle;
  }

  const closeButton = <CloseButton onClick={p.onClose} />;
  const head = (
    <div class="export-head">
      <div class="export-head__text">
        <h1 class="export-h1" id={titleId} tabIndex={-1} ref={title}>
          {heading}
        </h1>
        {line !== null ? <span class="export-sub">{line}</span> : null}
      </div>
      {phone ? null : closeButton}
    </div>
  );

  const caption =
    blockedReason ??
    (total === 0
      ? null
      : total === 1
        ? "One file with the part."
        : `One file with all ${total} parts.`);
  const primaryButton = (
    <Button
      ref={primary}
      variant="primary"
      size="cta"
      icon={<Icon name="download" size={18} />}
      aria-disabled={off ? "true" : undefined}
      aria-describedby={describedBy}
      onClick={() => start("combined")}
    >
      Download the 3MF file
    </Button>
  );
  const captionLine =
    caption !== null ? (
      <span class="export-caption" id={reasonId}>
        {caption}
      </span>
    ) : null;
  // After the build only the reason shows (Try again is off for it), never the ready caption.
  const reasonLine =
    blockedReason !== null ? (
      <span class="export-caption" id={reasonId}>
        {blockedReason}
      </span>
    ) : null;

  const problemBoxes =
    notExported.length > 0 ? (
      <div class="export-failed">
        <h2 class="export-h2">Not exported</h2>
        <ul class="export-problems">
          {notExported.map((s, i) => {
            const isFailed = i >= plan.skipped.length;
            return (
              <li class="export-problem" key={s.part.spec.key}>
                <span class="export-problem__text">
                  {`${names.get(s.part.spec.key)?.full ?? s.part.label}: ${s.reason}`}
                </span>
                {isFailed ? (
                  <Button
                    ref={i === plan.skipped.length ? firstRetry : undefined}
                    variant="secondary"
                    class="export-problem__retry"
                    aria-disabled={retryOff ? "true" : undefined}
                    aria-describedby={retryOff ? describedBy : undefined}
                    onClick={retryFailed}
                  >
                    Try again
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  const errorBox = error ? (
    <div class="export-problem">
      <div class="export-problem__text" role="alert">
        <strong class="notice-level">Error:</strong> {`Download failed: ${error.message}`}
      </div>
      <Button
        variant="secondary"
        class="export-problem__retry"
        aria-disabled={retryOff ? "true" : undefined}
        aria-describedby={retryOff ? describedBy : undefined}
        onClick={() => {
          if (!retryOff) {
            p.meshes.reset();
            void run(error.kind);
          }
        }}
      >
        Try again
      </Button>
    </div>
  ) : null;

  const guide =
    p.onOpenGuide !== undefined ? (
      <Card
        class="export-guide"
        aria-disabled={p.stale ? "true" : undefined}
        aria-describedby={p.stale ? reasonId : undefined}
        onClick={() => {
          if (!p.stale) {
            p.onOpenGuide?.();
          }
        }}
      >
        {phone ? null : (
          <IconTile size={40}>
            <Icon name="file" size={20} />
          </IconTile>
        )}
        <span class="export-guide__text">
          <span class="export-guide__title">Packing guide</span>
          <span class="export-guide__line">
            {phone
              ? "Where each named tray goes"
              : "A printable sheet showing where each named tray goes"}
          </span>
        </span>
        <Icon name="chevron-right" size={16} />
      </Card>
    ) : null;

  const formats = (
    <div class="export-more">
      <button
        type="button"
        class="export-toggle"
        aria-expanded={moreOpen}
        aria-controls={moreOpen ? moreId : undefined}
        onClick={() => setMoreOpen(!moreOpen)}
      >
        Other formats
        <Icon name={moreOpen ? "chevron-up" : "chevron-down"} size={14} />
      </button>
      {moreOpen ? (
        <div class="export-formats" id={moreId}>
          {OTHER_KINDS.map((k) => (
            <Button
              key={k}
              variant="secondary"
              class="export-format"
              aria-disabled={off ? "true" : undefined}
              aria-describedby={describedBy}
              onClick={() => start(k)}
            >
              {EXPORT_LABELS[k]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const support = (
    <div class="export-support">
      <span class="export-support__text">This tool is free. Support it if you like it.</span>
      <span class="export-support__links">
        {SUPPORT_LINKS.map((l) => (
          <a
            key={l.name}
            class={l.name === "Ko-fi" ? "k-btn export-kofi" : "k-btn k-btn--secondary"}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {l.name === "Ko-fi" ? <Icon name="heart" size={15} /> : null}
            {l.name}
            <span class="visually-hidden"> (opens in a new tab)</span>
          </a>
        ))}
      </span>
    </div>
  );

  const stats = p.summary ? (
    <dl class="export-stats">
      <div class="export-stat">
        <dt>Filament</dt>
        <dd>{formatGrams(p.summary.filamentAtInfillG)}</dd>
      </div>
      <div class="export-stat">
        <dt>Print time</dt>
        <dd>{formatPrintTime(p.summary.printMinutes)}</dd>
      </div>
    </dl>
  ) : null;

  const chips = (
    <ul class="export-chips">
      {trayChips.map((part) => {
        const name = names.get(part.spec.key)?.full ?? part.label;
        const at = componentIndexOfTray(part.spec, components);
        const kind = at === null ? undefined : components[at]?.kind;
        return (
          <li
            class="export-chip"
            key={part.spec.key}
            title={name}
            style={
              at === null || kind === undefined
                ? undefined
                : shadeVars(kind, shadeIndexOf(components, at))
            }
          >
            {name}
          </li>
        );
      })}
      {spacers > 0 ? (
        <li class="export-chip export-chip--spacers">{noun(spacers, "spacer", "spacers")}</li>
      ) : null}
    </ul>
  );

  const building = busy !== null && (
    <>
      <ProgressBar
        label="Building the files"
        value={busy.total === 0 ? 0 : (busy.done / busy.total) * 100}
      />
      <div class="export-actions">
        <Button ref={watchStop} variant="secondary" size="dialog" onClick={stop}>
          Stop
        </Button>
      </div>
    </>
  );

  let body;
  if (view === "building") {
    body = building;
  } else if (view === "ready") {
    body = (
      <>
        {chips}
        {stats}
        {phone ? (
          p.onSendFile !== undefined ? (
            <div class="export-send">
              <Button
                variant="secondary"
                icon={<Icon name="send" size={16} />}
                onClick={p.onSendFile}
              >
                Send file
              </Button>
            </div>
          ) : null
        ) : (
          <div class="export-primary">
            {primaryButton}
            {captionLine}
          </div>
        )}
        {problemBoxes}
        {errorBox}
        {guide}
        {formats}
        {support}
      </>
    );
  } else {
    body = (
      <>
        {problemBoxes}
        {reasonLine}
        {view === "done" ? (
          <div class="export-actions">
            <Button ref={back} variant="secondary" size="dialog" onClick={p.onClose}>
              Back to the plan
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Dialog
      labelledBy={titleId}
      onClose={p.onClose}
      region="dialog"
      class={phone ? "export-dialog export-dialog--phone" : "export-dialog"}
    >
      {phone ? <div class="export-bar">{closeButton}</div> : null}
      <div class="export-body" data-view={view}>
        {head}
        {body}
      </div>
      {phone && view === "ready" ? (
        <div class="export-foot">
          {primaryButton}
          {captionLine}
        </div>
      ) : null}
      {/* always mounted, so it speaks when its words change: the build's, then the file's name */}
      <div class="visually-hidden" role="status" data-live="build">
        {busy ? "Building the files." : downloaded ? `Downloaded ${downloaded.filename}.` : ""}
      </div>
    </Dialog>
  );
}
