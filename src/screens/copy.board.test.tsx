// src/screens/copy.board.test.tsx
// @vitest-environment jsdom
// The copy check (UI rebuild, from Task 4): every visible string of a region, in a state, is a
// literal of that state's board, a ruled string (copy-rulings.ts, citing a DESIGN §7 row), the
// user's own words (`data`) or a string the engine writes (`engine`). Each screen's task adds its
// (state, region) cases here.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import design from "../../docs/DESIGN.md?raw";
import type { AppProps } from "../app/App";
import type { MeshSource } from "../app/meshes";
import { createAppStore } from "../app/store";
import { cubeMesh } from "../app/test-helpers";
import { GeometryBuildError } from "../geometry/client";
import { renderApp } from "../app/test-app";
import { trayNames } from "../instructions/naming";
import { numberParts } from "../instructions/numbering";
import { COPY_RULINGS } from "./copy-rulings";
import { EXACT_GROUPS } from "../ui/settingsGroups";
import { conflictLine } from "./StageTop";
import { boardLiterals, unruled, visibleStrings } from "../test-support/boardCopy";
import type { Allowed } from "../test-support/boardCopy";
import { loadSeed } from "../test-support/harbourKings";
import type { Project } from "../model/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Store = ReturnType<typeof createAppStore>;

interface Case {
  /** The state of `scripts/design/states.mjs`, or this test's own name for a variant. */
  state: string;
  /** The board (`docs/design/boards/<board>.dc.html`) the state is judged against. */
  board: string;
  /** A region of the app: the element with `data-region="<region>"`. */
  region: string;
  /**
   * A second board whose literals the region may use too: a screen built of two boards' parts (the
   * fit problems' rail is Main's, the phone's fit sheet holds MobileWorkspace's list under MobileFix's cards).
   */
  also?: string;
  /** The phone: the width query answers yes. */
  phone?: boolean;
  /** The app opens on no project at all: the first visit (Task 9). */
  empty?: boolean;
  /** The committed seed the app opens on (default "harbour-kings"). */
  seed?: string;
  /** The project as the state has it (a run that has not made a plan yet, say). */
  project?: (p: Project) => Project;
  /** What the app is given besides the project (a build that never finishes, say). */
  overrides?: Partial<AppProps>;
  /** What a person does before the region is looked at (it may wait for the app to answer). */
  steps: (store: Store) => void | Promise<void>;
}

/** A phone: the width query the app asks (below 760 px) answers yes. */
function phone(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(width < 760px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** The browser can draw 3D: the stage's switches are the board's, without the line that says it cannot. */
const WEBGL: Partial<AppProps> = { viewerProps: { webgl: () => true } };

/** A tray of the plan, selected as a person does: Enter on its tile, found by the name its label starts with. */
const selectTray = (name: RegExp) => (): void => {
  const stage = document.querySelector('[data-region="stage"]') as HTMLElement;
  fireEvent.keyDown(within(stage).getByRole("button", { name }), { key: "Enter" });
};

/** The spare tray or spacer of the plan (the seed has them on its top layer): it has no component, so no name to look for. */
const selectSpacer = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /^Layer 2/ }));
  const spacer = document.querySelector(".plan-tile.is-leftover") as Element;
  expect(spacer, "the seed's top layer has a spacer").not.toBeNull();
  fireEvent.keyDown(spacer, { key: "Enter" });
};

/** The tray dock's ⋯ button (board 4): the menu with Keep here, Rotate 90°, Swap places with…, Put on…, Keep this size. */
const openMore = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "More about this tray" }));
};

/** A component's editor, opened from its row in the rail (the phone's sheet has the same rows). */
/** The kit's project with one more group, empty (a phone's card has no drag to offer it). */
const withEmptyGroup = (p: Project): Project => ({
  ...p,
  groups: [
    ...(p.groups ?? []),
    { id: "emptyg01", name: "Group", access: "sometimes", memberIds: [] },
  ],
});

const editRow = (name: RegExp | string) => (): void => {
  const rail = (document.querySelector('[data-region="rail"], [data-region="sheet"]') ??
    document.body) as HTMLElement;
  // a row only selects: the pencil beside it opens the editor (a group's header: its pencil too)
  const row = within(rail).getByRole("button", { name });
  const pencil = row.closest(".k-rowwrap")?.querySelector<HTMLElement>(".k-row__edit");
  fireEvent.click(pencil ?? row);
};

/** Every row of the editor's Tray settings, opened (the settings inside are always drawn once it is). */
const openAllRows = (): void => {
  for (const row of screen.queryAllByRole("button", {
    name: /^(Reach|Shape|Room|Copies and group)/,
  })) {
    fireEvent.click(row);
  }
};

const editMore = (name: RegExp) => (): void => {
  editRow(name)();
  openAllRows();
};

/** Market deck, moved into the Player kit from its editor's Group row. */
const moveMarketIntoKit = (): void => {
  editMore(/^Market deck, /)();
  fireEvent.click(screen.getByRole("button", { name: /^Move to group…/ }));
  const panel = screen.getByRole("group", { name: "Move to group…" });
  fireEvent.click(within(panel).getByRole("button", { name: /^Player kit/ }));
};

