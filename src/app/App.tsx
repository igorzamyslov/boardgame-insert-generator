// src/app/App.tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AssemblyPage } from "../instructions/AssemblyPage";
import { NOTICE_CODES, printableParts } from "../layout";
import type { Component, ComponentKind } from "../model/types";
import { APP_VERSION, BUILD_ID } from "../model/version";
import { topPlane } from "../model/settings";
import { levelsOf } from "../plan/layers";
import { PlanView } from "../plan/PlanView";
import { exportJsonFile, jsonFileName } from "../share";
import { errorText } from "../util/errors";
import { AppHeader } from "../ui/AppHeader";
import { BottomSheet } from "../ui/BottomSheet";
import { BoxPanel } from "../ui/BoxPanel";
import { AddKinds } from "../ui/components/ComponentList";
import { WhatsInside } from "../ui/components/WhatsInside";
import { ExportPanel } from "../ui/ExportPanel";
import { Modal } from "../ui/Modal";
import { Notices, PlanBanners } from "../ui/Notices";
import { placeNotices } from "../ui/noticePlacement";
import { ProjectMenu } from "../ui/ProjectMenu";
import { SettingsSheet, settingsTabFor } from "../ui/SettingsSheet";
import type { SettingsTab } from "../ui/SettingsSheet";
import { misfitOf } from "../ui/noFit";
import { StatusLine } from "../ui/StatusLine";
import { PHONE_QUERY, useMediaQuery } from "../ui/useMediaQuery";
import { Summary } from "../ui/Summary";
import { SelectedTrayBar } from "../ui/SelectedTrayBar";
import { Section } from "../ui/Section";
import {
  SettingsContext,
  SizingContext,
  ValidationContext,
  errorsWithoutField,
} from "../ui/validation";
import { Viewer } from "../viewer/Viewer";
import type { ViewerProps } from "../viewer/Viewer";
import {
  addComponent,
  lockedKeys,
  removeComponent,
  removeLock,
  renameProject,
  setSettings,
  swapTrays,
  sizeLockedKeys,
  applyPrinter,
  unpinTrays,
  updateBox,
  updateComponent,
} from "./actions";
import { downloadBlob } from "./download";
import type { MeshSource } from "./meshes";
import { OPEN_FAILED_CODE } from "./persistence";
import { GEOMETRY_MAJOR_CODE, STALE_CODE } from "./state";
import { canOptimize } from "./runner";
import { shareFile } from "./sendFile";
import type { ShareFile } from "./sendFile";
import type { AppStore } from "./store";

export interface AppProps {
  store: AppStore;
  meshes: MeshSource;
  download?: (blob: Blob, filename: string) => void;
  /** Puts a file into the phone's share sheet (default: `navigator.share`); tests inject it. */
  share?: ShareFile;
  viewerProps?: Pick<ViewerProps, "webgl" | "loadScene">;
}

type SectionId = "box" | "components";
/** What a validation path belongs to: a rail section, or the settings sheet. */
type PathHome = SectionId | "settings";
type ViewId = "plan" | "3d";

const SECTION_TITLES: Record<SectionId, string> = {
  box: "The box",
  components: "What's inside",
};

/** Where the fields a validation path belongs to are: a rail section, or the settings sheet. */
function sectionOf(path: string | undefined): PathHome | null {
  if (path === undefined) {
    return null;
  }
  if (path.startsWith("/box")) {
    return "box";
  }
  if (path.startsWith("/components")) {
    return "components";
  }
  return path.startsWith("/settings") || path.startsWith("/printer") ? "settings" : null;
}

const mm = (v: number): string => String(Math.round(v * 10) / 10);

