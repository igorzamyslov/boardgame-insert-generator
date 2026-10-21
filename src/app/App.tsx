// src/app/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AssemblyPage } from "../instructions/AssemblyPage";
import { NOTICE_CODES, printableParts } from "../layout";
import type { Access, ComponentKind, Lock, Project } from "../model/types";
import { groupById, requirementKeyOf } from "../model/groups";
import { topPlane } from "../model/settings";
import { levelsOf } from "../plan/layers";
import { PlanView } from "../plan/PlanView";
import { exportJsonFile, jsonFileName } from "../share";
import { errorText } from "../util/errors";
import { BoxStage } from "../screens/BoxStage";
import { BoxSideView } from "../screens/BoxSideView";
import { EditorStage, EditorStrip, ProblemLine } from "../screens/EditorStage";
import { FitCards, FitProblem, fitKindOf, fitTitle } from "../screens/FitProblem";
import type { EditNote } from "../screens/EditorStage";
import { Header } from "../screens/Header";
import { hoveredComponent, hoveredMembers } from "../screens/hover";
import { FirstVisit } from "../screens/FirstVisit";
import { AddMenu } from "../screens/KindPicker";
import { ProjectMenu } from "../screens/ProjectMenu";
import {
  RemovedToast,
  UNDO_MOVE,
  UNDO_REMOVAL,
  groupRemovedWords,
  notesAsSentences,
  removedWords,
} from "../screens/RemovedToast";
import { RunAnnouncer } from "../screens/RunAnnouncer";
import { StageSlot } from "../screens/StageSlot";
import { StageNotes } from "../screens/StageNotes";
import { stageView } from "../screens/stageView";
import { PlanBanner, StageTop, editorProblem, problemAreas, statusOf } from "../screens/StageTop";
import type { StageView, StatusInput } from "../screens/StageTop";
import { Workspace } from "../screens/Workspace";
import { BoxPanel } from "../ui/BoxPanel";
import { WhatsInside } from "../ui/components/WhatsInside";
import type { GroupEditActions, ItemGroupActions } from "../ui/components/WhatsInside";
import { ExportPanel } from "../ui/ExportPanel";
import { hasNativeUndo, historyKeyOf, modalIsOpen } from "../ui/historyKeys";
import { Notices } from "../ui/Notices";
import { placeNotices } from "../ui/noticePlacement";
import { nameExampleOf } from "../ui/settingsFields";
import { SettingsSheet, settingsTabFor } from "../ui/SettingsSheet";
import type { SettingsTab } from "../ui/SettingsSheet";
import { NARROW_QUERY, PHONE_QUERY, useMediaQuery } from "../ui/useMediaQuery";
import { SelectedTrayBar } from "../ui/SelectedTrayBar";
import { componentIdsOfTray, mm } from "../ui/identity";
import { misfitOf, namedConflicts } from "../ui/noFit";
import {
  SettingsContext,
  SizingContext,
  ValidationContext,
  errorsWithoutField,
} from "../ui/validation";
import { hasWebGL } from "../viewer/webgl";
import type { ViewerProps } from "../viewer/Viewer";
import {
  addComponent,
  addGroup,
  clearChoices,
  freeTurn,
  lockedKeys,
  moveToGroup,
  newGroupWith,
  orderMember,
  removeComponent,
  removeGroup,
  removeLock,
  renameGroup,
  renameProject,
  setCopies,
  setGroupAccess,
  setGroupCopies,
  setSettings,
  swapTrays,
  sizeLockedKeys,
  takeOutOfGroup,
  applyPrinter,
  unpinTrays,
  updateBox,
  updateComponent,
} from "./actions";
import type { EditResult } from "./actions";
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
  const restoreFocus = useRef(false);
  // The component whose editor is open in the rail (null: the list). The tray bar's Edit sets it
  // too, and an item just added opens at once.
  const [editingId, setEditingId] = useState<string | null>(null);
  // The group whose editor is open in the rail (G2), instead of an item's: the card's header, the
  // tray bar's Edit and the status heading's "Edit <group>" open it.
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  // What the last option change of the open editor said, for the stage's slot (Edit's note toast).
  const [editNote, setEditNote] = useState<EditNote | null>(null);
  const noteSeq = useRef(0);
  useEffect(() => {
    // another editor, or none: the note belonged to the one before
    setEditNote(null);
  }, [editingId, editingGroupId]);
  // The box's editor is open in the rail, in the list's place (the sheet on a phone).
  const [boxOpen, setBoxOpen] = useState(false);
  // The pointer or focus on a rail row lights that component's trays; nothing is lit once the rail goes.
  useEffect(() => {
    return () => {
      hoveredComponent.value = null;
      hoveredMembers.value = null;
    };
  }, []);
  const firstVisit = project.components.length === 0;
  // Below 760 px the rail is a sheet at the foot of the screen: folded, with its handle showing.
  const phone = useMediaQuery(PHONE_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetHandle = useRef<HTMLButtonElement>(null);
  // Removing the last item swaps the workspace for the first visit: the focus goes to the kinds there.
  // A new (or another, empty) insert replaces the workspace too, but its menu button had the focus:
  // it goes to the first visit's menu button, not to the kinds.
  const wasFirstVisit = useRef(firstVisit);
  const wasProjectId = useRef(project.id);
  useEffect(() => {
    if (firstVisit && !wasFirstVisit.current) {
      setSheetOpen(false);
      if (document.activeElement === document.body) {
        const target = wasProjectId.current === project.id ? ".fv-kinds button" : ".hd-menu button";
        document.querySelector<HTMLElement>(target)?.focus();
      }
    }
    wasFirstVisit.current = firstVisit;
    wasProjectId.current = project.id;
  }, [firstVisit, project.id]);
  // The box's editor takes the focus when it opens (its panel does); the box card (or row) gets it
  // back when it closes.
  const wasBoxOpen = useRef(false);
  useEffect(() => {
    if (!boxOpen && wasBoxOpen.current && document.activeElement === document.body) {
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
    if (next === "3d") {
      // 3D opens on every layer; the cut is a look at the model, not a choice to carry back
      s.viewCut.value = null;
    }
    stageView.value = next;
  }
  // The export is a dialog over whichever view is showing, so closing it leaves everything as it was.
  const [exportOpen, setExportOpen] = useState(false);
  // The settings sheet is a dialog too; null while it is closed.
  const [settingsOpen, setSettingsOpen] = useState<{ tab: SettingsTab } | null>(null);
  // What was just removed, in the words the toast says, for the Undo toast (cleared when another
  // project opens): an item's, or a group's with what its trays' rules lost.
  // A drop in the rail that gave a note shows its toast the same way, with "Undo move"; the rail's own
  // live region has said it, so the toast is silent.
  const [removed, setRemoved] = useState<{
    words: string;
    version: number;
    undo?: string;
    silent?: boolean;
  } | null>(null);
  // The older plan the person chose to keep (project and geometry line), so its banner stays away.
  const [geometryKept, setGeometryKept] = useState<string | null>(null);
  const run = s.run.value;
  // A fit problem's cards and the heading's Stop trade places as Keep searching and Stop do in the
  // heading (StageTop): the button pressed goes with its screen, so the focus is handed on, and only
  // when it fell to the page. Keep searching on the cards hands it to Stop; a run that ends on a fit
  // problem hands it to the first card, and one that ends with the problem gone (an Unpin that
  // resolved it) to Download, the next step.
  const working = run.status === "running" || s.runPending.value;
  const wasWorking = useRef(working);
  const keptFromFit = useRef(false);
  // A fit problem was on screen since the last run began: the run that ends is the one a card started.
  const fitSeen = useRef(false);
  useEffect(() => {
    const was = wasWorking.current;
    wasWorking.current = working;
    const active = document.activeElement;
    if (active !== null && active !== document.body) {
      return;
    }
    if (working && keptFromFit.current) {
      keptFromFit.current = false;
      document.querySelector<HTMLElement>('[data-toggle="stop"]')?.focus();
    } else if (was && !working) {
      keptFromFit.current = false;
      const card = document.querySelector<HTMLElement>("[data-fit-first]");
      if (card !== null) {
        card.focus();
      } else if (fitSeen.current) {
        downloadButtonRef.current?.focus();
      }
      fitSeen.current = false;
    }
  });
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
    setEditingGroupId(null);
    setBoxOpen(true);
    setSheetOpen(true);
  };
  // A component's editor, in the list's place, as a click on its row opens it.
  const editComponent = (id: string): void => {
    setBoxOpen(false);
    setEditingGroupId(null);
    setEditingId(id);
    setSheetOpen(true);
  };
  // A group's editor, in the list's place (the card's header, the tray bar's Edit, the status heading).
  const editGroup = (id: string): void => {
    setBoxOpen(false);
    setEditingId(null);
    setEditingGroupId(id);
    setSheetOpen(true);
  };
  // Where the status heading's jump buttons lead: the box's editor, a component's or a group's, or Settings.
  const showSection = (id: string): void => {
    if (id === "settings") {
      openSettings();
    } else if (id === "box") {
      openBox();
    } else if (groupById(project, id) !== undefined) {
      editGroup(id);
    } else {
      editComponent(id);
    }
  };
  const addComponentOfKind = (kind: ComponentKind): void => {
    store.edit((q) => addComponent(q, kind));
    // The new item opens at once, whether the Add was the rail's, the phone sheet's or the first visit's.
    setEditingId(store.state.project.peek().components.at(-1)?.id ?? null);
    setEditingGroupId(null);
    setBoxOpen(false);
    if (firstVisit || phone) {
      setSheetOpen(true);
    }
  };
  // Add → Group: an empty group at the end of the list, one undo step. It opens nothing (a group is
  // made by putting items in it): the focus goes to its header, once the list has drawn it.
  const focusNewGroup = useRef<string | null>(null);
  const addGroupToList = (): void => {
    let groupId: string | null = null;
    store.edit((q) => {
      const added = addGroup(q);
      groupId = added.groupId;
      return added.project;
    });
    focusNewGroup.current = groupId;
    setBoxOpen(false);
    setEditingId(null);
    setEditingGroupId(null);
    if (phone) {
      setSheetOpen(true);
    }
  };
  useEffect(() => {
    const id = focusNewGroup.current;
    if (id === null) {
      return;
    }
    focusNewGroup.current = null;
    document.querySelector<HTMLElement>(`[data-group-head="${id}"]`)?.focus();
    // the card is there once the groups have changed (the edit that added it)
  }, [project.groups]);
  const addExample = (): void => {
    store.edit((q) => (["cards", "bulk", "tiles"] as const).reduce(addComponent, q));
  };
  // Where each notice shows: the one banner, the project menu (with a dot), or inline.
  const noFit =
    s.shortfall.value !== null || layoutNotices.some((n) => n.code === NOTICE_CODES.doesNotFit);
  // The pins the last run could not keep, called by the names the plan gives the trays.
  const conflicts = namedConflicts(
    s.lockConflicts.value,
    layout?.trays,
    project.components,
    project.locks,
    project.groups,
  );
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
  // The engine's no-fit paragraph is on no stage (owner, 0.6.0 checkpoint C): the heading's line (or
  // the editor's problem line) carries the fact and how far the plan is short.
  const summaryNotices = layoutNotices.filter(
    (n) =>
      n.code !== STALE_CODE && n.code !== GEOMETRY_MAJOR_CODE && n.code !== NOTICE_CODES.doesNotFit,
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
    foreign: s.foreign.value,
    trays: printable,
    selectedKey: layout ? s.selection.value : null,
    edit: store.edit,
    onSelect: (key: string | null) => {
      s.selection.value = key;
    },
    onSwapFromChange: (key: string | null) => {
      s.swapFrom.value = key;
    },
    onEditComponent: editComponent,
    onEditGroup: editGroup,
  };

  // The component the selected tray belongs to: its row in the rail is pressed.
  // The plan's layers, once: the Layer switch and the 3D view both read this list.
  const planLevels = useMemo(() => levelsOf(layout?.trays ?? []), [layout]);
  const selectedTray = layout ? printable.find((t) => t.key === s.selection.value) : undefined;
  const selectedIds =
    selectedTray === undefined ? [] : componentIdsOfTray(selectedTray, project.components);
  // The tray the closest attempt could not fit, for the status and for the picture that marks it.
  const misfit = noFit
    ? misfitOf(s.noFitAttempt.value, project.box, projSettings, project.components, project.groups)
    : null;
  // What the status says (the heading; and, while an editor is open, the problems it still tells).
  const statusInput: StatusInput = {
    run,
    pending: s.runPending.value,
    hasComponents: project.components.length > 0,
    canOptimize: canPlan,
    hasLayout: layout !== undefined,
    fits,
    canSearchMore: !s.geometryOld.value,
    noFit: noFit ? { misfit, shortfall: s.noFitAttempt.value?.shortfall ?? null } : null,
    conflicts,
    hiddenErrors: errorsWithoutField(validation),
    problems,
  };
  const status = statusOf(statusInput);
  // The component whose editor is open (the rail's, the sheet's), if it is still there.
  const editedComponent =
    editingId === null ? undefined : project.components.find((c) => c.id === editingId);
  const editing = editedComponent !== undefined;
  // The group whose editor is open, if it is still there; an editor of either kind is "editing".
  const editedGroup = editingGroupId === null ? undefined : groupById(project, editingGroupId);
  const editingGroup = editedGroup !== undefined;
  const editingAny = editing || editingGroup;
  // A fit problem has the stage to itself (NoFit, PinConflict, MobileFix) unless an editor or the
  // box is open: their stages tell it in a line.
  const fitKind = status.fit === undefined ? null : fitKindOf(status.fit);
  const showFit = fitKind !== null && !editingAny && !boxOpen;
  // The rows that say "Doesn't fit": the tray of the closest attempt that does not, or the component
  // of every pin in the way (the heading names the first).
  const firstConflict = conflicts[0];
  const culprits = new Set<string>();
  if (fitKind === "noFit" && misfit !== null) {
    culprits.add(misfit.componentId);
  } else if (fitKind === "pinConflict") {
    for (const conflict of conflicts) {
      const owner = project.components.find((c) =>
        conflict.trayKey.startsWith(`${requirementKeyOf(project, c)}:`),
      );
      if (owner !== undefined) {
        culprits.add(owner.id);
      }
    }
  }
  if (showFit) {
    fitSeen.current = true;
  } else if (!working && !wasWorking.current) {
    // idle, and not just back from a run: the problem went by another way (Undo), nothing to hand on
    fitSeen.current = false;
  }
  const fixes = {
    kind: fitKind ?? "noFit",
    actions: status.actions,
    onShow: showSection,
    onKeepSearching: () => {
      store.refit();
      // only a search that began has a Stop to hand the focus to
      keptFromFit.current = store.state.run.peek().status === "running";
    },
    onUnpin: (c: { trayKey: string; kind?: Lock["kind"] }) => store.unpin(c.trayKey, c.kind),
  } as const;

  const clearEditNote = useCallback(() => setEditNote(null), []);
  // The phone's strip in the sheet's editor: the tray drawn small, and the sentence or the note.
  const editorStrip =
    (editedComponent !== undefined || editedGroup !== undefined) && phone ? (
      <EditorStrip
        componentId={editedComponent?.id}
        groupId={editedGroup?.id}
        components={project.components}
        groups={project.groups}
        trays={printable}
        box={project.box}
        settings={projSettings}
        note={editNote}
        onNoteDone={clearEditNote}
        problem={editorProblem(status)}
        onRetry={() => store.retry()}
      />
    ) : undefined;
  // One group edit, one undo step. The notes it gives (the rules that went with a lower number of
  // copies) are said in the stage's slot, as an option's note is.
  const editGroupWith = (fn: (q: Project) => EditResult): string[] => {
    let notes: string[] = [];
    store.edit((q) => {
      const result = fn(q);
      notes = result.notes;
      return result.project;
    });
    return notes;
  };
  // What an edit says (the rules that went, the copies an item now has) shows in the stage's slot.
  const sayNotes = (notes: readonly string[]): void => {
    if (notes.length > 0) {
      noteSeq.current += 1;
      setEditNote({ text: notesAsSentences(notes).join(" "), id: noteSeq.current });
    }
  };
  const groupActions: GroupEditActions = {
    rename: (id, name) => store.edit((q) => renameGroup(q, id, name)),
    copies: (id, n) => {
      sayNotes(editGroupWith((q) => setGroupCopies(q, id, n)));
    },
    access: (id, access: Access) => store.edit((q) => setGroupAccess(q, id, access)),
    move: (id, itemId, index) => store.edit((q) => orderMember(q, id, itemId, index)),
    remove: (id) => {
      const group = groupById(project, id);
      if (group === undefined) {
        return false;
      }
      const notes = editGroupWith((q) => removeGroup(q, id));
      // Undo on the toast is only right while the removal is still the latest step.
      setRemoved({ words: groupRemovedWords(notes), version: s.history.version.peek() });
      return true;
    },
  };
  // An item's Copies and its Group row: each is one undo step; the notes (the group's copies it now
  // has, who left, the pins that went) are said in the stage's slot, as the group editor's are.
  const itemActions: ItemGroupActions = {
    copies: (id, n) => sayNotes(editGroupWith((q) => setCopies(q, id, n))),
    moveTo: (id, groupId) => sayNotes(editGroupWith((q) => moveToGroup(q, id, groupId, Infinity))),
    newGroup: (id) =>
      sayNotes(
        editGroupWith((q) => {
          const made = newGroupWith(q, id);
          return { project: made.project, notes: made.notes };
        }),
      ),
    takeOut: (id) => sayNotes(editGroupWith((q) => takeOutOfGroup(q, id))),
    // A drop in the rail (spec §7.3): one undo step. The list is showing, not an editor, so the notes
    // go in the removal's toast (with "Undo move"), and back to the rail to be said aloud once.
    drop: (id, target) => {
      const notes = notesAsSentences(
        editGroupWith((q) =>
          "out" in target
            ? takeOutOfGroup(q, id)
            : moveToGroup(q, id, target.groupId, target.index),
        ),
      );
      if (notes.length > 0) {
        setRemoved({
          words: notes.join(" "),
          version: s.history.version.peek(),
          undo: UNDO_MOVE,
          silent: true,
        });
      }
      return notes;
    },
  };
  // What's inside: the rail's list (the sheet's, on a phone), or a component's editor in its place.
  const whatsInside = (
    <WhatsInside
      components={project.components}
      openId={editingId}
      onOpenChange={(id) => {
        setEditingId(id);
        // A row chosen from the folded sheet opens it on the editor.
        if (id !== null) {
          setEditingGroupId(null);
          setSheetOpen(true);
        }
      }}
      openGroupId={editingGroupId}
      onOpenGroupChange={(id) => {
        setEditingGroupId(id);
        if (id !== null) {
          setEditingId(null);
          setBoxOpen(false);
          setSheetOpen(true);
        }
      }}
      groupActions={groupActions}
      itemActions={itemActions}
      trays={listTrays}
      locks={project.locks}
      groups={project.groups}
      box={project.box}
      printer={projPrinter}
      phone={phone}
      selectedIds={selectedIds}
      culprits={culprits}
      onOpenBox={openBox}
      onSettings={() => openSettings()}
      onHover={(id) => {
        hoveredComponent.value = id;
      }}
      onClearChoices={() => store.edit(clearChoices)}
      onAdd={addComponentOfKind}
      onAddGroup={addGroupToList}
      onLight={(ids) => {
        hoveredMembers.value = ids;
      }}
      onUnpin={(keys) => store.edit((q) => unpinTrays(q, keys))}
      onFreeTurn={(keys) => store.edit((q) => keys.reduce(freeTurn, q))}
      onUnlockSize={(keys) =>
        store.edit((q) => keys.reduce((p, key) => removeLock(p, key, "size"), q))
      }
      onChange={(id, next) => store.edit((q) => updateComponent(q, id, next))}
      onNote={(text) => {
        noteSeq.current += 1;
        setEditNote({ text, id: noteSeq.current });
      }}
      strip={editorStrip}
      onRemove={(id) => {
        const component = project.components.find((x) => x.id === id);
        if (component === undefined) {
          return false;
        }
        store.edit((q) => removeComponent(q, id));
        // Undo on the toast is only right while the removal is still the latest step.
        setRemoved({
          words: removedWords(component.name === "" ? "(unnamed)" : component.name),
          version: s.history.version.peek(),
        });
        return true;
      }}
    />
  );
  // The box's editor, in the rail's place (the phone's sheet holds it whole, with the side view under
  // the fields). The problem the plan has, told by the heading while it is drawn, is a line here.
  const boxProblem = editorProblem(status);
  const boxSideView = (
    <BoxSideView
      box={project.box}
      settings={projSettings}
      layout={layout}
      components={project.components}
      phone={phone}
    />
  );
  const boxEditor = (
    <div class="wi ws-interim wi--edit">
      <BoxPanel
        box={project.box}
        onChange={(patch) => store.edit((q) => updateBox(q, patch))}
        onBack={() => setBoxOpen(false)}
        phone={phone}
        sideView={boxSideView}
        notice={
          boxProblem ? <ProblemLine problem={boxProblem} onRetry={() => store.retry()} /> : null
        }
      />
    </div>
  );
  // The editor is showing in the sheet, or the box has it: the sheet is "full"; below 600 px that
  // fills the screen, and what is behind it is out of reach of Tab and screen readers (inert).
  const sheetFull = editingAny || boxOpen;
  const sheetCoversScreen = phone && narrow && sheetOpen && sheetFull;

  // The three slots of the workspace shell. What is in them is the old UI, unchanged, until the
  // task that rebuilds it: the header (Task 4), the rail (Tasks 10, 11), the stage (6 to 8). The
  // first visit is its own screen (`FirstVisit`, Task 9) on the same shell.
  // The file chooser lives here, not in the menu: the menu may close while the system dialog is up.
  const fileInput = (
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
  );
  // The project menu's content: the workspace's header and the first visit's header both open it.
  const projectMenu = (close: () => void) => (
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
      firstVisit={firstVisit}
    />
  );
  // The rail's width, the person's choice on a desktop (kept per browser; `prefs.railWidth`).
  const railWidth = { value: store.prefs.railWidth.value, onChange: store.prefs.setRailWidth };
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
          fitProblem
            ? // the run was made and the plan does not fit: that is what is in the way, not a stale plan
              "Fix the fit to download"
            : layout === undefined
              ? canPlan
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
        menuDot={placed.menu.length > 0}
        menuNoticeCount={placed.menu.length}
        menu={projectMenu}
      />
      {fileInput}
    </>
  );
  // A phone's sheet holds the fit problem's cards over the list (MobileFix): the list stays one tap away.
  const railSlot = boxOpen ? (
    boxEditor
  ) : showFit && phone ? (
    <>
      <FitCards {...fixes} />
      {whatsInside}
    </>
  ) : (
    whatsInside
  );
  // A phone's tray bar is a modal sheet (MobileTray). It gives way to an editor in the sheet below, and
  // to the plan while a swap is chosen (SelectedTrayBar). It is in the top layer: where it is in the tree does not matter.
  const traySheet =
    phone && hasSelectedTray && !editingAny && !boxOpen && !showFit ? (
      <SelectedTrayBar
        {...barProps}
        phone
        inPlan={view === "plan"}
        swapFrom={view === "plan" ? s.swapFrom.value : null}
      />
    ) : null;
  // What every stage has: the app's notices and live regions (always mounted, so a region is there
  // before it has anything to say), and, at the foot, the note about a removal.
  const notices = (
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
    </>
  );
  // The removal's note: said aloud (always mounted, so it is heard), and shown in the stage's slot,
  // as Edit's note toast is (the first visit has no slot: it follows the empty box).
  const removedShown = removed !== null && removed.version === s.history.version.value;
  const removedLive = (
    <div class="visually-hidden" role="status" data-live="removed">
      {removedShown && removed !== null && removed.silent !== true
        ? `${removed.words} ${removed.undo ?? UNDO_REMOVAL} is available.`
        : ""}
    </div>
  );
  const removedToast = removedShown ? (
    <RemovedToast
      words={removed?.words}
      undoLabel={removed?.undo}
      onUndo={() => {
        setRemoved(null);
        store.undo();
      }}
      onDismiss={() => setRemoved(null)}
    />
  ) : null;
  const removedNote = (
    <>
      {removedLive}
      {removedToast}
    </>
  );
  // The plan's frame, as the workspace and the editor both draw it (the layer, the selection and
  // the slot are each one's own).
  const planProps = layout
    ? {
        trays: printable,
        box: project.box,
        settings: project.settings,
        components: project.components,
        groups: project.groups,
        lockedKeys: locked,
        stale: s.stale.value,
        searching: run.status === "running",
        swapFrom: s.swapFrom.value,
        onSwapFromChange: (key: string | null) => {
          s.swapFrom.value = key;
        },
        onSwap: (a: string, b: string) => store.edit((q) => swapTrays(q, a, b)),
        sizeLockedKeys: sizeLocked,
      }
    : null;
  // An insert with items and no plan yet.
  const workingOnIt = (
    <div class="pf-frame pf-view">
      <div class="stage-empty">
        <div class="stage-empty-box">
          <span class="pf-measure">{`Your box, ${mm(project.box.innerWidth)} × ${mm(project.box.innerDepth)} mm`}</span>
        </div>
        <h2>Working out the trays…</h2>
        <p>The plan appears here as soon as every field is valid.</p>
      </div>
    </div>
  );
  // The layout and sizing notices, under the plan caption.
  const stageNotes = <StageNotes notices={summaryNotices} />;
  const stageSlot = (
    <>
      {notices}
      {traySheet}
      {boxOpen ? (
        // While the box is edited the stage is Box's: its side view, labelled as the page's h1. (A
        // phone's sheet has the h1 and the side view; the stage is the plan alone.)
        <BoxStage
          box={project.box}
          settings={projSettings}
          layout={layout}
          components={project.components}
          groups={project.groups}
          phone={phone}
          plan={planProps}
          placeholder={workingOnIt}
          after={stageNotes}
          problem={boxProblem}
          onRetry={() => store.retry()}
        />
      ) : editedComponent !== undefined || editedGroup !== undefined ? (
        // While a component (or a group, G2) is edited the stage is Edit's: the sentence is the
        // page's h1, the box shows its trays lifted. (A phone's sheet has the h1.)
        <EditorStage
          componentId={editedComponent?.id}
          groupId={editedGroup?.id}
          components={project.components}
          groups={project.groups}
          trays={printable}
          note={editNote}
          onNoteDone={clearEditNote}
          phone={phone}
          plan={planProps}
          placeholder={workingOnIt}
          after={stageNotes}
          problem={editorProblem(status)}
          onRetry={() => store.retry()}
          view={view}
          onViewChange={showView}
          webgl={webgl}
          viewer={{
            box: project.box,
            settings: project.settings,
            stale: s.stale.value,
            meshes,
            ...props.viewerProps,
          }}
        />
      ) : showFit ? (
        // NoFit, PinConflict and MobileFix: the heading, the picture and the panel of what to do.
        <FitProblem
          {...fixes}
          status={status}
          trays={
            fitKind === "noFit"
              ? (s.noFitAttempt.value?.trays ?? (layout ? printable : null))
              : layout
                ? printable
                : null
          }
          box={project.box}
          settings={projSettings}
          components={project.components}
          groups={project.groups}
          lockedKeys={locked}
          misfitKey={misfit?.trayKey}
          focusKey={fitKind === "noFit" ? misfit?.trayKey : firstConflict?.trayKey}
          phone={phone}
          after={stageNotes}
        />
      ) : (
        // The normal stage is the editor's component too, with no item: one frame, so the 3D view
        // is the same Viewer whether an item is open or not (EditorStage's StageFrame).
        <EditorStage
          components={project.components}
          groups={project.groups}
          trays={printable}
          note={null}
          onNoteDone={clearEditNote}
          phone={phone}
          plan={planProps}
          viewer={{
            box: project.box,
            settings: project.settings,
            stale: s.stale.value,
            meshes,
            ...props.viewerProps,
          }}
          normal={{
            top: (
              <StageTop
                {...statusInput}
                trays={layout?.trays}
                levels={planLevels}
                level={s.viewLevel.value}
                onLevelChange={(l) => {
                  s.viewLevel.value = l;
                }}
                cut={s.viewCut.value}
                onCutChange={(c) => {
                  s.viewCut.value = c;
                }}
                view={view}
                onViewChange={showView}
                webgl={webgl}
                phone={phone}
                onKeepSearching={() => store.refit()}
                onStop={() => store.cancelRun()}
                onRetry={() => store.retry()}
                onShow={showSection}
              />
            ),
            body:
              planProps !== null ? (
                <PlanView
                  {...planProps}
                  selectedKey={s.selection.value}
                  level={s.viewLevel.value}
                  onLevelChange={(l) => {
                    s.viewLevel.value = l;
                  }}
                  onSelect={(key) => {
                    s.selection.value = key;
                  }}
                  bar={
                    hasSelectedTray && !phone ? (
                      <SelectedTrayBar
                        {...barProps}
                        phone={false}
                        inPlan
                        swapFrom={s.swapFrom.value}
                      />
                    ) : phone ? undefined : (
                      (removedToast ?? undefined)
                    )
                  }
                />
              ) : (
                <>
                  <StageSlot quiet idle={phone}>
                    {phone ? undefined : (removedToast ?? undefined)}
                  </StageSlot>
                  {workingOnIt}
                </>
              ),
            threeD:
              planProps !== null && view !== "plan"
                ? {
                    slot: {
                      idle: phone,
                      children:
                        hasSelectedTray && !phone ? (
                          <SelectedTrayBar
                            {...barProps}
                            phone={false}
                            inPlan={false}
                            swapFrom={null}
                          />
                        ) : phone ? undefined : (
                          (removedToast ?? undefined)
                        ),
                    },
                    viewer: {
                      trays: printable,
                      box: project.box,
                      settings: project.settings,
                      components: project.components,
                      groups: project.groups,
                      stale: s.stale.value,
                      meshes,
                      selectedKey: s.selection.value,
                      topLayer: s.viewCut.value,
                      levels: planLevels,
                      onSelect: (key) => {
                        s.selection.value = key;
                      },
                      ...props.viewerProps,
                    },
                  }
                : null,
            after: stageNotes,
          }}
        />
      )}
      {exportOpen && layout !== undefined ? (
        <ExportPanel
          titleId="export-title"
          trays={printable}
          components={project.components}
          groups={project.groups}
          printer={project.printer}
          settings={project.settings}
          meshes={meshes}
          projectName={project.name}
          summary={summary}
          disabled={run.status === "running"}
          stale={s.stale.value}
          download={download}
          phone={phone}
          onSendFile={() => {
            void sendFile();
          }}
          onClose={() => setExportOpen(false)}
          onOpenGuide={() => {
            setExportOpen(false);
            setAssemblyFor(project.id);
          }}
        />
      ) : null}
      {removedLive}
      {phone ? removedToast : null}
    </>
  );

  return (
    <ValidationContext.Provider value={validation}>
      <SizingContext.Provider value={sizingNotices}>
        <SettingsContext.Provider value={projSettings}>
          {firstVisit ? (
            <FirstVisit
              box={project.box}
              phone={phone}
              onBoxChange={(patch) => store.edit((q) => updateBox(q, patch))}
              onPick={addComponentOfKind}
              onExample={addExample}
              onOpenFile={() => fileRef.current?.click()}
              menu={projectMenu}
              menuDot={placed.menu.length > 0}
              menuNoticeCount={placed.menu.length}
              headerExtra={fileInput}
              stageBefore={notices}
              stageAfter={removedNote}
              railWidth={railWidth}
            />
          ) : (
            <Workspace
              // the editor shares the normal stage (WideStage2): its padding is the normal one, so the frame does not move
              focus={(boxOpen || (showFit && fitKind === "noFit")) && !phone}
              class={
                editingAny ? "ws--edit" : boxOpen ? "ws--box" : showFit ? "ws--fit" : undefined
              }
              header={headerSlot}
              rail={railSlot}
              stage={stageSlot}
              inert={sheetCoversScreen}
              railWidth={railWidth}
              sheet={
                !phone
                  ? undefined
                  : {
                      label:
                        showFit && fitKind !== null
                          ? fitTitle(fitKind)
                          : "The box and what's inside",
                      title: showFit && fitKind !== null ? fitTitle(fitKind) : "What's inside",
                      summary: showFit ? undefined : String(project.components.length),
                      handleLabel: "Show everything",
                      expanded: sheetOpen,
                      full: sheetFull,
                      // an editor and the box each bring their own header (Back, the h1, Done)
                      editing: sheetFull,
                      handleRef: sheetHandle,
                      // a tray's sheet in front of it has the region's name
                      region: traySheet === null ? "sheet" : "sheet-behind",
                      onExpandedChange: (open) => {
                        setSheetOpen(open);
                        // An editor, or the box, has the sheet to itself: folding it comes back to the list.
                        if (!open) {
                          setEditingId(null);
                          setEditingGroupId(null);
                          setBoxOpen(false);
                        }
                      },
                      action:
                        editingAny || boxOpen || showFit ? null : (
                          <AddMenu
                            placement="above"
                            onPick={addComponentOfKind}
                            onGroup={addGroupToList}
                          />
                        ),
                    }
              }
            />
          )}
          {settingsOpen !== null ? (
            <SettingsSheet
              initialTab={settingsOpen.tab}
              settings={project.settings}
              nameExample={nameExampleOf(printable, project.components, project.groups)}
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