/**
 * Market deck, dragged by its grip between the Player kit's Starter deck and Resources (jsdom has no
 * layout: the rectangles of the list and the kit's card are set by hand).
 */
const dragMarketIntoKit = (): void => {
  const box = (top: number, bottom: number) => ({
    top,
    bottom,
    left: 0,
    right: 300,
    width: 300,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  const at = (el: Element | null, top: number, bottom: number): void => {
    (el as HTMLElement).getBoundingClientRect = () => box(top, bottom);
  };
  const rail = document.querySelector('[data-region="rail"]') as Element;
  at(rail.querySelector(".rail-list"), 0, 600);
  at(rail.querySelector(".gc"), 0, 200);
  at(rail.querySelector(".gc-members"), 50, 174);
  const rows = [...rail.querySelectorAll("[data-member-id]")];
  at(rows[0] ?? null, 50, 90);
  at(rows[1] ?? null, 92, 132);
  at(rows[2] ?? null, 134, 174);
  const grip = [...rail.querySelectorAll<HTMLElement>("[data-grip]")].find((g) =>
    g.closest("li")?.getAttribute("aria-label")?.startsWith("Market deck"),
  ) as HTMLElement;
  const at1 = { pointerId: 1, button: 0 };
  fireEvent.pointerDown(grip, { clientX: 20, clientY: 10, ...at1 });
  fireEvent.pointerMove(document.body, { clientX: 30, clientY: 20, ...at1 });
  fireEvent.pointerMove(document.body, { clientX: 100, clientY: 91, ...at1 });
  act(() => {
    fireEvent.pointerUp(document.body, { clientX: 100, clientY: 91, ...at1 });
  });
};

/** The kind picker's "Something else", added: its editor opens at once. */
const addCustom = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(screen.getByRole("button", { name: "Something else" }));
};

const openMenu = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /^Project menu/ }));
};

const conflict = (store: Store): void => {
  act(() => {
    store.state.conflict.value = true;
    store.pushNotice({ level: "warning", code: "storage.conflict", message: "Another tab saved." });
  });
};

const addKind = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
};

/** Add, then its Group tile: an empty group, its card at the end of the list. */
const addGroup = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
};

/** One of each rule on the first three components: a pin, a turned pin and a size lock. */
const setRules = (store: Store): void => {
  act(() =>
    store.edit((q) => {
      const [a, b] = q.components;
      if (a === undefined || b === undefined) {
        throw new Error("the seed has fewer than two components");
      }
      return {
        ...q,
        locks: [
          { kind: "position", trayKey: `${a.id}:p0:0`, path: "0", rotated: false },
          { kind: "position", trayKey: `${b.id}:p0:0`, path: "1", rotated: true },
          { kind: "size", trayKey: `${a.id}:p0:0`, w: 95, d: 190, h: 40 },
        ],
      };
    }),
  );
};

/** Turn 90° on the first component's tray: a turn lock and no pin (the chip and the note are the rail's). */
const setTurn = (store: Store): void => {
  act(() =>
    store.edit((q) => {
      const [a] = q.components;
      if (a === undefined) {
        throw new Error("the seed has no components");
      }
      return { ...q, locks: [{ kind: "turn", trayKey: `${a.id}:p0:0`, rotated: true }] };
    }),
  );
};

/** Put on… from the first component's tray onto the second's: the stack lock the pick writes. */
const setPutOn = (store: Store): void => {
  act(() =>
    store.edit((q) => {
      const [a, b] = q.components;
      if (a === undefined || b === undefined) {
        throw new Error("the seed has fewer than two components");
      }
      return { ...q, locks: [{ kind: "stack", trayKeys: [`${b.id}:p0:0`, `${a.id}:p0:0`] }] };
    }),
  );
};

/** Put on… chosen on the Market deck's tray, and not yet on a base: the plan's prompt. */
const choosePutOn = (): void => {
  selectTray(/^Market deck/)();
  openMore();
  fireEvent.click(screen.getByRole("button", { name: /^Put on…/ }));
};

/** A count no deck can have: the first component's editor holds an error. */
const breakFirst = (store: Store): void => {
  act(() =>
    store.edit((q) => ({
      ...q,
      components: q.components.map((c, i) =>
        i === 0 && c.kind === "cards" ? { ...c, decks: [{ name: "x", count: -1 }] } : c,
      ),
    })),
  );
  // the case is only worth anything while the row says so
  expect(screen.getByText("Needs attention")).toBeTruthy();
};

/** A run that "Try another arrangement" started, and that has not finished. */
const searching = (store: Store): void => {
  act(() => {
    store.state.run.value = { status: "running", done: 5, total: 100, kind: "improve" };
  });
};

/** What a failed search left (the seed's `.result.json`): the closest attempt, or the pins in the way. */
const searchFailed =
  (seed: string) =>
  (store: Store): void => {
    const { result } = loadSeed(seed);
    if (result === undefined) {
      throw new Error(`seed ${seed} has no result`);
    }
    act(() => {
      store.state.lastResult.value = result;
      store.state.lastResultHash.value = store.state.currentHash.value;
      store.state.lockConflicts.value = result.lockConflicts;
    });
  };

