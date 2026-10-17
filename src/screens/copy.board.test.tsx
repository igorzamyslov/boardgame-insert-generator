// src/screens/copy.board.test.tsx
// @vitest-environment jsdom
// The copy check (UI rebuild, from Task 4): every visible string of a region, in a state, is a
// literal of that state's board, a ruled string (copy-rulings.ts, citing a DESIGN §7 row), the
// user's own words (`data`) or a string the engine writes (`engine`). Each screen's task adds its
// (state, region) cases here.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import design from "../../docs/DESIGN.md?raw";
import { createAppStore } from "../app/store";
import { renderApp } from "../app/test-app";
import { trayNames } from "../instructions/naming";
import { numberParts } from "../instructions/numbering";
import { COPY_RULINGS } from "./copy-rulings";
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
  /** The phone: the width query answers yes. */
  phone?: boolean;
  /** The app opens on no project at all: the first visit (Task 9). */
  empty?: boolean;
  /** The committed seed the app opens on (default "harbour-kings"). */
  seed?: string;
  /** The project as the state has it (a run that has not made a plan yet, say). */
  project?: (p: Project) => Project;
  /** What a person does before the region is looked at. */
  steps: (store: Store) => void;
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

const openMore = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "More" }));
};

/** A component's editor, opened from its row in the rail (the phone's sheet has the same rows). */
const editRow = (name: RegExp) => (): void => {
  const rail = (document.querySelector('[data-region="rail"], [data-region="sheet"]') ??
    document.body) as HTMLElement;
  fireEvent.click(within(rail).getByRole("button", { name }));
};

/** Every row under More options that opens its exact values, opened too. */
const openAllRows = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /^More options/ }));
  for (const row of document.querySelectorAll<HTMLElement>(".k-drow")) {
    fireEvent.click(row);
  }
};

const editMore = (name: RegExp) => (): void => {
  editRow(name)();
  openAllRows();
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

/** A run that "Keep searching" started, and that has not finished. */
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

const CASES: readonly Case[] = [
  // Task 10: the editors. Edit's Cards, EditKinds' other three, MobileEdit's Miniatures (on a
  // desktop, which no board draws: Edit's layout and MobileEdit's content), and the phone's sheet.
  { state: "editor", board: "Edit", region: "rail", steps: editRow(/^Market deck, /) },
  { state: "editor", board: "Edit", region: "stage", steps: editRow(/^Market deck, /) },
  { state: "editor-more", board: "Edit", region: "rail", steps: editMore(/^Market deck, /) },
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
    region: "stage",
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
  {
    state: "no-fit",
    board: "Main",
    region: "status",
    seed: "harbour-kings-nofit",
    steps: searchFailed("harbour-kings-nofit"),
  },
  {
    state: "no-fit-bed",
    board: "Main",
    region: "status",
    seed: "harbour-kings-nofit-bed",
    steps: searchFailed("harbour-kings-nofit-bed"),
  },
  {
    state: "pin-conflict",
    board: "Main",
    region: "status",
    seed: "harbour-kings-pins",
    steps: searchFailed("harbour-kings-pins"),
  },
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
    region: "sheet",
    phone: true,
    steps: selectTray(/^Heroes/),
  },
  {
    state: "m-tray-market",
    board: "MobileTray",
    region: "sheet",
    phone: true,
    steps: selectTray(/^Market deck/),
  },
  {
    state: "m-tray-more",
    board: "MobileTray",
    region: "sheet",
    phone: true,
    steps: () => {
      selectTray(/^Heroes/)();
      openMore();
    },
  },
  {
    state: "m-tray-spacer",
    board: "MobileTray",
    region: "sheet",
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
      fireEvent.click(screen.getAllByRole("button", { name: /^Delete…/ })[0] as HTMLElement);
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
  return out;
}

async function stringsOf(c: Case): Promise<string[]> {
  if (c.phone === true) {
    phone();
  }
  const { project } = loadSeed(c.seed ?? "harbour-kings");
  const { store } = c.empty
    ? renderApp()
    : renderApp({ project: c.project === undefined ? project : c.project(project) });
  c.steps(store);
  const region = document.querySelector(`[data-region="${c.region}"]`);
  expect(region, `${c.state}: no element with data-region="${c.region}"`).not.toBeNull();
  const allowed: Allowed = {
    literals: await boardLiterals(`${c.board}.dc.html`),
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
