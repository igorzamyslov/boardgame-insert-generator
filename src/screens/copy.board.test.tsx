// src/screens/copy.board.test.tsx
// @vitest-environment jsdom
// The copy check (UI rebuild, from Task 4): every visible string of a region, in a state, is a
// literal of that state's board, a ruled string (copy-rulings.ts, citing a DESIGN §7 row), the
// user's own words (`data`) or a string the engine writes (`engine`). Each screen's task adds its
// (state, region) cases here.
import { act, cleanup, fireEvent, screen } from "@testing-library/preact";
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

const CASES: readonly Case[] = [
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
  const { project } = loadSeed("harbour-kings");
  const { store } = renderApp({ project });
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