/** A box measure the rules refuse, typed as a person would: the first visit's card says why. */
const breakHeight = (): void => {
  fireEvent.input(screen.getByLabelText(/^Height/), { target: { value: "0" } });
  expect(screen.getByRole("alert")).toBeTruthy();
};

/** The header's Download opens the dialog; "Other formats" shows its two buttons too. */
const openDownload = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Download" }));
};
const openFormats = (): void => {
  openDownload();
  fireEvent.click(screen.getByRole("button", { name: "Other formats" }));
};

/** The primary of the dialog, pressed: the file starts to build. */
const startBuild = (): void => {
  openDownload();
  fireEvent.click(screen.getByRole("button", { name: "Download the 3MF file" }));
};

/** A mesh source whose builds never finish: the dialog stays on its first part. */
const hanging: MeshSource = {
  get: () => new Promise(() => undefined),
  reset: () => undefined,
  forget: () => undefined,
  dispose: () => undefined,
};

/** A mesh source where one part never builds (the first one asked for): the file downloads without it. */
const failsOnePart = (): MeshSource => {
  let failing: string | null = null;
  return {
    get: (spec) => {
      failing ??= spec.key;
      if (spec.key === failing) {
        return Promise.reject(new GeometryBuildError("too slow", "TimeoutError"));
      }
      return Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 });
    },
    reset: () => undefined,
    forget: () => undefined,
    dispose: () => undefined,
  };
};

/** The project menu's Settings opens the drawer; its tabs and groups are buttons. */
const openSettings = (): void => {
  openMenu();
  fireEvent.click(
    within(screen.getByRole("group", { name: "Project" })).getByRole("button", {
      name: "Settings",
    }),
  );
};
const inDrawer = (name: string | RegExp): void => {
  fireEvent.click(
    within(document.querySelector('[data-region="drawer"]') as HTMLElement).getByRole("button", {
      name,
    }),
  );
};
const openPrinter = (): void => {
  openSettings();
  inDrawer("My printer");
};
const searchSettings = (text: string) => (): void => {
  openSettings();
  fireEvent.input(screen.getByRole("searchbox", { name: "Find a setting" }), {
    target: { value: text },
  });
};

