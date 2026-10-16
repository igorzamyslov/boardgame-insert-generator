// src/ui/SettingsSheet.tsx
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Notice, Printer, Settings } from "../model/types";
import { printerProblems } from "../share";
import { InsertSettings, PrintingOptions } from "./SettingsForm";
import { Modal } from "./Modal";
import { PrinterForm } from "./PrinterForm";
import { ValidationContext } from "./validation";

export type SettingsTab = "insert" | "printer";

const TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: "insert", label: "This insert" },
  { id: "printer", label: "My printer" },
];

const mm = (v: number): string => String(Math.round(v * 10) / 10);

const hasErrorUnder = (notices: readonly Notice[], prefix: string): boolean =>
  notices.some((n) => n.level === "error" && n.path?.startsWith(prefix) === true);

/** The tab an error lives on: this insert's settings first, then its printer; else "This insert". */
export function settingsTabFor(notices: readonly Notice[]): SettingsTab {
  return !hasErrorUnder(notices, "/settings") && hasErrorUnder(notices, "/printer")
    ? "printer"
    : "insert";
}

function samePrinter(a: Printer, b: Printer): boolean {
  return (
    a.bedX === b.bedX &&
    a.bedY === b.bedY &&
    a.bedZ === b.bedZ &&
    a.bedMargin === b.bedMargin &&
    a.layerHeight === b.layerHeight
  );
}

function printerText(p: Printer): string {
  return `${mm(p.bedX)} × ${mm(p.bedY)} × ${mm(p.bedZ)} mm bed, margin ${mm(p.bedMargin)} mm, layers ${mm(p.layerHeight)} mm`;
}

export interface SettingsSheetProps {
  /** This insert's settings, and how they are changed. */
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  /** The printer this insert is planned for. */
  printer: Printer;
  /** My printer: the preference every new insert starts with. */
  myPrinter: Printer;
  onMyPrinterChange: (p: Printer) => void;
  /** Puts my printer on this insert (one step to undo). */
  onApplyPrinter: () => void;
  /** The tab to start on (default: the one with an error, else "This insert"). */
  initialTab?: SettingsTab;
  /** Escape or Close: the owner unmounts the sheet, which hands the focus back to what opened it. */
  onClose: () => void;
}

/** The tab "My printer": the preference, applying it, and the options that only change the printing. */
function PrinterTab(p: SettingsSheetProps) {
  const notices = useContext(ValidationContext);
  const [notSaved, setNotSaved] = useState<string | null>(null);
  const same = samePrinter(p.printer, p.myPrinter);
  const problems = notices.filter((n) => n.level === "error" && n.path?.startsWith("/printer"));
  return (
    <div class="settings-stack">
      <section class="settings-group" aria-labelledby="settings-printer-title">
        <h3 id="settings-printer-title">Your printer</h3>
        <p class="hint">Kept in this browser. Every new insert starts with it.</p>
        <PrinterForm
          printer={p.myPrinter}
          onChange={(patch) => {
            const next = { ...p.myPrinter, ...patch };
            const found = printerProblems(next);
            setNotSaved(found.length > 0 ? found.join(" ") : null);
            if (found.length === 0) {
              p.onMyPrinterChange(next);
            }
          }}
        />
        {notSaved !== null ? (
          <p class="field-error" role="alert">{`Not saved: ${notSaved}`}</p>
        ) : null}
        <div class="settings-apply">
          <p class="hint" id="settings-apply-hint">
            {same
              ? "This insert already uses this printer."
              : `This insert is planned for ${printerText(p.printer)}. Changing your printer leaves it alone until you apply it. Applying replaces it.`}
          </p>
          {problems.map((n) => (
            <p class="field-error" key={n.message}>
              {n.message}
            </p>
          ))}
          <button
            type="button"
            class="settings-apply-btn"
            aria-disabled={same}
            aria-describedby="settings-apply-hint"
            onClick={() => {
              if (!same) {
                p.onApplyPrinter();
              }
            }}
          >
            Apply to this insert
          </button>
        </div>
      </section>
      <section class="settings-group" aria-labelledby="settings-printing-title">
        <h3 id="settings-printing-title">Printing options</h3>
        <p class="hint">For this insert. They change the printed parts, not where trays sit.</p>
        <PrintingOptions settings={p.settings} onChange={p.onSettingsChange} />
      </section>
    </div>
  );
}

/** Settings as a dialog over the page, in two tabs: how this insert is built, and my printer. */
export function SettingsSheet(p: SettingsSheetProps) {
  const notices = useContext(ValidationContext);
  const [tab, setTab] = useState<SettingsTab>(() => p.initialTab ?? settingsTabFor(notices));
  const title = useRef<HTMLHeadingElement>(null);
  // The sheet opens on demand: start at its heading.
  useEffect(() => {
    title.current?.focus();
  }, []);
  const attention: Record<SettingsTab, boolean> = {
    insert: hasErrorUnder(notices, "/settings"),
    printer: hasErrorUnder(notices, "/printer"),
  };
  const move = (key: string): void => {
    const at = TABS.findIndex((t) => t.id === tab);
    const next =
      key === "ArrowRight"
        ? TABS[(at + 1) % TABS.length]
        : key === "ArrowLeft"
          ? TABS[(at + TABS.length - 1) % TABS.length]
          : key === "Home"
            ? TABS[0]
            : key === "End"
              ? TABS[TABS.length - 1]
              : undefined;
    if (next) {
      setTab(next.id);
      document.getElementById(`settings-tab-${next.id}`)?.focus();
    }
  };
  return (
    <Modal labelledBy="settings-title" class="settings-sheet" onClose={p.onClose}>
      <h2 class="export-title" id="settings-title" tabIndex={-1} ref={title}>
        Settings
      </h2>
      <div
        class="pf-tabs"
        role="tablist"
        aria-label="Settings"
        onKeyDown={(e) => {
          if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            move(e.key);
          }
        }}
      >
        {TABS.map((t) => (
          <button
            type="button"
            role="tab"
            key={t.id}
            id={`settings-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`settings-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {attention[t.id] ? <span class="visually-hidden">, needs attention</span> : null}
            {attention[t.id] ? <span class="settings-dot" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
        class="settings-panel"
      >
        {tab === "insert" ? (
          <InsertSettings settings={p.settings} onChange={p.onSettingsChange} />
        ) : (
          <PrinterTab {...p} />
        )}
      </div>
    </Modal>
  );
}
