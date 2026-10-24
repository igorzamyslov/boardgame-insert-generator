// src/ui/SettingsSheet.tsx
// Settings: the right-hand drawer of the Settings board. A header (the title, how many values
// changed, Reset all, Close), two tabs, a body that is the only thing that scrolls, and a foot
// with Done. "This insert" is the plain choices and the searchable Exact numbers; "My printer" is
// the browser's printer and the printing options. DESIGN §5 and §7.
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { Button, CloseButton, Drawer, Segmented } from "../kit";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Joint, Notice, Printer, Settings } from "../model/types";
import { printerProblems } from "../share";
import { InsertSettings, PrintingOptions } from "./SettingsForm";
import { PrinterForm } from "./PrinterForm";
import { changedByTab, changedCount } from "./settingsFields";
import type { NameExample } from "./settingsFields";
import { ValidationContext } from "./validation";
import "./settings.css";

export type SettingsTab = "insert" | "printer";

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

export interface SettingsSheetProps {
  /** This insert's settings, and how they are changed. */
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  /** The joint the current plan was made with, so Auto can say which one it chose. */
  plannedJoint?: Joint;
  /** The printer this insert is planned for. */
  printer: Printer;
  /** My printer: the preference every new insert starts with. */
  myPrinter: Printer;
  onMyPrinterChange: (p: Printer) => void;
  /** Puts my printer on this insert (one step to undo). */
  onApplyPrinter: () => void;
  /** The tab to start on (default: the one with an error, else "This insert"). */
  initialTab?: SettingsTab;
  /** A tray whose engraved name is shorter than its full one: the engraving's hint gives it as the example. */
  nameExample?: NameExample;
  /** Escape or Close: the owner unmounts the sheet, which hands the focus back to what opened it. */
  onClose: () => void;
}

/** The tab "My printer": this insert's printer when it differs, then the preference and the printing options. */
function PrinterTab(p: SettingsSheetProps) {
  const notices = useContext(ValidationContext);
  const [notSaved, setNotSaved] = useState<string | null>(null);
  const differs = !samePrinter(p.printer, p.myPrinter);
  const problems = notices.filter((n) => n.level === "error" && n.path?.startsWith("/printer"));
  return (
    <>
      {problems.map((n) => (
        <p class="st-problem" key={n.message}>
          {n.message}
        </p>
      ))}
      {differs ? (
        <div class="st-other">
          <span>This insert uses another printer</span>
          <Button variant="secondary" onClick={p.onApplyPrinter}>
            Apply
          </Button>
        </div>
      ) : null}
      <p class="st-intro">Bed, margin and layer height are kept in this browser.</p>
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
      >
        {notSaved !== null ? (
          <p class="k-field__error" role="alert">{`Not saved: ${notSaved}`}</p>
        ) : null}
      </PrinterForm>
      <PrintingOptions
        settings={p.settings}
        onChange={p.onSettingsChange}
        nameExample={p.nameExample}
      />
    </>
  );
}

/** Settings as a drawer over the page, in two tabs: how this insert is built, and my printer. */
export function SettingsSheet(p: SettingsSheetProps) {
  const notices = useContext(ValidationContext);
  const [tab, setTab] = useState<SettingsTab>(() => p.initialTab ?? settingsTabFor(notices));
  const title = useRef<HTMLHeadingElement>(null);
  // The drawer opens on demand: start at its heading.
  useEffect(() => {
    title.current?.focus();
  }, []);
  const changed = changedCount(p.settings);
  const byTab = changedByTab(p.settings);
  return (
    <Drawer labelledBy="settings-title" onClose={p.onClose}>
      <div class="st-head">
        <h1 class="st-title" id="settings-title" tabIndex={-1} ref={title}>
          Settings
        </h1>
        {changed > 0 ? (
          <span class="st-count">
            <span class="st-dot" aria-hidden="true" />
            {`${changed} changed`}
          </span>
        ) : null}
        {changed > 0 ? (
          <Button
            variant="quiet"
            class="st-reset"
            onClick={() => {
              // A fresh copy: the defaults are frozen, and the store owns what it is given.
              p.onSettingsChange(structuredClone(DEFAULT_SETTINGS));
              // The button goes with the changes: keep the keyboard in the drawer.
              title.current?.focus();
            }}
          >
            Reset all
          </Button>
        ) : null}
        <CloseButton onClick={p.onClose} />
      </div>
      <div class="st-tabs">
        <Segmented<SettingsTab>
          label="Settings for"
          stretch
          options={[
            {
              value: "insert",
              label: "This insert",
              attention: hasErrorUnder(notices, "/settings"),
              changedDot: byTab.insert > 0,
            },
            {
              value: "printer",
              label: "My printer",
              attention: hasErrorUnder(notices, "/printer"),
              changedDot: byTab.printer > 0,
            },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div class="st-body">
        {tab === "insert" ? (
          <InsertSettings
            settings={p.settings}
            planned={p.plannedJoint}
            onChange={p.onSettingsChange}
          />
        ) : (
          <PrinterTab {...p} />
        )}
      </div>
      <div class="st-foot">
        <Button variant="primary" onClick={p.onClose}>
          Done
        </Button>
      </div>
    </Drawer>
  );
}