const CASES: readonly Case[] = [
  // Task 14: the Settings drawer, Settings at 1440. Each group of Exact numbers is opened in turn, so
  // every label a person can reach is checked; the printer tab is checked with Printer details open,
  // with another printer on the insert and with a printer that was not saved.
  { state: "settings", board: "Settings", region: "drawer", steps: openSettings },
  { state: "settings-printer", board: "Settings", region: "drawer", steps: openPrinter },
  {
    state: "settings-printer-details",
    board: "Settings",
    region: "drawer",
    steps: () => {
      openPrinter();
      inDrawer("My own size");
    },
  },
  {
    state: "settings-printer-other",
    board: "Settings",
    region: "drawer",
    steps: (store) => {
      act(() =>
        store.edit((q) => ({ ...q, printer: { ...q.printer, bedX: 220, bedY: 220, bedZ: 250 } })),
      );
      openPrinter();
    },
  },
  {
    state: "settings-printer-unsaved",
    board: "Settings",
    region: "drawer",
    steps: () => {
      openPrinter();
      inDrawer(/^Printer details/);
      fireEvent.input(screen.getByLabelText(/^Bed margin/), { target: { value: "200" } });
      expect(screen.getByRole("alert")).toBeTruthy();
    },
  },
  {
    state: "settings-search",
    board: "Settings",
    region: "drawer",
    steps: searchSettings("unused"),
  },
  { state: "settings-nomatch", board: "Settings", region: "drawer", steps: searchSettings("zzzz") },
  {
    // Fill the space that's left on Thicker walls: its hint, the thickness box and the way back
    state: "settings-spacers-walls",
    board: "Settings",
    region: "drawer",
    steps: () => {
      openSettings();
      inDrawer(/^Spacers and space/);
      inDrawer("Thicker walls");
    },
  },
  ...EXACT_GROUPS.filter((g) => g.id !== "walls").map((g): Case => ({
    state: `settings-${g.id}`,
    board: "Settings",
    region: "drawer",
    steps: () => {
      openSettings();
      inDrawer(new RegExp(`^${g.title}`));
    },
  })),
  // Task 13: the Download dialog (Export at 1440, MobileDownload on a phone) and the building of the
  // file (Exporting: building, then done). The packing guide has no board and no case.
  { state: "download", board: "Export", region: "dialog", steps: openFormats },
  {
    state: "m-download",
    board: "MobileDownload",
    region: "dialog",
    phone: true,
    steps: openDownload,
  },
  {
    state: "exporting",
    board: "Exporting",
    region: "dialog",
    overrides: { meshes: hanging },
    steps: startBuild,
  },
  {
    state: "exporting-partial",
    board: "Exporting",
    region: "dialog",
    overrides: { meshes: failsOnePart() },
    steps: async () => {
      startBuild();
      await screen.findByRole("heading", { name: /parts are ready$/ }, { timeout: 10_000 });
      // the part that failed is listed with the one Try again
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    },
  },
  {
    state: "exporting-done",
    board: "Exporting",
    region: "dialog",
    steps: async () => {
      startBuild();
      await screen.findByRole("heading", { name: /parts are ready$/ }, { timeout: 10_000 });
    },
  },
  // Task 11: the box's editor, Box at 1440 and MobileBox on a phone, and the plan's problems told in its stage
  {
    state: "box",
    board: "Box",
    region: "rail",
    seed: "harbour-kings-headroom",
    steps: editRow(/^The box/),
  },
  {
    state: "box",
    board: "Box",
    region: "stage",
    seed: "harbour-kings-headroom",
    steps: editRow(/^The box/),
  },
  {
    state: "m-box",
    board: "MobileBox",
    region: "sheet",
    phone: true,
    seed: "harbour-kings-headroom",
    steps: editRow(/^The box/),
  },
  {
    state: "workspace-failed",
    board: "Box",
    region: "stage",
    steps: (store) => {
      editRow(/^The box/)();
      act(() => {
        store.state.run.value = { status: "error", message: "Worker crashed" };
      });
    },
  },
  {
    state: "no-fit",
    board: "Box",
    region: "stage",
    seed: "harbour-kings-nofit",
    steps: (store) => {
      editRow(/^The box/)();
      searchFailed("harbour-kings-nofit")(store);
    },
  },
  {
    state: "pin-conflict",
    board: "Box",
    region: "stage",
    seed: "harbour-kings-pins",
    steps: (store) => {
      editRow(/^The box/)();
      searchFailed("harbour-kings-pins")(store);
    },
  },
  // Task 10: the editors. Edit's Cards, EditKinds' other three, MobileEdit's Miniatures (on a
  // desktop, which no board draws: Edit's layout and MobileEdit's content), and the phone's sheet.
  { state: "editor", board: "Edit", region: "rail", steps: editRow(/^Market deck, /) },
  {
    state: "editor",
    board: "Edit",
    also: "WideStage2",
    region: "stage",
    overrides: WEBGL,
    steps: editRow(/^Market deck, /),
  },
  { state: "editor-more", board: "Edit", region: "rail", steps: editMore(/^Market deck, /) },
  {
    // an option turned on, so a chip and a row show the changed dot and "Back to <default>"
    state: "editor-more-changed",
    board: "Edit",
    region: "rail",
    steps: () => {
      editMore(/^Market deck, /)();
      fireEvent.click(screen.getByRole("button", { name: /^Corner holes/ }));
    },
  },
  {
    state: "editor-tokens",
    board: "EditKinds",
    region: "rail",
    steps: editRow(/^Coins and cubes, /),
  },
  {
    state: "editor-tokens-more",
    board: "EditKinds",
    region: "rail",
    steps: editMore(/^Coins and cubes, /),
  },
  { state: "editor-tiles", board: "EditKinds", region: "rail", steps: editRow(/^Hex tiles, /) },
  {
    state: "editor-tiles-more",
    board: "EditKinds",
    region: "rail",
    steps: editMore(/^Hex tiles, /),
  },
  { state: "editor-custom", board: "EditKinds", region: "rail", steps: addCustom },
  {
    state: "editor-custom-more",
    board: "EditKinds",
    region: "rail",
    steps: () => {
      addCustom();
      openAllRows();
    },
  },
  { state: "editor-minis", board: "MobileEdit", region: "rail", steps: editRow(/^Heroes, /) },
  { state: "editor-minis-more", board: "MobileEdit", region: "rail", steps: editMore(/^Heroes, /) },
  {
    state: "editor-note",
    board: "Edit",
    also: "WideStage2",
    region: "stage",
    overrides: WEBGL,
    steps: () => {
      editRow(/^Market deck, /)();
      fireEvent.click(
        within(screen.getByRole("group", { name: "Sleeves" })).getByRole("button", {
          name: "Premium",
        }),
      );
    },
  },
  // The plan's problems, told in the slot while an editor is open (the status heading's words)
  {
    state: "workspace-failed",
    board: "Main",
    region: "stage",
    steps: (store) => {
      editRow(/^Market deck, /)();
      act(() => {
        store.state.run.value = { status: "error", message: "Worker crashed" };
      });
    },
  },
  {
    state: "no-fit",
    board: "Main",
    region: "stage",
    seed: "harbour-kings-nofit",
    steps: (store) => {
      editRow(/^Market deck, /)();
      searchFailed("harbour-kings-nofit")(store);
    },
  },
  {
    state: "pin-conflict",
    board: "Main",
    region: "stage",
    seed: "harbour-kings-pins",
    steps: (store) => {
      editRow(/^Market deck, /)();
      searchFailed("harbour-kings-pins")(store);
    },
  },
  {
    state: "editor-removed",
    board: "Edit",
    region: "plan",
    steps: () => {
      editRow(/^Market deck, /)();
      fireEvent.click(screen.getByRole("button", { name: "Remove Market deck…" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Market deck" }));
    },
  },
  {
    state: "m-edit",
    board: "MobileEdit",
    region: "sheet",
    phone: true,
    steps: editRow(/^Heroes, /),
  },
  {
    state: "m-edit-more",
    board: "MobileEdit",
    region: "sheet",
    phone: true,
    steps: editMore(/^Heroes, /),
  },
  // 0.7.0 Task 11: GroupEdit's editor (rail and stage), its Remove group… question, the toast of
  // a removal (the copy test's own state), and the phone's sheet (no board draws it: MobileEdit)
  {
    state: "kit-edit",
    board: "GroupEdit",
    region: "rail",
    seed: "harbour-kings-kit",
    steps: editRow(/^Player kit, /),
  },
  {
    state: "kit-edit",
    board: "GroupEdit",
    also: "WideStage2",
    region: "stage",
    overrides: WEBGL,
    seed: "harbour-kings-kit",
    steps: editRow(/^Player kit, /),
  },
  {
    state: "kit-remove",
    board: "GroupEdit",
    region: "rail",
    seed: "harbour-kings-kit",
    steps: () => {
      editRow(/^Player kit, /)();
      fireEvent.click(screen.getByRole("button", { name: "Remove group…" }));
    },
  },
  {
    state: "kit-removed",
    board: "GroupEdit",
    region: "plan",
    seed: "harbour-kings-kit",
    steps: () => {
      editRow(/^Player kit, /)();
      fireEvent.click(screen.getByRole("button", { name: "Remove group…" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove group" }));
    },
  },
  {
    state: "kit-split-edit",
    board: "GroupEdit",
    also: "WideStage2",
    region: "stage",
    overrides: WEBGL,
    seed: "harbour-kings-kit-split",
    steps: editRow(/^Player kit, /),
  },
  {
    state: "m-kit-edit",
    board: "MobileEdit",
    also: "GroupEdit",
    region: "sheet",
    phone: true,
    seed: "harbour-kings-kit",
    steps: editRow(/^Player kit, /),
  },
  // 0.7.0 Task 12: a member's editor with its Tray settings open (no board draws it: Edit's), the Move to
  // group… panel, what a move in and a take out say in the stage's slot, and the phone's sheet
  {
    state: "kit-member",
    board: "Edit",
    also: "MobileEdit",
    region: "rail",
    seed: "harbour-kings-kit",
    steps: editMore(/^Hero, /),
  },
  {
    state: "kit-member",
    board: "Edit",
    also: "WideStage2",
    region: "stage",
    overrides: WEBGL,
    seed: "harbour-kings-kit",
    steps: editMore(/^Hero, /),
  },
  {
    state: "kit-move-panel",
    board: "Edit",
    region: "rail",
    seed: "harbour-kings-kit",
    steps: () => {
      editMore(/^Market deck, /)();
      fireEvent.click(screen.getByRole("button", { name: /^Move to group…/ }));
    },
  },
  {
    state: "kit-member-moved",
    board: "Edit",
    region: "rail",
    seed: "harbour-kings-kit",
    steps: moveMarketIntoKit,
  },
  {
    state: "kit-member-moved",
    board: "Edit",
    region: "status",
    seed: "harbour-kings-kit",
    steps: moveMarketIntoKit,
  },
  {
    state: "kit-member-out",
    board: "Edit",
    region: "status",
    seed: "harbour-kings-kit",
    steps: () => {
      editMore(/^Hero, /)();
      fireEvent.click(screen.getByRole("button", { name: "Take out of group" }));
    },
  },
  // 0.7.0 Task 14: a drop in the rail. No board draws it (R14); the rail and the toast in the plan's slot
  {
    state: "kit-drag",
    board: "GroupRail",
    region: "rail",
    seed: "harbour-kings-kit",
    steps: dragMarketIntoKit,
  },
  {
    state: "kit-drag",
    board: "GroupRail",
    also: "Main",
    region: "plan",
    seed: "harbour-kings-kit",
    steps: dragMarketIntoKit,
  },
  {
    state: "m-kit-member",
    board: "MobileEdit",
    region: "sheet",
    phone: true,
    seed: "harbour-kings-kit",
    steps: editRow(/^Hero, /),
  },
  // 0.7.0 Task 15: an empty group on the phone (the sheet's card, and its editor), no drag offered
  {
    // the sheet's strings are ruled for m-workspace; the card's "Empty" is GroupAdd's
    state: "m-workspace",
    board: "MobileGroup",
    also: "GroupAdd",
    region: "sheet",
    phone: true,
    seed: "harbour-kings-kit",
    project: withEmptyGroup,
    steps: () => undefined,
  },
  {
    state: "m-kit-edit",
    board: "MobileEdit",
    also: "GroupEdit",
    region: "sheet",
    phone: true,
    seed: "harbour-kings-kit",
    project: withEmptyGroup,
    steps: editRow("Group, empty"),
  },
  // Task 9: the first visit, Empty at 1440 and MobileStart on a phone
  { state: "first-visit", board: "Empty", region: "header", empty: true, steps: () => undefined },
  { state: "first-visit", board: "Empty", region: "rail", empty: true, steps: () => undefined },
  { state: "first-visit", board: "Empty", region: "stage", empty: true, steps: () => undefined },
  // The project menu on the first visit: Main's panel, with New insert blocked and no Open file…
  { state: "first-visit-menu", board: "Main", region: "menu", empty: true, steps: openMenu },
  // Empty's error card, minus its button: the words are the rules' (ruled in DESIGN §7)
  { state: "first-visit-error", board: "Empty", region: "rail", empty: true, steps: breakHeight },
  {
    state: "m-start",
    board: "MobileStart",
    region: "header",
    phone: true,
    empty: true,
    steps: () => undefined,
  },
  {
    state: "m-start",
    board: "MobileStart",
    region: "rail",
    phone: true,
    empty: true,
    steps: () => undefined,
  },
  {
    state: "m-start",
    board: "MobileStart",
    region: "stage",
    phone: true,
    empty: true,
    steps: () => undefined,
  },
  { state: "workspace", board: "Main", region: "rail", steps: () => undefined },
  { state: "workspace-add", board: "Main", region: "rail", steps: addKind },
  { state: "workspace-rules", board: "Main", region: "rail", steps: setRules },
  // 0.7.0 Task 13: Turn 90° alone (the Turned chip and its note), and the Cards editor's Between decks
  { state: "workspace-turned", board: "Main", region: "rail", steps: setTurn },
  // 0.15.0: Put on…, the pill that asks for the base, and the On chip with its note
  { state: "workspace-put-on", board: "Main", region: "rail", steps: setPutOn },
  { state: "workspace-put-on-pick", board: "Main", region: "tray-bar", steps: choosePutOn },
  {
    state: "editor-flat-decks",
    board: "Edit",
    region: "rail",
    seed: "harbour-kings-flat",
    steps: editMore(/^Starter deck, /),
  },
  {
    // upright storage blocks Between decks, with its reason
    state: "editor-flat-decks-upright",
    board: "Edit",
    region: "rail",
    seed: "harbour-kings-flat",
    project: (p) => ({
      ...p,
      components: p.components.map((c) =>
        c.kind === "cards" && c.decks.length > 1 ? { ...c, storage: "upright-long" } : c,
      ),
    }),
    steps: editMore(/^Starter deck, /),
  },
  // 0.7.0 Task 9: GroupRail's card, GroupAdd's empty card and its picker
  {
    state: "kit-rail",
    board: "GroupRail",
    region: "rail",
    seed: "harbour-kings-kit",
    steps: () => undefined,
  },
  {
    state: "kit-add",
    board: "GroupAdd",
    region: "rail",
    seed: "harbour-kings-kit-loose",
    steps: addGroup,
  },
  {
    state: "kit-picker",
    board: "GroupAdd",
    region: "rail",
    seed: "harbour-kings-kit-loose",
    steps: addKind,
  },
  // 0.7.0 Task 10: GroupRail's plan (the kit's trays named Player kit 1…4) and its tray bar
  {
    state: "kit-rail",
    board: "GroupRail",
    region: "plan-box",
    seed: "harbour-kings-kit",
    steps: () => undefined,
  },
  {
    state: "kit-rail",
    board: "GroupRail",
    region: "tray-bar",
    seed: "harbour-kings-kit",
    steps: selectTray(/^Player kit 2/),
  },
  { state: "workspace-error", board: "Main", region: "rail", steps: breakFirst },
  {
    state: "m-workspace",
    board: "MobileWorkspace",
    region: "sheet",
    phone: true,
    steps: () => undefined,
  },
  {
    state: "m-workspace-add",
    board: "MobileWorkspace",
    region: "sheet",
    phone: true,
    steps: addKind,
  },
  {
    state: "m-workspace-rules",
    board: "MobileWorkspace",
    region: "sheet",
    phone: true,
    steps: setRules,
  },
  { state: "m-turned", board: "MobileWorkspace", region: "sheet", phone: true, steps: setTurn },
  { state: "m-put-on", board: "MobileWorkspace", region: "sheet", phone: true, steps: setPutOn },
  // Task 6: the status heading with its switches and action, the banner, the notes
  { state: "workspace", board: "Main", region: "status", steps: () => undefined },
  { state: "workspace-searching", board: "Main", region: "status", steps: searching },
  {
    state: "workspace-banner",
    board: "Main",
    region: "status",
    seed: "harbour-kings-stale",
    steps: () => undefined,
  },
  {
    state: "workspace-banner",
    board: "Main",
    region: "banner",
    seed: "harbour-kings-stale",
    steps: () => undefined,
  },
  {
    state: "m-workspace",
    board: "MobileWorkspace",
    region: "status",
    phone: true,
    steps: () => undefined,
  },
  // Main's `{props: {notice: "olderVersion"}}`, which Main draws in the menu: the app keeps it a plan banner.
  {
    state: "workspace-older",
    board: "Main",
    region: "banner",
    project: (p) =>
      p.layout === undefined ? p : { ...p, layout: { ...p.layout, geometryVersion: "0.1.0" } },
    steps: () => undefined,
  },
  {
    state: "workspace-notes",
    board: "Main",
    region: "notes",
    seed: "harbour-kings-notes",
    steps: () => undefined,
  },
  // No board of its own: judged against Main's status heading (the fit problems too: Task 12 puts
  // NoFit's and PinConflict's boards against these).
  {
    state: "workspace-making",
    board: "Main",
    region: "status",
    steps: (store) => {
      act(() => {
        store.state.runScheduled.value = true;
      });
    },
  },
  {
    state: "workspace-noplan",
    board: "Main",
    region: "status",
    project: (p) => ({ ...p, layout: undefined }),
    // the run that was on its way has ended without a plan: nothing is going on, and there is none
    steps: (store) => {
      act(() => {
        store.state.runScheduled.value = false;
        store.state.run.value = { status: "idle" };
      });
    },
  },
  {
    state: "workspace-failed",
    board: "Main",
    region: "status",
    steps: (store) => {
      act(() => {
        store.state.run.value = { status: "error", message: "Worker crashed" };
      });
    },
  },
  { state: "workspace-error", board: "Main", region: "status", steps: breakFirst },
  {
    state: "workspace-box-error",
    board: "Main",
    region: "status",
    steps: (store) => {
      act(() => store.edit((q) => ({ ...q, box: { ...q.box, innerHeight: -5 } })));
    },
  },
  // Task 12: the fit problems, NoFit and PinConflict at 1440, MobileFix on a phone. The rail is
  // Main's (Task 5; NoFit and PinConflict draw an older one), and the phone's sheet holds
  // MobileWorkspace's list under MobileFix's cards.
  ...(["status", "stage", "rail", "header", "plan-box", "options"] as const).flatMap((region) =>
    [
      ["no-fit", "NoFit", "harbour-kings-nofit"],
      ["no-fit-bed", "NoFit", "harbour-kings-nofit-bed"],
      ["pin-conflict", "PinConflict", "harbour-kings-pins"],
    ].flatMap(([state = "", board = "", seed = ""]): Case[] =>
      // the options panel is only PinConflict's: no fit has the strip in its status row
      region === "options" && state !== "pin-conflict"
        ? []
        : [
            {
              state,
              board,
              also: region === "rail" ? "Main" : undefined,
              region,
              seed,
              steps: searchFailed(seed),
            },
          ],
    ),
  ),
  ...(["status", "sheet", "header", "plan-box"] as const).flatMap((region) =>
    [
      ["m-fix", "harbour-kings-nofit"],
      ["m-pin-conflict", "harbour-kings-pins"],
    ].map(([state = "", seed = ""]): Case => ({
      state,
      board: "MobileFix",
      also: region === "sheet" ? "MobileWorkspace" : undefined,
      region,
      phone: true,
      seed,
      steps: searchFailed(seed),
    })),
  ),
  // Task 7: the plan's box (the tiles' marks), and its column (the slot, the caption, the pins line)
  { state: "workspace", board: "Main", region: "plan-box", steps: () => undefined },
  { state: "workspace-rules", board: "Main", region: "plan-box", steps: setRules },
  {
    state: "m-workspace",
    board: "MobileWorkspace",
    region: "plan-box",
    phone: true,
    steps: () => undefined,
  },
  {
    state: "m-workspace-rules",
    board: "MobileWorkspace",
    region: "plan-box",
    phone: true,
    steps: setRules,
  },
  { state: "workspace", board: "Main", region: "plan", steps: () => undefined },
  { state: "workspace-rules", board: "Main", region: "plan", steps: setRules },
  {
    state: "m-workspace",
    board: "MobileWorkspace",
    region: "plan",
    phone: true,
    steps: () => undefined,
  },
  {
    state: "m-workspace-rules",
    board: "MobileWorkspace",
    region: "plan",
    phone: true,
    steps: setRules,
  },
  // Task 8: the tray bar and the phone's tray sheet (no board draws More's panel, a spacer's sheet or a riser)
  {
    state: "workspace-tray",
    board: "Main",
    region: "tray-bar",
    steps: selectTray(/^Market deck/),
  },
  {
    state: "workspace-tray-more",
    board: "Main",
    region: "tray-bar",
    steps: () => {
      selectTray(/^Market deck/)();
      openMore();
    },
  },
  { state: "workspace-tray-spacer", board: "Main", region: "tray-bar", steps: selectSpacer },
  {
    state: "m-tray",
    board: "MobileTray",
    region: "tray-bar",
    phone: true,
    steps: selectTray(/^Heroes/),
  },
  {
    state: "m-tray-market",
    board: "MobileTray",
    region: "tray-bar",
    phone: true,
    steps: selectTray(/^Market deck/),
  },
  {
    state: "m-tray-more",
    board: "MobileTray",
    region: "tray-bar",
    phone: true,
    steps: () => {
      selectTray(/^Heroes/)();
      openMore();
    },
  },
  {
    state: "m-tray-spacer",
    board: "MobileTray",
    region: "tray-bar",
    phone: true,
    steps: selectSpacer,
  },
  { state: "workspace", board: "Main", region: "header", steps: () => undefined },
  { state: "workspace-menu", board: "Main", region: "menu", steps: openMenu },
  {
    state: "m-workspace",
    board: "MobileWorkspace",
    region: "header",
    phone: true,
    steps: () => undefined,
  },
  // No board of its own: judged against Main's menu panel.
  { state: "workspace-menu-phone", board: "Main", region: "menu", phone: true, steps: openMenu },
  {
    state: "inserts",
    board: "Main",
    region: "menu",
    steps: () => {
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: /^Your inserts/ }));
    },
  },
  {
    state: "inserts-delete",
    board: "Main",
    region: "menu",
    steps: () => {
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: /^Your inserts/ }));
      fireEvent.click(screen.getAllByRole("button", { name: /^Delete .*…$/ })[0] as HTMLElement);
    },
  },
  {
    state: "workspace-unnamed",
    board: "Main",
    region: "header",
    steps: (store) => {
      act(() => store.edit((q) => ({ ...q, name: "" })));
    },
  },
  // Main's `{props: {notice: "otherTab"}}`: Saving paused, the dot, and the note in the menu.
  {
    state: "workspace-note",
    board: "Main",
    region: "header",
    steps: (store) => conflict(store),
  },
  {
    state: "workspace-note-menu",
    board: "Main",
    region: "menu",
    steps: (store) => {
      conflict(store);
      openMenu();
    },
  },
];