export function App(props: AppProps) {
  const { store, meshes } = props;
  const s = store.state;
  // The project the assembly page was opened for: another project, or one without a layout,
  // never shows it (a later layout must not pop the page back open on its own).
  const [assemblyFor, setAssemblyFor] = useState<string | null>(null);
  const project = s.project.value;
  const layout = project.layout;
  // The parts to print: the stored trays, with the height a stack doesn't need split off as a
  // riser under it (spec §3 rule 2) and each stretch spacer split into its component's plates
  // (spec §6.2), then each spacer or plate opened into a walled box where the `leftover` style and
  // its size allow, then connected fillers merged into parts that fit the bed (the two merge
  // switches). The plan, 3D view, export and instructions all list these.
  const { settings: projSettings, printer: projPrinter, locks: projLocks } = project;
  const projComponents = project.components;
  const { printable, separatorNotices } = useMemo(() => {
    if (!layout) {
      return { printable: [], separatorNotices: [] };
    }
    const printed = printableParts(layout.trays, {
      components: projComponents,
      settings: projSettings,
      printer: projPrinter,
      locks: projLocks,
    });
    return { printable: printed.trays, separatorNotices: printed.notices };
  }, [layout, projSettings, projPrinter, projLocks, projComponents]);
  // The plate counts cut back at print time are told with the other sizing notes.
  const sizingNotices = useMemo(
    () => [...s.sizingNotices.value, ...separatorNotices],
    [s.sizingNotices.value, separatorNotices],
  );
  const layoutNotices = useMemo(
    () => [...s.layoutNotices.value, ...separatorNotices],
    [s.layoutNotices.value, separatorNotices],
  );
  const showAssembly = assemblyFor === project.id && layout !== undefined;
  const mainRef = useRef<HTMLElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const [openSection, setOpenSection] = useState<SectionId | null>(
    project.components.length === 0 ? "box" : "components",
  );
  // The component whose editor is open in the rail (null: the list). The tray bar's Edit sets it
  // too, and a first item added from the first visit opens at once.
  const [editingId, setEditingId] = useState<string | null>(null);
  const firstVisit = project.components.length === 0;
  // Below 760 px the rail is a sheet at the foot of the screen: folded, with its handle showing.
  const phone = useMediaQuery(PHONE_QUERY);
  const [sheetOpen, setSheetOpen] = useState(false);
  // A tray picked on a phone: its bar comes up over the sheet's handle, not under it.
  const selection = s.selection.value;
  useEffect(() => {
    if (phone && selection !== null) {
      document.querySelector(".tray-bar")?.scrollIntoView?.({ block: "nearest" });
    }
  }, [phone, selection]);
  // Removing the last item swaps the rail for the first visit: the focus goes to the kinds there.
  const wasFirstVisit = useRef(firstVisit);
  useEffect(() => {
    if (firstVisit && !wasFirstVisit.current) {
      setSheetOpen(false);
      if (document.activeElement === document.body) {
        mainRef.current?.querySelector<HTMLElement>(".pf-kinds button")?.focus();
      }
    }
    wasFirstVisit.current = firstVisit;
  }, [firstVisit]);
  const [view, setView] = useState<ViewId>("plan");
  // A swap belongs to the plan: it ends when the view moves away from it.
  function showView(next: ViewId): void {
    if (next !== "plan") {
      s.swapFrom.value = null;
    }
    setView(next);
  }
  // The export is a dialog over whichever view is showing, so closing it leaves everything as it was.
  const [exportOpen, setExportOpen] = useState(false);
  // The settings sheet is a dialog too; null while it is closed.
  const [settingsOpen, setSettingsOpen] = useState<{ tab: SettingsTab } | null>(null);
  // The component just removed, for the Undo toast (cleared when another project opens).
  const [removed, setRemoved] = useState<{ component: Component; version: number } | null>(null);
  // The older plan the person chose to keep (project and geometry line), so its banner stays away.
  const [geometryKept, setGeometryKept] = useState<string | null>(null);
  const run = s.run.value;
  useEffect(() => {
    setRemoved(null);
    setExportOpen(false);
    setSettingsOpen(null);
    setSheetOpen(false);
  }, [project.id]);
  const locked = lockedKeys(project);
  const sizeLocked = sizeLockedKeys(project);

  useEffect(() => {
    if (assemblyFor !== null && !showAssembly) {
      setAssemblyFor(null);
    }
  }, [assemblyFor, showAssembly]);

  // A page swap replaces everything on screen: put the reader at the top of the new page, and
  // bring them back to the button they pressed when they return.
  useEffect(() => {
    if (showAssembly) {
      window.scrollTo(0, 0);
      mainRef.current?.querySelector("h1")?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      downloadButtonRef.current?.focus();
    }
  }, [showAssembly]);

  const download = props.download ?? downloadBlob;

  if (showAssembly) {
    return (
      <main ref={mainRef}>
        <AssemblyPage
          project={project}
          layout={{ ...layout, trays: printable }}
          stale={s.stale.value}
          download={download}
          onBack={() => {
            restoreFocus.current = true;
            setAssemblyFor(null);
          }}
        />
      </main>
    );
  }

  const validation = s.validation.value;
  const problems = new Set<PathHome>();
  for (const n of validation) {
    const id = n.level === "error" ? sectionOf(n.path) : null;
    if (id !== null) {
      problems.add(id);
    }
  }
  const sections: { id: SectionId; step: number }[] = [
    { id: "box", step: 1 },
    { id: "components", step: 2 },
  ];
  const problemSections: { id: PathHome; title: string }[] = [
    ...sections
      .filter((x) => problems.has(x.id))
      .map((x) => ({ id: x.id, title: SECTION_TITLES[x.id] })),
    ...(problems.has("settings") ? [{ id: "settings" as const, title: "Settings" }] : []),
  ];
  const summaries: Record<SectionId, string> = {
    box: `${mm(project.box.innerWidth)} × ${mm(project.box.innerDepth)} × ${mm(project.box.innerHeight)} mm`,
    components:
      project.components.length === 0
        ? "nothing yet"
        : project.components.length === 1
          ? "1 item"
          : `${project.components.length} items`,
  };
  // The settings sheet, over whichever view is showing; `tab` is the one it opens on.
  const openSettings = (tab?: SettingsTab): void =>
    setSettingsOpen({ tab: tab ?? settingsTabFor(validation) });
  const showSection = (id: string): void => {
    if (id === "settings") {
      openSettings();
      return;
    }
    setOpenSection(id as SectionId);
    setSheetOpen(true);
    document.getElementById(`section-${id}`)?.scrollIntoView?.({ block: "nearest" });
  };
  const addComponentOfKind = (kind: ComponentKind): void => {
    store.edit((q) => addComponent(q, kind));
    // From the first visit the list is not on screen yet to open the new item by itself.
    if (firstVisit) {
      setEditingId(store.state.project.peek().components.at(-1)?.id ?? null);
      setSheetOpen(true);
    }
    setOpenSection("components");
  };
  // The tray bar's and the status line's Edit: the component's editor, in the list's place, as a click on its row opens it.
  const editComponent = (id: string): void => {
    showSection("components");
    setEditingId(id);
  };
  const addExample = (): void => {
    store.edit((q) => (["cards", "bulk", "tiles"] as const).reduce(addComponent, q));
    setOpenSection("components");
  };
  // Where each notice shows: the one banner, the project menu (with a dot), or inline.
  const noFit =
    s.shortfall.value !== null || layoutNotices.some((n) => n.code === NOTICE_CODES.doesNotFit);
  const geometryKey = layout ? `${project.id}|${layout.geometryVersion}` : "";
  // The older-geometry notice the person chose to keep is not shown, so it must not hide the stale
  // one either (placeNotices lets the geometry notice speak for both).
  const placed = placeNotices(
    [
      ...s.appNotices.value,
      ...layoutNotices.filter(
        (n) =>
          n.code === STALE_CODE || (n.code === GEOMETRY_MAJOR_CODE && geometryKept !== geometryKey),
      ),
    ],
    { runPending: s.runPending.value, runStatus: run.status, noFit },
  );
  const showStale = placed.banner.some((n) => n.code === STALE_CODE);
  const showGeometry = placed.banner.some((n) => n.code === GEOMETRY_MAJOR_CODE);
  // The stale and older-geometry notices are the banner's: the summary lists the others.
  const summaryNotices = layoutNotices.filter(
    (n) => n.code !== STALE_CODE && n.code !== GEOMETRY_MAJOR_CODE,
  );
  // The file chooser lives here, not in the menu: the menu may close while the system dialog is up.
  async function readFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      store.pushNotice({
        level: "error",
        code: OPEN_FAILED_CODE,
        message: `Couldn't read ${file.name}: ${errorText(e)}`,
      });
      return;
    } finally {
      input.value = "";
    }
    store.importJson(text);
  }
  const saveFile = (): void => {
    download(exportJsonFile(project, s.foreign.value), jsonFileName(project));
    store.markSavedToFile();
  };
  // Phone: the share sheet takes the file; where it can't, Send file is Save file.
  const sendFile = async (): Promise<void> => {
    const name = jsonFileName(project);
    const file = new File([exportJsonFile(project, s.foreign.value)], name, {
      type: "application/json",
    });
    const result = await (props.share ?? shareFile)(file);
    if (result === "shared") {
      store.markSavedToFile();
    } else if (result === "unsupported") {
      saveFile();
    }
  };
  // What the plan holds, for the sentence, the Export button and the layers named in the list.
  const planCurrent = layout !== undefined && !s.stale.value && run.status !== "running";
  const listTrays = planCurrent ? printable : undefined;
  const layers = layout ? levelsOf(layout.trays).length : 0;
  // What the status line says of a plan that matches the inputs: how many trays, how high.
  const summary = s.summary.value;
  const fits =
    layout !== undefined && summary !== null && !s.stale.value
      ? {
          trays: summary.trayCount,
          layers: Math.max(1, layers),
          height: Math.max(0, ...layout.trays.map((t) => t.z + t.h)),
          // the height below the space the box keeps free on top (where every stack reaches)
          boxHeight: topPlane(project.box, projSettings),
        }
      : null;
  const conflicts = s.lockConflicts.value;
  // Download waits while the plan changes by itself; otherwise a plan that doesn't fit says so.
  const fitProblem = !s.runPending.value && (noFit || conflicts.length > 0);

  // A tray is selected and in the plan: its bar shows, and the plan's generic hint goes.
  const hasSelectedTray =
    layout !== undefined && printable.some((t) => t.key === s.selection.value);
  const barProps = {
    project,
    trays: printable,
    selectedKey: layout ? s.selection.value : null,
    stale: s.stale.value,
    edit: store.edit,
    onSelect: (key: string | null) => {
      s.selection.value = key;
    },
    onSwapFromChange: (key: string | null) => {
      s.swapFrom.value = key;
    },
    onEditComponent: editComponent,
  };

  // The box and the list: the rail's two sections (on a phone, the sheet's).
  const railSections = (
    <>
      {sections.map((x) => (
        <Section
          key={x.id}
          id={x.id}
          step={x.step}
          title={SECTION_TITLES[x.id]}
          summary={summaries[x.id]}
          problem={problems.has(x.id)}
          open={openSection === x.id}
          onToggle={(open) => setOpenSection(open ? x.id : null)}
        >
          {x.id === "box" ? (
            <BoxPanel
              box={project.box}
              onChange={(patch) => store.edit((q) => updateBox(q, patch))}
            />
          ) : null}
          {x.id === "components" ? (
            <WhatsInside
              components={project.components}
              openId={editingId}
              onOpenChange={setEditingId}
              trays={listTrays}
              locks={project.locks}
              onAdd={addComponentOfKind}
              onUnpin={(keys) => store.edit((q) => unpinTrays(q, keys))}
              onUnlockSize={(keys) =>
                store.edit((q) => keys.reduce((p, key) => removeLock(p, key, "size"), q))
              }
              onChange={(id, next) => store.edit((q) => updateComponent(q, id, next))}
              onRemove={(id) => {
                const component = project.components.find((x) => x.id === id);
                if (component === undefined) {
                  return false;
                }
                store.edit((q) => removeComponent(q, id));
                // Undo on the toast is only right while the removal is still the latest step.
                setRemoved({ component, version: s.history.version.peek() });
                return true;
              }}
            />
          ) : null}
        </Section>
      ))}
    </>
  );
  // The line at the foot of the page; on a phone the sheet holds it, so the handle stays clear.
  const footer = (
    <footer class="app-footer">
      {`Insert Generator v${APP_VERSION} (${BUILD_ID}) · `}
      <a href="./third-party-licenses.txt">Third-party licenses</a>
    </footer>
  );
  // Below 760 px the status pill has no room for Keep searching on a plan that doesn't fit:
  // the sheet's bar offers it.
  const searchOnPhone =
    noFit &&
    !s.geometryOld.value &&
    !s.runPending.value &&
    run.status !== "running" &&
    canOptimize(project, validation);

  return (
    <ValidationContext.Provider value={validation}>
      <SizingContext.Provider value={sizingNotices}>
        <SettingsContext.Provider value={projSettings}>
          <div class="pf-app">
            <div class="app-top">
              <AppHeader
                name={project.name}
                onRename={(name) => store.edit((q) => renameProject(q, name))}
                saveState={s.saveState.value}
                canUndo={store.canUndo.value}
                canRedo={store.canRedo.value}
                onUndo={() => store.undo()}
                onRedo={() => store.redo()}
                downloadRef={downloadButtonRef}
                onDownload={() => setExportOpen(true)}
                downloadDisabled={
                  layout === undefined || s.stale.value || s.runPending.value || fitProblem
                }
                downloadLabel={fitProblem ? "Fix the fit to download" : undefined}
                downloadReason={
                  layout === undefined
                    ? undefined
                    : s.runPending.value
                      ? "Wait for the plan to finish"
                      : s.stale.value
                        ? "Update the plan first"
                        : undefined
                }
                menuDot={placed.menu.length > 0}
                menuNoticeCount={placed.menu.length}
                menu={(close) => (
                  <ProjectMenu
                    name={project.name}
                    currentId={project.id}
                    projects={s.projects.value}
                    storageAvailable={store.storageAvailable}
                    onClose={close}
                    onOpen={(id) => store.openProject(id)}
                    onNew={() => store.newProject()}
                    onDelete={(id) => store.deleteProject(id)}
                    onOpenFile={() => fileRef.current?.click()}
                    onSaveFile={saveFile}
                    onSendFile={() => {
                      void sendFile();
                    }}
                    onSettings={() => openSettings()}
                    notices={placed.menu}
                    conflict={s.conflict.value}
                    onResolveConflict={(choice) => store.resolveConflict(choice)}
                    onDismissNotice={(code) => store.dismissNotice(code)}
                  />
                )}
              />
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                class="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
                aria-label="Open an insert file"
                onChange={(e) => {
                  void readFile(e.currentTarget);
                }}
              />
              {showStale || showGeometry || placed.inline.length > 0 ? (
                <div class="app-notices">
                  <PlanBanners
                    stale={showStale}
                    geometryOld={showGeometry}
                    onUpdate={() => store.refit()}
                    onReprint={() => store.refit()}
                    onKeepOld={() => setGeometryKept(geometryKey)}
                  />
                  <Notices
                    notices={placed.inline}
                    label="App messages"
                    limit={3}
                    onDismiss={(code) => store.dismissNotice(code)}
                  />
                </div>
              ) : null}
            </div>
            <div class="pf-app__body" data-first-visit={firstVisit ? "true" : undefined}>
              {firstVisit ? null : phone ? (
                <BottomSheet
                  label="The box and what's inside"
                  title="What's inside"
                  meta={summaries.components}
                  expanded={sheetOpen}
                  full={editingId !== null || openSection === "box"}
                  onExpandedChange={(open) => {
                    setSheetOpen(open);
                    // The box has the sheet to itself: folding it comes back to the list.
                    if (!open && openSection === "box") {
                      setOpenSection("components");
                    }
                  }}
                  action={
                    searchOnPhone ? (
                      <button
                        type="button"
                        onClick={() => {
                          store.refit();
                          // The button goes with the search: the handle keeps the place.
                          document.querySelector<HTMLElement>(".pf-sheet__handle")?.focus();
                        }}
                      >
                        Keep searching
                      </button>
                    ) : undefined
                  }
                >
                  {railSections}
                  {footer}
                </BottomSheet>
              ) : (
                <section class="pf-app__rail" aria-label="Inputs">
                  {railSections}
                </section>
              )}
              <main class="pf-app__stage" ref={mainRef}>
                <h2 class="visually-hidden">Results</h2>
                <StatusLine
                  run={run}
                  pending={s.runPending.value}
                  canOptimize={canOptimize(project, validation)}
                  hasLayout={layout !== undefined}
                  fits={fits}
                  canSearchMore={!s.geometryOld.value}
                  noFit={
                    noFit
                      ? {
                          misfit: misfitOf(
                            s.noFitAttempt.value,
                            project.box,
                            projSettings,
                            project.components,
                          ),
                        }
                      : null
                  }
                  conflicts={conflicts}
                  onKeepSearching={() => store.refit()}
                  onStop={() => store.cancelRun()}
                  onEdit={editComponent}
                  onUnpin={(c) => store.unpin(c.trayKey, c.kind)}
                />
                <Summary
                  summary={summary}
                  run={run}
                  notices={summaryNotices}
                  hasLayout={layout !== undefined}
                  canOptimize={canOptimize(project, validation)}
                  hasComponents={project.components.length > 0}
                  hiddenErrors={errorsWithoutField(validation)}
                  problemSections={problemSections}
                  onShowSection={showSection}
                  onRetry={() => store.retry()}
                />
                {firstVisit ? (
                  <section class="pf-first" aria-label="Start">
                    <h2>Fit your game into its box.</h2>
                    <div class="pf-first__step">
                      <h3>Measure the box</h3>
                      <BoxPanel
                        box={project.box}
                        onChange={(patch) => store.edit((q) => updateBox(q, patch))}
                      />
                    </div>
                    <div class="pf-first__step">
                      <h3>Pick what goes inside</h3>
                      <AddKinds onAdd={addComponentOfKind} label="Pick what goes inside" />
                      <button type="button" onClick={addExample}>
                        Start from an example game
                      </button>
                    </div>
                    <p class="hint">Your inserts are saved in this browser.</p>
                  </section>
                ) : layout ? (
                  <section class="pf-frame pf-view" aria-label="Preview">
                    <div class="pf-view__head">
                      <div
                        class="pf-tabs"
                        role="tablist"
                        aria-label="Views"
                        onKeyDown={(e) => {
                          const order: ViewId[] = ["plan", "3d"];
                          const at = order.indexOf(view);
                          const next =
                            e.key === "ArrowRight"
                              ? order[(Math.max(at, 0) + 1) % order.length]
                              : e.key === "ArrowLeft"
                                ? order[(Math.max(at, 0) + order.length - 1) % order.length]
                                : e.key === "Home"
                                  ? order[0]
                                  : e.key === "End"
                                    ? order[order.length - 1]
                                    : undefined;
                          if (next !== undefined) {
                            e.preventDefault();
                            showView(next);
                            document.getElementById(`tab-${next}`)?.focus();
                          }
                        }}
                      >
                        {(
                          [
                            ["plan", "Plan"],
                            ["3d", "3D"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            type="button"
                            role="tab"
                            key={id}
                            id={`tab-${id}`}
                            aria-selected={view === id}
                            aria-controls={`panel-${id}`}
                            tabIndex={view === id ? 0 : -1}
                            onClick={() => showView(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div class="pf-toolbar__group">
                        {s.stale.value ? <span class="pf-badge">Out of date</span> : null}
                        {run.status === "running" ? <span class="pf-badge">Updating…</span> : null}
                      </div>
                    </div>
                    <div
                      class="pf-view__body"
                      role="tabpanel"
                      id={`panel-${view}`}
                      aria-labelledby={`tab-${view}`}
                    >
                      {view === "plan" ? (
                        <PlanView
                          trays={printable}
                          box={project.box}
                          settings={project.settings}
                          components={project.components}
                          lockedKeys={locked}
                          selectedKey={s.selection.value}
                          stale={s.stale.value}
                          level={s.viewLevel.value}
                          onLevelChange={(l) => {
                            s.viewLevel.value = l;
                          }}
                          swapFrom={s.swapFrom.value}
                          onSwapFromChange={(key) => {
                            s.swapFrom.value = key;
                          }}
                          onSelect={(key) => {
                            s.selection.value = key;
                          }}
                          onSwap={(a, b) => store.edit((q) => swapTrays(q, a, b))}
                          sizeLockedKeys={sizeLocked}
                          bar={
                            hasSelectedTray ? (
                              <SelectedTrayBar {...barProps} inPlan swapFrom={s.swapFrom.value} />
                            ) : undefined
                          }
                        />
                      ) : null}
                      {view === "3d" ? (
                        <>
                          <Viewer
                            trays={printable}
                            box={project.box}
                            settings={project.settings}
                            components={project.components}
                            stale={s.stale.value}
                            meshes={meshes}
                            selectedKey={s.selection.value}
                            onSelect={(key) => {
                              s.selection.value = key;
                            }}
                            {...props.viewerProps}
                          />
                          {hasSelectedTray ? (
                            <div class="view-bar">
                              <SelectedTrayBar {...barProps} inPlan={false} swapFrom={null} />
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    {exportOpen ? (
                      <Modal labelledBy="export-title" onClose={() => setExportOpen(false)}>
                        <ExportPanel
                          titleId="export-title"
                          trays={printable}
                          components={project.components}
                          printer={project.printer}
                          settings={project.settings}
                          meshes={meshes}
                          projectName={project.name}
                          summary={s.summary.value}
                          disabled={run.status === "running"}
                          stale={s.stale.value}
                          download={download}
                          onOpenGuide={() => {
                            setExportOpen(false);
                            setAssemblyFor(project.id);
                          }}
                        />
                      </Modal>
                    ) : null}
                  </section>
                ) : (
                  <section class="pf-frame pf-view" aria-label="Preview">
                    <div class="stage-empty">
                      <div class="stage-empty-box">
                        <span class="pf-measure">{`Your box, ${mm(project.box.innerWidth)} × ${mm(project.box.innerDepth)} mm`}</span>
                      </div>
                      <h2>Working out the trays…</h2>
                      <p>The plan appears here as soon as every field is valid.</p>
                    </div>
                  </section>
                )}
                {removed !== null && removed.version === s.history.version.value ? (
                  <div class="pf-toast stage-block" role="status">
                    {`Removed “${removed.component.name === "" ? "(unnamed)" : removed.component.name}”. `}
                    <button
                      type="button"
                      class="pf-link"
                      onClick={() => {
                        setRemoved(null);
                        store.undo();
                        setOpenSection("components");
                      }}
                    >
                      Undo removal
                    </button>
                    <button type="button" class="pf-link" onClick={() => setRemoved(null)}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </main>
            </div>
            {phone && !firstVisit ? null : footer}
            {settingsOpen !== null ? (
              <SettingsSheet
                initialTab={settingsOpen.tab}
                settings={project.settings}
                onSettingsChange={(next) => store.edit((q) => setSettings(q, next))}
                printer={project.printer}
                myPrinter={store.prefs.printer.value}
                onMyPrinterChange={(p) => store.prefs.setPrinter(p)}
                onApplyPrinter={() =>
                  store.edit((q) => applyPrinter(q, store.prefs.printer.peek()))
                }
                onClose={() => setSettingsOpen(null)}
              />
            ) : null}
          </div>
        </SettingsContext.Provider>
      </SizingContext.Provider>
    </ValidationContext.Provider>
  );
}
