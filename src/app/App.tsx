// src/app/App.tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AssemblyPage } from "../instructions/AssemblyPage";
import { NOTICE_CODES, printableParts } from "../layout";
import type { Component, ComponentKind } from "../model/types";
import { topPlane } from "../model/settings";
import { levelsOf } from "../plan/layers";
import { PlanView } from "../plan/PlanView";
import { exportJsonFile, jsonFileName } from "../share";
import { errorText } from "../util/errors";
import { Header } from "../screens/Header";
import { hoveredComponent } from "../screens/hover";
import { AddMenu, KindTiles } from "../screens/KindPicker";
import { ProjectMenu } from "../screens/ProjectMenu";
import { RunAnnouncer } from "../screens/RunAnnouncer";
import { StageNotes } from "../screens/StageNotes";
import { stageView } from "../screens/stageView";
import { PlanBanner, StageTop, problemAreas } from "../screens/StageTop";
import type { StageView } from "../screens/StageTop";
import { Workspace } from "../screens/Workspace";
import { BoxPanel } from "../ui/BoxPanel";
import { WhatsInside } from "../ui/components/WhatsInside";
import { ExportPanel } from "../ui/ExportPanel";
import { hasNativeUndo, historyKeyOf, modalIsOpen } from "../ui/historyKeys";
import { Modal } from "../ui/Modal";
import { Notices } from "../ui/Notices";
import { placeNotices } from "../ui/noticePlacement";
import { SettingsSheet, settingsTabFor } from "../ui/SettingsSheet";
import type { SettingsTab } from "../ui/SettingsSheet";
import { misfitOf } from "../ui/noFit";
import { NARROW_QUERY, PHONE_QUERY, useMediaQuery } from "../ui/useMediaQuery";
import { SelectedTrayBar } from "../ui/SelectedTrayBar";
import { componentIndexOfTray, mm } from "../ui/identity";
import {
  SettingsContext,
  SizingContext,
  ValidationContext,
  errorsWithoutField,
} from "../ui/validation";
import { Viewer } from "../viewer/Viewer";
import { hasWebGL } from "../viewer/webgl";
import type { ViewerProps } from "../viewer/Viewer";
import {
  addComponent,
  clearChoices,
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
import { GEOMETRY_MAJOR_CODE, GEOMETRY_REPRINT_REASON, STALE_CODE } from "./state";
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
  // The first visit's block in the rail, where the focus goes when the last item is removed.
  const firstVisitRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  // The component whose editor is open in the rail (null: the list). The tray bar's Edit sets it
  // too, and an item just added opens at once.
  const [editingId, setEditingId] = useState<string | null>(null);
  // The box's editor is open in the rail, in the list's place (until the box screen, Task 11).
  const [boxOpen, setBoxOpen] = useState(false);
  const boxHeadingRef = useRef<HTMLHeadingElement>(null);
  // The pointer or focus on a rail row lights that component's trays; nothing is lit once the rail goes.
  useEffect(() => {
    return () => {
      hoveredComponent.value = null;
    };
  }, []);
  const firstVisit = project.components.length === 0;
  // Below 760 px the rail is a sheet at the foot of the screen: folded, with its handle showing.
  const phone = useMediaQuery(PHONE_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetHandle = useRef<HTMLButtonElement>(null);
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
        firstVisitRef.current?.querySelector<HTMLElement>(".rail-kinds button")?.focus();
      }
    }
    wasFirstVisit.current = firstVisit;
  }, [firstVisit]);
  // The box's editor takes the focus when it opens; the box card (or row) gets it back when it closes.
  const wasBoxOpen = useRef(false);
  useEffect(() => {
    if (boxOpen) {
      boxHeadingRef.current?.focus();
    } else if (wasBoxOpen.current && document.activeElement === document.body) {
      // Done or the way back went with the focus: the card (or row) that opened the editor takes it.
      document.querySelector<HTMLElement>("[data-rail-box]")?.focus();
    }
    wasBoxOpen.current = boxOpen;
  }, [boxOpen]);
  // The View segment's choice is a signal of the stage (`stageView`), reset when the app goes.
  const view = stageView.value;
  useEffect(() => {
    return () => {
      stageView.value = "plan";
    };
  }, []);
  // The browser can draw the 3D view: asked once, when the app opens.
  const [webgl] = useState(() => (props.viewerProps?.webgl ?? hasWebGL)());
  // A swap belongs to the plan: it ends when the view moves away from it.
  function showView(next: StageView): void {
    if (next !== "plan") {
      s.swapFrom.value = null;
    }
    stageView.value = next;
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
    setBoxOpen(false);
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

  // Undo and Redo from the keyboard: the one global key handler of the app, added here and taken
  // off when App goes (DESIGN.md §2, Accessibility). It stands aside where the browser has its own
  // undo (a text field), behind any open modal dialog (whose controls are the whole screen) and on
  // the packing guide, which shows no insert to change.
  const onPage = useRef(true);
  onPage.current = !showAssembly;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const which = historyKeyOf(e);
      if (
        which === null ||
        e.defaultPrevented ||
        !onPage.current ||
        hasNativeUndo(e.target) ||
        modalIsOpen(document)
      ) {
        return;
      }
      // As the buttons: a blocked one (nothing to undo) does nothing, and the key goes on to the page.
      if (which === "undo" ? store.canUndo.peek() : store.canRedo.peek()) {
        e.preventDefault();
        if (which === "undo") {
          store.undo();
        } else {
          store.redo();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [store]);

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
  // The editors and the sheet that hold an error: the status heading sends the reader to each.
  const problems = problemAreas(validation, project.components);
  // The settings sheet, over whichever view is showing; `tab` is the one it opens on.
  const openSettings = (tab?: SettingsTab): void =>
    setSettingsOpen({ tab: tab ?? settingsTabFor(validation) });
  // The box's editor, in the rail's place (a phone's sheet opens for it).
  const openBox = (): void => {
    setEditingId(null);
    setBoxOpen(true);
    setSheetOpen(true);
  };
  // A component's editor, in the list's place, as a click on its row opens it.
  const editComponent = (id: string): void => {
    setBoxOpen(false);
    setEditingId(id);
    setSheetOpen(true);
  };
  // Where the status heading's jump buttons lead: the box's editor, a component's, or Settings.
  const showSection = (id: string): void => {
    if (id === "settings") {
      openSettings();
    } else if (id === "box") {
      openBox();
    } else {
      editComponent(id);
    }
  };
  const addComponentOfKind = (kind: ComponentKind): void => {
    store.edit((q) => addComponent(q, kind));
    // The new item opens at once, whether the Add was the rail's, the phone sheet's or the first visit's.
    setEditingId(store.state.project.peek().components.at(-1)?.id ?? null);
    setBoxOpen(false);
    if (firstVisit || phone) {
      setSheetOpen(true);
    }
  };
  const addExample = (): void => {
    store.edit((q) => (["cards", "bulk", "tiles"] as const).reduce(addComponent, q));
  };
  // Where each notice shows: the one banner, the project menu (with a dot), or inline.
  const noFit =
    s.shortfall.value !== null || layoutNotices.some((n) => n.code === NOTICE_CODES.doesNotFit);
  const conflicts = s.lockConflicts.value;
  const canPlan = canOptimize(project, validation);
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
    {
      runPending: s.runPending.value,
      runStatus: run.status,
      noFit,
      pinConflict: conflicts.length > 0,
      canOptimize: canPlan,
    },
  );
  const showStale = placed.banner.some((n) => n.code === STALE_CODE);
  const showGeometry = placed.banner.some((n) => n.code === GEOMETRY_MAJOR_CODE);
  // The stale and older-geometry notices are the banner's: the notes under the plan list the others.
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
  // What the plan holds, for the status, the Export button and the layers named in the list.
  const planCurrent = layout !== undefined && !s.stale.value && run.status !== "running";
  const listTrays = planCurrent ? printable : undefined;
  const layers = layout ? levelsOf(layout.trays).length : 0;
  // What the status says of the plan: how many trays, how high (the heading holds even for a plan
  // out of date, as Main draws it under its banner).
  const summary = s.summary.value;
  const fits =
    layout !== undefined && summary !== null
      ? {
          trays: summary.trayCount,
          layers: Math.max(1, layers),
          height: Math.max(0, ...layout.trays.map((t) => t.z + t.h)),
          // the height below the space the box keeps free on top (where every stack reaches)
          boxHeight: topPlane(project.box, projSettings),
        }
      : null;
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

  // The component the selected tray belongs to: its row in the rail is pressed.
  const selectedTray = layout ? printable.find((t) => t.key === s.selection.value) : undefined;
  const selectedIndex =
    selectedTray === undefined ? null : componentIndexOfTray(selectedTray, project.components);
  const selectedId =
    selectedIndex === null ? null : (project.components[selectedIndex]?.id ?? null);
  // What's inside: the rail's list (the sheet's, on a phone), or a component's editor in its place.
  const whatsInside = (
    <WhatsInside
      components={project.components}
      openId={editingId}
      onOpenChange={(id) => {
        setEditingId(id);
        // A row chosen from the folded sheet opens it on the editor.
        if (id !== null) {
          setSheetOpen(true);
        }
      }}
      trays={listTrays}
      locks={project.locks}
      box={project.box}
      printer={projPrinter}
      phone={phone}
      selectedId={selectedId}
      onOpenBox={openBox}
      onSettings={() => openSettings()}
      onHover={(id) => {
        hoveredComponent.value = id;
      }}
      onClearChoices={() => store.edit(clearChoices)}
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
  );
  // The box's editor, in the rail's place until the box screen (Task 11): the old fields, a way back.
  const boxEditor = (
    <section class="wi ws-interim" aria-labelledby="box-editor-title">
      <div class="editor-panel__bar">
        <button type="button" class="pf-back" onClick={() => setBoxOpen(false)}>
          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M7.5 2l-4 4 4 4" />
          </svg>
          What&apos;s inside
        </button>
        <button type="button" class="primary editor-panel__btn" onClick={() => setBoxOpen(false)}>
          Done
        </button>
      </div>
      <h3 class="editor-panel__title" id="box-editor-title" tabIndex={-1} ref={boxHeadingRef}>
        The box
      </h3>
      <BoxPanel box={project.box} onChange={(patch) => store.edit((q) => updateBox(q, patch))} />
    </section>
  );
  // Below 760 px the status pill has no room for Keep searching on a plan that doesn't fit:
  // the sheet's bar offers it.
  const searchOnPhone =
    noFit && !s.geometryOld.value && !s.runPending.value && run.status !== "running" && canPlan;

  // The editor is showing in the sheet, or the box has it: the sheet is "full"; below 600 px that
  // fills the screen, and what is behind it is out of reach of Tab and screen readers (inert).
  const editing = editingId !== null;
  const sheetFull = editingId !== null || boxOpen;
  const sheetCoversScreen = phone && narrow && !firstVisit && sheetOpen && sheetFull;

  // The three slots of the workspace shell. What is in them is the old UI, unchanged, until the
  // task that rebuilds it: the header (Task 4), the rail (Tasks 5, 9, 10, 11), the stage (6 to 8).
  const headerSlot = (
    <>
      <Header
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
          layout === undefined ||
          s.stale.value ||
          s.geometryOld.value ||
          s.runPending.value ||
          fitProblem
        }
        downloadLabel={fitProblem ? "Fix the fit to download" : undefined}
        downloadReason={
          layout === undefined
            ? project.components.length === 0
              ? "Add what goes inside first"
              : canPlan
                ? "Wait for the first plan"
                : "Fix the errors marked in the inputs first"
            : s.runPending.value
              ? "Wait for the plan to finish"
              : s.geometryOld.value && !showStale
                ? GEOMETRY_REPRINT_REASON
                : s.stale.value
                  ? "Make a new plan first"
                  : undefined
        }
        // A blocked Download pressed while the old plan is kept brings its banner back:
        // Reprint everything is the way out, and the person asked where it is.
        onBlockedDownload={() => {
          if (s.geometryOld.value && geometryKept !== null) {
            setGeometryKept(null);
          }
        }}
        phone={phone}
        onSendFile={() => {
          void sendFile();
        }}
        // the status heading is the page's h1 on the workspace; the first visit has none until Task 9
        brandIsHeading={firstVisit}
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
            onSettings={() => openSettings()}
            phone={phone}
            canRedo={store.canRedo.value}
            onRedo={() => store.redo()}
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
    </>
  );
  const firstVisitBlock = (
    <section class="pf-first" aria-label="Start">
      <h2>Fit your game into its box.</h2>
      <div class="pf-first__step">
        <h3>Measure the box</h3>
        <BoxPanel box={project.box} onChange={(patch) => store.edit((q) => updateBox(q, patch))} />
      </div>
      <div class="pf-first__step">
        <h3>Pick what goes inside</h3>
        <div class="rail-kinds" role="group" aria-label="Pick what goes inside">
          <KindTiles onPick={addComponentOfKind} />
        </div>
        <button type="button" onClick={addExample}>
          Start from an example game
        </button>
      </div>
      <p class="hint">Your inserts are saved in this browser.</p>
    </section>
  );
  const railSlot = firstVisit ? (
    <div class="ws-interim" ref={firstVisitRef}>
      {firstVisitBlock}
    </div>
  ) : boxOpen ? (
    boxEditor
  ) : (
    whatsInside
  );
  const stageSlot = (
    <>
      {/* Always mounted, so its live regions are there before they have anything to say. */}
      <div
        class="app-notices"
        data-empty={showStale || showGeometry || placed.inline.length > 0 ? undefined : "true"}
      >
        <PlanBanner
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
      <RunAnnouncer run={run} />
      {firstVisit ? null : (
        <StageTop
          run={run}
          pending={s.runPending.value}
          hasComponents={project.components.length > 0}
          canOptimize={canPlan}
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
          hiddenErrors={errorsWithoutField(validation)}
          problems={problems}
          trays={layout?.trays}
          level={s.viewLevel.value}
          onLevelChange={(l) => {
            s.viewLevel.value = l;
          }}
          view={view}
          onViewChange={showView}
          webgl={webgl}
          phone={phone}
          onKeepSearching={() => store.refit()}
          onStop={() => store.cancelRun()}
          onRetry={() => store.retry()}
          onShow={showSection}
          onUnpin={(c) => store.unpin(c.trayKey, c.kind)}
        />
      )}
      {firstVisit ? null : layout ? (
        <section class="pf-frame pf-view" aria-label="Preview">
          <div class="pf-view__body">
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
                summary={summary}
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
      {/* The layout and sizing notices, under the plan caption. */}
      <StageNotes notices={summaryNotices} />
      {/* always mounted: the removal is spoken, and Undo is in the header as well */}
      <div class="visually-hidden" role="status" data-live="removed">
        {removed !== null && removed.version === s.history.version.value
          ? `Removed “${removed.component.name === "" ? "(unnamed)" : removed.component.name}”. Undo removal is available.`
          : ""}
      </div>
      {removed !== null && removed.version === s.history.version.value ? (
        <div class="pf-toast stage-block">
          {`Removed “${removed.component.name === "" ? "(unnamed)" : removed.component.name}”. `}
          <button
            type="button"
            class="pf-link"
            onClick={() => {
              setRemoved(null);
              store.undo();
            }}
          >
            Undo removal
          </button>
          <button type="button" class="pf-link" onClick={() => setRemoved(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );

  return (
    <ValidationContext.Provider value={validation}>
      <SizingContext.Provider value={sizingNotices}>
        <SettingsContext.Provider value={projSettings}>
          <Workspace
            header={headerSlot}
            rail={railSlot}
            stage={stageSlot}
            focus={firstVisit}
            inert={sheetCoversScreen}
            sheet={
              firstVisit || !phone
                ? undefined
                : {
                    label: "The box and what's inside",
                    title: "What's inside",
                    summary: String(project.components.length),
                    handleLabel: "Show everything",
                    expanded: sheetOpen,
                    full: sheetFull,
                    editing,
                    handleRef: sheetHandle,
                    onExpandedChange: (open) => {
                      setSheetOpen(open);
                      // An editor, or the box, has the sheet to itself: folding it comes back to the list.
                      if (!open) {
                        setEditingId(null);
                        setBoxOpen(false);
                      }
                    },
                    action: (
                      <>
                        {searchOnPhone ? (
                          <button
                            type="button"
                            onClick={() => {
                              store.refit();
                              // The button goes with the search: the handle keeps the place.
                              sheetHandle.current?.focus();
                            }}
                          >
                            Keep searching
                          </button>
                        ) : null}
                        {editing || boxOpen ? null : (
                          <AddMenu placement="above" onPick={addComponentOfKind} />
                        )}
                      </>
                    ),
                  }
            }
          />
          {settingsOpen !== null ? (
            <SettingsSheet
              initialTab={settingsOpen.tab}
              settings={project.settings}
              onSettingsChange={(next) => store.edit((q) => setSettings(q, next))}
              printer={project.printer}
              myPrinter={store.prefs.printer.value}
              onMyPrinterChange={(p) => store.prefs.setPrinter(p)}
              onApplyPrinter={() => store.edit((q) => applyPrinter(q, store.prefs.printer.peek()))}
              onClose={() => setSettingsOpen(null)}
            />
          ) : null}
        </SettingsContext.Provider>
      </SizingContext.Provider>
    </ValidationContext.Provider>
  );
}