/** The user's own words: the project's names, its components' and pieces', and its trays'. */
function dataOf(store: Store): Set<string> {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) {
        if (key === "name" && typeof v === "string") {
          out.add(v);
        } else {
          walk(v);
        }
      }
    }
  };
  const project = store.state.project.value;
  out.add(project.name);
  walk(project.components);
  // a group's name is the person's too: "Player kit"
  walk(project.groups);
  if (project.layout !== undefined) {
    for (const name of trayNames(numberParts(project.layout.trays), project.components).values()) {
      out.add(name.full);
      out.add(name.short);
    }
  }
  return out;
}

/** What the engine writes: the store's notices, the validation messages. */
function engineOf(store: Store): Set<string> {
  const s = store.state;
  const out = new Set<string>();
  for (const n of [...s.appNotices.value, ...s.validation.value, ...s.layoutNotices.value]) {
    out.add(n.message);
  }
  // the pins' reasons, as the heading's line says them
  if (s.lockConflicts.value.length > 0) {
    out.add(conflictLine(s.lockConflicts.value));
  }
  return out;
}

async function stringsOf(c: Case): Promise<string[]> {
  if (c.phone === true) {
    phone();
  }
  const { project } = loadSeed(c.seed ?? "harbour-kings");
  const { store } = c.empty
    ? renderApp()
    : renderApp({
        project: c.project === undefined ? project : c.project(project),
        overrides: c.overrides,
      });
  await c.steps(store);
  const region = document.querySelector(`[data-region="${c.region}"]`);
  expect(region, `${c.state}: no element with data-region="${c.region}"`).not.toBeNull();
  const literals = await boardLiterals(`${c.board}.dc.html`);
  if (c.also !== undefined) {
    for (const text of await boardLiterals(`${c.also}.dc.html`)) {
      literals.add(text);
    }
  }
  const allowed: Allowed = {
    literals,
    rulings: COPY_RULINGS.filter((r) => r.states === "all" || r.states.includes(c.state)),
    data: dataOf(store),
    engine: engineOf(store),
  };
  return unruled(visibleStrings(region as Element), allowed);
}

