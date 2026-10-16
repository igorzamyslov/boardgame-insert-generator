// src/app/App.tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AssemblyPage } from "../instructions/AssemblyPage";
import { numberParts } from "../instructions/numbering";
import { printableParts } from "../layout";
import { DEFAULT_PRINTER } from "../model/defaults";
import type { Component, ComponentKind, Notice, Project, TraySpec } from "../model/types";
import { APP_VERSION, BUILD_ID } from "../model/version";
import { levelsOf } from "../plan/layers";
import { PlanView } from "../plan/PlanView";
import { encodeHash, exportJsonFile, jsonFileName } from "../share";
import { BoxForm } from "../ui/BoxForm";
import { AddKinds, ComponentList } from "../ui/components/ComponentList";
import { trayNumbersByComponent } from "../ui/identity";
import { ExportPanel } from "../ui/ExportPanel";
import { Modal } from "../ui/Modal";
import { Notices } from "../ui/Notices";
import { PrinterForm } from "../ui/PrinterForm";
import { ProjectMenu } from "../ui/ProjectMenu";
import { SettingsForm } from "../ui/SettingsForm";
import { Summary } from "../ui/Summary";
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
  renameProject,
  setSettings,
  swapTrays,
  sizeLockedKeys,
  toggleLock,
  toggleSizeLock,
  updateBox,
  updateComponent,
  updatePrinter,
} from "./actions";
import { downloadBlob } from "./download";
import { copyLink, shareLink } from "./link";
import type { CopyLinkResult } from "./link";
import type { MeshSource } from "./meshes";
import { CONFLICT_CODE } from "./persistence";
import { canOptimize } from "./runner";
import type { AppStore } from "./store";

export interface AppProps {
  store: AppStore;
  meshes: MeshSource;
  clipboard?: (text: string) => Promise<void>;
  currentHref?: () => string;
  download?: (blob: Blob, filename: string) => void;
  viewerProps?: Pick<ViewerProps, "webgl" | "loadScene">;
}

type SectionId = "box" | "printer" | "components" | "settings";
type ViewId = "plan" | "3d";

const SECTION_TITLES: Record<SectionId, string> = {
  box: "The box",
  printer: "Your printer",
  components: "What goes inside",
  settings: "Walls and fit",
};

