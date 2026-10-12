// src/app/App.tsx
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { AssemblyPage } from "../instructions/AssemblyPage";
import type { Project, TraySpec } from "../model/types";
import { APP_VERSION, isPreview } from "../model/version";
import { PlanView } from "../plan/PlanView";
import { encodeHash, exportJsonFile, jsonFileName } from "../share";
import { BoxForm } from "../ui/BoxForm";
import { ComponentList } from "../ui/components/ComponentList";
import { ExportPanel } from "../ui/ExportPanel";
import { Notices } from "../ui/Notices";
import { PrinterForm } from "../ui/PrinterForm";
import { ProjectMenu } from "../ui/ProjectMenu";
import { SettingsForm } from "../ui/SettingsForm";
import { Summary } from "../ui/Summary";
import { SizingContext, ValidationContext } from "../ui/validation";
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
  confirm?: (message: string) => boolean;
  download?: (blob: Blob, filename: string) => void;
  viewerProps?: Pick<ViewerProps, "webgl" | "loadScene">;
}

function Panel({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ComponentChildren;
}) {
  return (
    <section class="panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {children}
    </section>
  );
}

export function App(props: AppProps) {
  const { store, meshes } = props;
  const s = store.state;
  // The project the assembly page was opened for: another project, or one without a layout,
  // never shows it (a later layout must not pop the page back open on its own).
  const [assemblyFor, setAssemblyFor] = useState<string | null>(null);
  const project = s.project.value;
  const layout = project.layout;
  const showAssembly = assemblyFor === project.id && layout !== undefined;
  const mainRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const advanced = s.mode.value === "advanced";
  const run = s.run.value;
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
      openButtonRef.current?.focus();
    }
  }, [showAssembly]);

  const withTray = (key: string, fn: (tray: TraySpec) => (q: Project) => Project): void => {
    const tray = layout?.trays.find((t) => t.key === key);
    if (tray) {
      store.edit(fn(tray));
    }
  };
  const confirm = props.confirm ?? ((message: string) => window.confirm(message));
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
          layout={layout}
          download={download}
          onBack={() => {
            restoreFocus.current = true;
            setAssemblyFor(null);
          }}
        />
      </main>
    );
  }

  return (
    <ValidationContext.Provider value={s.validation.value}>
      <SizingContext.Provider value={s.sizingNotices.value}>
        <header class="app-header">
          <div class="app-title">
            <h1>Board Game Insert Generator</h1>
            <fieldset class="mode-toggle">
              <legend>Input mode</legend>
              <label>
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
              <label>
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
            </fieldset>
          </div>
          {isPreview(APP_VERSION) ? (
            <p class="preview-banner" role="note">
              Preview: saved projects and shared links may break between versions.
            </p>
          ) : null}
          <ProjectMenu
            name={project.name}
            currentId={project.id}
            projects={s.projects.value}
            storageAvailable={store.storageAvailable}
            onRename={(name) => store.edit((q) => renameProject(q, name))}
            onOpen={(id) => store.openProject(id)}
            onNew={() => store.newProject()}
            onDelete={(id) => store.deleteProject(id)}
            onImport={(text) => {
              store.importJson(text);
            }}
            onExportJson={() =>
              download(exportJsonFile(project, s.foreign.value), jsonFileName(project))
            }
            onCopyLink={onCopyLink}
          />
          <Notices
            notices={s.appNotices.value}
            label="App messages"
            onDismiss={(code) => store.dismissNotice(code)}
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
        </header>
        <main class="workspace">
          <section class="inputs" aria-label="Inputs">
            <Panel id="box" title="Box">
              <BoxForm
                box={project.box}
                onChange={(patch) => store.edit((q) => updateBox(q, patch))}
              />
            </Panel>
            <Panel id="printer" title="Printer">
              <PrinterForm
                printer={project.printer}
                advanced={advanced}
                onChange={(patch) => store.edit((q) => updatePrinter(q, patch))}
              />
            </Panel>
            <Panel id="components" title="Components">
              <ComponentList
                components={project.components}
                advanced={advanced}
                onAdd={(kind) => store.edit((q) => addComponent(q, kind))}
                onChange={(id, next) => store.edit((q) => updateComponent(q, id, next))}
                onRemove={(id) => {
                  const c = project.components.find((x) => x.id === id);
                  if (confirm(`Remove “${c ? c.name : "this component"}”?`)) {
                    store.edit((q) => removeComponent(q, id));
                  }
                }}
              />
            </Panel>
            <Panel id="settings" title="Settings">
              <SettingsForm
                settings={project.settings}
                advanced={advanced}
                onChange={(next) => store.edit((q) => setSettings(q, next))}
              />
            </Panel>
          </section>
          <section class="results" aria-label="Results">
            <Summary
              summary={s.summary.value}
              run={run}
              notices={s.layoutNotices.value}
              hasLayout={layout !== undefined}
              canUndo={s.undoSlot.value !== null}
              canOptimize={canOptimize(project)}
              shortfall={s.shortfall.value}
              onReoptimize={() => store.reoptimize()}
              onImprove={() => store.improveMore()}
              onUndo={() => store.undo()}
              onCancel={() => store.cancelRun()}
              onRetry={() => store.retry()}
            />
            {layout ? (
              <>
                <Panel id="plan" title="Plan view">
                  <PlanView
                    trays={layout.trays}
                    box={project.box}
                    settings={project.settings}
                    lockedKeys={locked}
                    selectedKey={s.selection.value}
                    onSelect={(key) => {
                      s.selection.value = key;
                    }}
                    onSwap={(a, b) => store.edit((q) => swapTrays(q, a, b))}
                    sizeLockedKeys={sizeLocked}
                    onToggleSizeLock={(key) =>
                      withTray(key, (tray) => (q) => toggleSizeLock(q, tray))
                    }
                    onToggleLock={(key) => withTray(key, (tray) => (q) => toggleLock(q, tray))}
                  />
                </Panel>
                <Panel id="viewer" title="3D view">
                  <Viewer
                    trays={layout.trays}
                    box={project.box}
                    settings={project.settings}
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
                </Panel>
                <Panel id="export" title="Export">
                  <ExportPanel
                    trays={layout.trays}
                    printer={project.printer}
                    settings={project.settings}
                    meshes={meshes}
                    projectName={project.name}
                    disabled={run.status === "running"}
                    download={download}
                  />
                  <p>
                    <button
                      ref={openButtonRef}
                      type="button"
                      onClick={() => setAssemblyFor(project.id)}
                    >
                      Open the assembly page
                    </button>
                  </p>
                </Panel>
              </>
            ) : null}
          </section>
        </main>
        <footer class="app-footer">
          {`Insert Generator v${APP_VERSION} · `}
          <a href="./third-party-licenses.txt">Third-party licenses</a>
          {" · "}
          <a href="../">All apps</a>
        </footer>
      </SizingContext.Provider>
    </ValidationContext.Provider>
  );
}