describe("the copy of each state's regions", () => {
  for (const c of CASES) {
    it(`${c.state}/${c.region} prints only board literals, ruled strings, data and engine text`, async () => {
      expect(await stringsOf(c)).toEqual([]);
    });
  }

  it("rules the saved status's other states", async () => {
    const { project } = loadSeed("harbour-kings");
    const { store } = renderApp({ project });
    const allowed: Allowed = {
      literals: await boardLiterals("Main.dc.html"),
      rulings: COPY_RULINGS,
      data: dataOf(store),
      engine: engineOf(store),
    };
    const header = document.querySelector('[data-region="header"]') as Element;
    const { savePending, saveFailed, storageAvailable } = store.state;
    const set = (pending: boolean, failed: boolean, available: boolean): void => {
      act(() => {
        savePending.value = pending;
        saveFailed.value = failed;
        storageAvailable.value = available;
      });
    };
    for (const [state, pending, failed, available] of [
      ["saving", true, false, true],
      ["failed", false, true, true],
      ["unavailable", false, false, false],
    ] as const) {
      set(pending, failed, available);
      expect(store.state.saveState.value).toBe(state);
      expect(unruled(visibleStrings(header), allowed), state).toEqual([]);
    }
  });
});

describe("the rulings", () => {
  // §7's table: each row's first cell is its Decision.
  const section = design.slice(design.indexOf("## 7. Decision log"));
  const decisions = section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .map((line) => (line.split("|")[1] ?? "").replace(/\s+/g, " ").trim());

  it("cites a real decision-log row for every ruled string", () => {
    expect(decisions.length).toBeGreaterThan(20);
    const missing = COPY_RULINGS.filter(
      (r) => !decisions.some((decision) => decision.startsWith(r.ruling)),
    ).map((r) => `${r.text}: no §7 row starts "${r.ruling}"`);
    expect(missing).toEqual([]);
  });
});
