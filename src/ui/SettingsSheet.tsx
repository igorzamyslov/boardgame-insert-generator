// src/ui/SettingsSheet.tsx
// Settings: the right-hand drawer. Its own page is "This insert" (a header with the title, how many
// values changed, Reset all and Close; the plain choices; the printing options; a foot with Done).
// Exact numbers, My printer and Display are pages it opens, each with a back button in place of the
// count: the insert's choices stay on one screen, and what belongs to the browser or to fine-tuning
// is a doorway, not a sibling tab. DESIGN §5 and §7.
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { Button, CloseButton, DisclosureRow, Drawer, IconButton, Icon, Segmented } from "../kit";
import { chooseProjection, projectionPref } from "../viewer/view";
import { DEFAULT_SETTINGS } from "../model/settings";
import type { Joint, Notice, Printer, Settings } from "../model/types";
import { printerProblems } from "../share";
import { chooseOpenView, openViewPref } from "../screens/stageView";
import type { StageView } from "../screens/StageTop";
import { EXACT_VALUES, ExactNumbersPage, InsertSettings, changedExact } from "./SettingsForm";
import type { ExactStart } from "./SettingsForm";
import { PrinterForm } from "./PrinterForm";
import { changedCount } from "./settingsFields";
import type { NameExample } from "./settingsFields";
import { groupOfPath } from "./settingsGroups";
import { ValidationContext } from "./validation";
import "./settings.css";

export type SettingsPage = "insert" | "numbers" | "printer" | "display";

const hasErrorUnder = (notices: readonly Notice[], prefix: string): boolean =>
  notices.some((n) => n.level === "error" && n.path?.startsWith(prefix) === true);

const hasFieldErrorUnder = (notices: readonly Notice[]): boolean =>
  notices.some(
    (n) =>
      n.level === "error" &&
      n.path?.startsWith("/settings") === true &&
      groupOfPath(n.path) !== undefined,
  );

/** The page an error lives on: this insert's numbers first, then its printer; else "This insert". */
export function settingsPageFor(notices: readonly Notice[]): SettingsPage {
  if (hasFieldErrorUnder(notices)) {
    return "numbers";
  }
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
  /** The page to start on (default: the one with an error, else "This insert"). */
  initialPage?: SettingsPage;
  /** A tray whose engraved name is shorter than its full one: the engraving's hint gives it as the example. */
  nameExample?: NameExample;
  /** Escape or Close: the owner unmounts the sheet, which hands the focus back to what opened it. */
  onClose: () => void;
}

const PAGE_TITLES: Record<SettingsPage, string> = {
  insert: "Settings",
  numbers: "Exact numbers",
  printer: "My printer",
  display: "Display",
};

/** The page "My printer": this insert's printer when it differs, then the preference. */
function PrinterPage(p: SettingsSheetProps) {
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
    </>
  );
}

const PROJECTION_NAME = { perspective: "Perspective", orthographic: "Orthographic" } as const;
const VIEW_NAME: Record<StageView, string> = { plan: "Top", "3d": "3D" };

/** The page "Display": how this browser shows the app (not part of any insert): the view plans open in, and the 3D view's projection. */
function DisplayPage() {
  return (
    <div class="st-stack">
      <section class="st-sec" aria-labelledby="settings-open-title">
        <h2 class="st-h2" id="settings-open-title">
          Open plans in
        </h2>
        <Segmented<StageView>
          label="Open plans in"
          stretch
          options={[
            { value: "plan", label: "Top" },
            { value: "3d", label: "3D" },
          ]}
          value={openViewPref.value}
          onChange={chooseOpenView}
        />
        <span class="st-note">Switching in the plan still works.</span>
      </section>
      <section class="st-sec" aria-labelledby="settings-3d-title">
        <h2 class="st-h2" id="settings-3d-title">
          3D view
        </h2>
        <Segmented
          label="3D view"
          stretch
          options={[
            { value: "perspective", label: PROJECTION_NAME.perspective },
            { value: "orthographic", label: PROJECTION_NAME.orthographic },
          ]}
          value={projectionPref.value}
          onChange={chooseProjection}
        />
      </section>
    </div>
  );
}