/** The section whose fields a validation path belongs to. */
function sectionOf(path: string | undefined): SectionId | null {
  if (path === undefined) {
    return null;
  }
  if (path.startsWith("/box")) {
    return "box";
  }
  if (path.startsWith("/printer")) {
    return "printer";
  }
  if (path.startsWith("/components")) {
    return "components";
  }
  return path.startsWith("/settings") ? "settings" : null;
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
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => {
    if (menuRef.current) {
      menuRef.current.open = false;
    }
  };
  // The Project menu is a <details>: it closes on a click outside it, on Escape (focus goes back
  // to its button), and on choosing a project.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const menu = menuRef.current;
      if (menu?.open && e.target instanceof Node && !menu.contains(e.target)) {
        menu.open = false;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const menu = menuRef.current;
      if (e.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const advanced = s.mode.value === "advanced";
  const [openSection, setOpenSection] = useState<SectionId | null>(
    project.components.length === 0 ? "box" : "components",
  );
  const [view, setView] = useState<ViewId>("plan");
  // The export is a dialog over whichever view is showing, so closing it leaves everything as it was.
  const [exportOpen, setExportOpen] = useState(false);
  // The component just removed, for the Undo toast (cleared when another project opens).
  const [removed, setRemoved] = useState<{ component: Component; version: number } | null>(null);
  const run = s.run.value;
  useEffect(() => {
    setRemoved(null);
    setExportOpen(false);
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
      exportButtonRef.current?.focus();
    }
  }, [showAssembly]);

  const withTray = (key: string, fn: (tray: TraySpec) => (q: Project) => Project): void => {
    const tray = layout?.trays.find((t) => t.key === key);
    if (tray) {
      store.edit(fn(tray));
    }
  };
  const download = props.download ?? downloadBlob;

  async function onCopyLink(): Promise<CopyLinkResult> {
    const href = (props.currentHref ?? (() => window.location.href))();
    const link = shareLink(href, encodeHash(project, s.foreign.value));
    const write = props.clipboard ?? ((text: string) => navigator.clipboard.writeText(text));
    return copyLink(link, write);
  }

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
  const problems = new Set<SectionId>();
  for (const n of validation) {
    const id = n.level === "error" ? sectionOf(n.path) : null;
    // Settings are only on screen in Advanced mode; their errors are listed in the summary.
    if (id !== null && (id !== "settings" || advanced)) {
      problems.add(id);
    }
  }
  const sections: { id: SectionId; advanced: boolean; step?: number }[] = [
    { id: "box", advanced: false, step: 1 },
    { id: "components", advanced: false, step: 2 },
    { id: "printer", advanced: false, step: 3 },
    { id: "settings", advanced: true },
  ];
  const shownSections = sections.filter((x) => advanced || !x.advanced);
  const problemSections = shownSections
    .filter((x) => problems.has(x.id))
    .map((x) => ({ id: x.id, title: SECTION_TITLES[x.id] }));
  const printer = project.printer;
  const bedSize = `${mm(printer.bedX)} × ${mm(printer.bedY)} × ${mm(printer.bedZ)} mm`;
  const defaultBed =
    printer.bedX === DEFAULT_PRINTER.bedX &&
    printer.bedY === DEFAULT_PRINTER.bedY &&
    printer.bedZ === DEFAULT_PRINTER.bedZ;
  const summaries: Record<SectionId, string> = {
    box: `${mm(project.box.innerWidth)} × ${mm(project.box.innerDepth)} × ${mm(project.box.innerHeight)} mm`,
    printer: advanced
      ? `${bedSize} · margin ${mm(printer.bedMargin)} mm · layers ${mm(printer.layerHeight)} mm`
      : `${bedSize}${defaultBed ? " · default" : ""}`,
    components:
      project.components.length === 0
        ? "nothing yet"
        : project.components.length === 1
          ? "1 item"
          : `${project.components.length} items`,
    settings: `${mm(project.settings.wall)} mm walls · fit ×${mm(project.settings.fit)}`,
  };
  const showSection = (id: string): void => {
    setOpenSection(id as SectionId);
    document.getElementById(`section-${id}`)?.scrollIntoView({ block: "nearest" });
  };
  const addComponentOfKind = (kind: ComponentKind): void => {
    store.edit((q) => addComponent(q, kind));
    setOpenSection("components");
  };
  const addExample = (): void => {
    store.edit((q) => (["cards", "bulk", "tiles"] as const).reduce(addComponent, q));
    setOpenSection("components");
  };
  const notices: readonly Notice[] = s.appNotices.value;
  // What the plan holds, for the sentence, the Export button and the tray numbers of the list.
  const parts = layout ? numberParts(printable) : [];
  const planCurrent = layout !== undefined && !s.stale.value && run.status !== "running";
  const trayNumbers = planCurrent ? trayNumbersByComponent(parts, project.components) : undefined;
  const layers = layout ? levelsOf(layout.trays).length : 0;
  const spares = layout ? layout.trays.filter((t) => t.part === "leftover").length : 0;
  const partTotal = printable.length;

  return (
    <ValidationContext.Provider value={validation}>
      <SizingContext.Provider value={sizingNotices}>
        <SettingsContext.Provider value={projSettings}>
          <div class="pf-app" data-level={advanced ? "advanced" : "simple"}>
            <div class="app-top">
              <header class="pf-app__bar">
                <div class="app-title-block">
                  <h1 class="pf-app__title">Insert Generator</h1>
                  <span class="app-project-name">
                    {project.name === "" ? "(unnamed)" : project.name}
                  </span>
                </div>
                <div class="pf-toolbar__group">
                  {advanced ? (
                    <span class="pf-mode-note" aria-hidden="true">
                      Dotted edge = advanced
                    </span>
                  ) : null}
                  <fieldset class="mode-toggle">
                    <legend>Input mode</legend>
                    <div class="pf-seg">
                      <label class="pf-seg__opt">
                        <input
                          type="radio"
                          name="input-mode"
                          checked={!advanced}
                          onChange={() => {
                            s.mode.value = "simple";
                          }}
                        />
                        Simple
                      </label>
                      <label class="pf-seg__opt">
                        <input
                          type="radio"
                          name="input-mode"
                          checked={advanced}
                          onChange={() => {
                            s.mode.value = "advanced";
                          }}
                        />
                        Advanced
                      </label>
                    </div>
                  </fieldset>
                  <details class="app-menu" ref={menuRef}>
                    <summary>Project</summary>
                    <div class="app-menu-panel">
                      <ProjectMenu
                        name={project.name}
                        currentId={project.id}
                        projects={s.projects.value}
                        storageAvailable={store.storageAvailable}
                        onRename={(name) => store.edit((q) => renameProject(q, name))}
                        onOpen={(id) => {
                          closeMenu();
                          store.openProject(id);
                        }}
                        onNew={() => {
                          closeMenu();
                          store.newProject();
                        }}
                        onDelete={(id) => store.deleteProject(id)}
                        onImport={(text) => {
                          store.importJson(text);
                        }}
                        onExportJson={() =>
                          download(exportJsonFile(project, s.foreign.value), jsonFileName(project))
                        }
                        onCopyLink={onCopyLink}
                      />
                    </div>
                  </details>
                </div>
              </header>
              {notices.length > 0 ? (
                <div class="app-notices">
                  <Notices
                    notices={notices}
                    label="App messages"
                    onDismiss={(code) => store.dismissNotice(code)}
                    // The choice stays on screen while autosave is paused for it.
                    canDismiss={(n) => !(n.code === CONFLICT_CODE && s.conflict.value)}
                    renderAction={(n) =>
                      n.code === CONFLICT_CODE && s.conflict.value ? (
                        <>
                          <button type="button" onClick={() => store.resolveConflict("keepMine")}>
                            Keep my version
                          </button>
                          <button type="button" onClick={() => store.resolveConflict("loadTheirs")}>
                            Load the other tab's version
                          </button>
                        </>
                      ) : null
                    }
                  />
                </div>
              ) : null}
            </div>
            <div class="pf-app__body">
              <section class="pf-app__rail" aria-label="Inputs">
                {shownSections.map((x) => (
                  <Section
                    key={x.id}
                    id={x.id}
                    step={x.step}
                    title={SECTION_TITLES[x.id]}
                    summary={summaries[x.id]}
                    problem={problems.has(x.id)}
                    advanced={x.advanced}
                    open={openSection === x.id}
                    onToggle={(open) => setOpenSection(open ? x.id : null)}
                  >
                    {x.id === "box" ? (
                      <BoxForm
                        box={project.box}
                        advanced={advanced}
                        onChange={(patch) => store.edit((q) => updateBox(q, patch))}
                      />
                    ) : null}
                    {x.id === "printer" ? (
                      <PrinterForm
                        printer={project.printer}
                        advanced={advanced}
                        onChange={(patch) => store.edit((q) => updatePrinter(q, patch))}
                      />
                    ) : null}
                    {x.id === "components" ? (
                      <ComponentList
                        components={project.components}
                        advanced={advanced}
                        trayNumbers={trayNumbers}
                        onAdd={addComponentOfKind}
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
                    {x.id === "settings" ? (
                      <SettingsForm
                        settings={project.settings}
                        advanced={advanced}
                        onChange={(next) => store.edit((q) => setSettings(q, next))}
                      />
                    ) : null}
                  </Section>
                ))}
              </section>
              <main class="pf-app__stage" ref={mainRef}>
                <h2 class="visually-hidden">Results</h2>
                <Summary
                  summary={s.summary.value}
                  run={run}
                  notices={layoutNotices}
                  hasLayout={layout !== undefined}
                  stale={s.stale.value}
                  geometryOld={s.geometryOld.value}
                  layers={layers}
                  spares={spares}
                  canUndo={store.canUndo.value}
                  canOptimize={canOptimize(project, validation)}
                  hasComponents={project.components.length > 0}
                  hiddenErrors={errorsWithoutField(validation, advanced)}
                  advanced={advanced}
                  problemSections={problemSections}
                  onShowSection={showSection}
                  shortfall={s.shortfall.value}
                  onRefit={() => store.refit()}
                  onUndo={() => store.undo()}
                  onCancel={() => store.cancelRun()}
                  onRetry={() => store.retry()}
                />
                {layout ? (
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
                            setView(next);
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
                            onClick={() => setView(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div class="pf-toolbar__group">
                        {s.stale.value ? <span class="pf-badge">Out of date</span> : null}
                        {run.status === "running" ? <span class="pf-badge">Updating…</span> : null}
                        <button
                          type="button"
                          class="primary"
                          ref={exportButtonRef}
                          aria-haspopup="dialog"
                          onClick={() => setExportOpen(true)}
                        >
                          {`Export all ${partTotal} ${partTotal === 1 ? "part" : "parts"}`}
                        </button>
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
                          advanced={advanced}
                          lockedKeys={locked}
                          selectedKey={s.selection.value}
                          stale={s.stale.value}
                          onSelect={(key) => {
                            s.selection.value = key;
                          }}
                          onSwap={(a, b) => store.edit((q) => swapTrays(q, a, b))}
                          sizeLockedKeys={sizeLocked}
                          onToggleSizeLock={(key) =>
                            withTray(key, (tray) => (q) => toggleSizeLock(q, tray))
                          }
                          onToggleLock={(key) =>
                            withTray(key, (tray) => (q) => toggleLock(q, tray))
                          }
                        />
                      ) : null}
                      {view === "3d" ? (
                        <Viewer
                          trays={printable}
                          box={project.box}
                          settings={project.settings}
                          components={project.components}
                          advanced={advanced}
                          stale={s.stale.value}
                          meshes={meshes}
                          selectedKey={s.selection.value}
                          lockedKeys={locked}
                          sizeLockedKeys={sizeLocked}
                          onToggleSizeLock={(key) =>
                            withTray(key, (tray) => (q) => toggleSizeLock(q, tray))
                          }
                          onSelect={(key) => {
                            s.selection.value = key;
                          }}
                          {...props.viewerProps}
                        />
                      ) : null}
                    </div>
                    {exportOpen ? (
                      <Modal labelledBy="export-title" onClose={() => setExportOpen(false)}>
                        <ExportPanel
                          titleId="export-title"
                          trays={printable}
                          printer={project.printer}
                          settings={project.settings}
                          meshes={meshes}
                          projectName={project.name}
                          disabled={run.status === "running"}
                          stale={s.stale.value}
                          download={download}
                        />
                        <div class="export-option export-assembly">
                          <div>
                            <strong>Assembly page</strong>
                            <p class="hint">
                              An exploded picture of the build order, numbered pictures of each
                              layer and a parts list, to print or save as PDF. Print this one
                              yourself.
                            </p>
                            {s.stale.value ? (
                              <p class="hint">
                                Inputs changed — update the plan before opening the assembly page.
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            disabled={s.stale.value}
                            onClick={() => {
                              setExportOpen(false);
                              setAssemblyFor(project.id);
                            }}
                          >
                            Open the assembly page
                          </button>
                        </div>
                      </Modal>
                    ) : null}
                  </section>
                ) : (
                  <section class="pf-frame pf-view" aria-label="Preview">
                    <div class="stage-empty">
                      <div class="stage-empty-box">
                        <span class="pf-measure">{`Your box, ${mm(project.box.innerWidth)} × ${mm(project.box.innerDepth)} mm`}</span>
                      </div>
                      <h2>
                        {project.components.length === 0
                          ? "Fit your game into its box."
                          : "Working out the trays…"}
                      </h2>
                      <p>
                        {project.components.length === 0
                          ? "Check the box size on the left, then pick what goes inside. The plan draws itself as you go."
                          : "The plan appears here as soon as every field is valid."}
                      </p>
                      {project.components.length === 0 ? (
                        <>
                          <AddKinds
                            onAdd={addComponentOfKind}
                            startIndex={0}
                            label="Pick what goes inside"
                          />
                          <button type="button" onClick={addExample}>
                            Not sure? Try an example
                          </button>
                        </>
                      ) : null}
                      <p class="hint">Everything stays in your browser.</p>
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
                      Undo
                    </button>
                    <button type="button" class="pf-link" onClick={() => setRemoved(null)}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </main>
            </div>
            <footer class="app-footer">
              {`Insert Generator v${APP_VERSION} (${BUILD_ID}) · `}
              <a href="./third-party-licenses.txt">Third-party licenses</a>
              {" · "}
              <a href="../">All apps</a>
            </footer>
          </div>
        </SettingsContext.Provider>
      </SizingContext.Provider>
    </ValidationContext.Provider>
  );
}