type Door = Exclude<SettingsPage, "insert">;

/** The three pages this one opens: a row each, with what is inside and what changed. */
function Doors(p: SettingsSheetProps & { onOpen: (door: Door) => void }) {
  const notices = useContext(ValidationContext);
  const bed = `Bed ${p.myPrinter.bedX} × ${p.myPrinter.bedY} mm`;
  return (
    <section class="st-sec st-doors" aria-label="More settings">
      <DisclosureRow
        plain
        data-door="numbers"
        title="Exact numbers"
        hint={
          hasFieldErrorUnder(notices)
            ? "A number needs fixing"
            : `${EXACT_VALUES} values, for fine-tuning`
        }
        changed={changedExact(p.settings)}
        onClick={() => p.onOpen("numbers")}
      />
      <DisclosureRow
        plain
        data-door="printer"
        title="My printer"
        hint={
          hasErrorUnder(notices, "/printer")
            ? "The printer needs fixing"
            : `${bed}, kept in this browser`
        }
        onClick={() => p.onOpen("printer")}
      />
      <DisclosureRow
        plain
        data-door="display"
        title="Display"
        hint={`${PROJECTION_NAME[projectionPref.value]}, opens in ${VIEW_NAME[openViewPref.value]}`}
        onClick={() => p.onOpen("display")}
      />
    </section>
  );
}

/** Settings as a drawer over the page: this insert's choices, and three pages it opens (exact numbers, my printer, display). */
export function SettingsSheet(p: SettingsSheetProps) {
  const notices = useContext(ValidationContext);
  const [at, setAt] = useState<{ page: SettingsPage; start?: ExactStart }>(() => ({
    page: p.initialPage ?? settingsPageFor(notices),
  }));
  const { page } = at;
  const title = useRef<HTMLHeadingElement>(null);
  // The door that opened the page on show: Back hands the focus to it.
  const cameFrom = useRef<Door | null>(null);
  const shown = useRef<SettingsPage | null>(null);
  // The drawer opens on demand, and a page opens at its heading; going back, at the door it came by.
  useEffect(() => {
    if (shown.current === page) {
      return;
    }
    const back = page === "insert" && shown.current !== null ? cameFrom.current : null;
    shown.current = page;
    const door =
      back === null ? null : document.querySelector<HTMLElement>(`[data-door="${back}"]`);
    (door ?? title.current)?.focus();
  }, [page]);
  const open = (next: SettingsPage, start?: ExactStart): void => {
    cameFrom.current = next === "insert" ? cameFrom.current : (next as Door);
    setAt({ page: next, start });
  };
  const changed = changedCount(p.settings);
  return (
    <Drawer labelledBy="settings-title" onClose={p.onClose}>
      <div class="st-head">
        {page !== "insert" ? (
          <IconButton
            class="st-back-page"
            label="Back to Settings"
            icon={<Icon name="chevron-left" size={20} />}
            onClick={() => open("insert")}
          />
        ) : null}
        <h1 class="st-title" id="settings-title" tabIndex={-1} ref={title}>
          {PAGE_TITLES[page]}
        </h1>
        {page === "insert" && changed > 0 ? (
          <span class="st-count">
            <span class="st-dot" aria-hidden="true" />
            {`${changed} changed`}
          </span>
        ) : null}
        {page === "insert" && changed > 0 ? (
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
      <div class="st-body">
        {page === "insert" ? (
          <InsertSettings
            settings={p.settings}
            planned={p.plannedJoint}
            nameExample={p.nameExample}
            onChange={p.onSettingsChange}
            onCustom={(group, fieldId) => open("numbers", { group, fieldId })}
          >
            <Doors {...p} onOpen={(door) => open(door)} />
          </InsertSettings>
        ) : page === "numbers" ? (
          <ExactNumbersPage
            key={`${at.start?.group ?? ""}${at.start?.fieldId ?? ""}`}
            settings={p.settings}
            onChange={p.onSettingsChange}
            start={at.start}
          />
        ) : page === "printer" ? (
          <PrinterPage {...p} />
        ) : (
          <DisplayPage />
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
