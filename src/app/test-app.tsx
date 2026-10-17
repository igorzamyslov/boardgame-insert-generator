// src/app/test-app.tsx
// Test-only: the App on a real store with stubbed clients. Imported only from *.test.tsx files.
import { render } from "@testing-library/preact";
import { vi } from "vitest";
import type { Project } from "../model/types";
import { createPrefsStore, createProjectStore } from "../share";
import { MemoryStorage } from "../test-support/memory-storage";
import { App } from "./App";
import type { AppProps } from "./App";
import type { MeshSource } from "./meshes";
import { createAppStore } from "./store";
import { EMPTY_FOREIGN, cubeMesh, fixtureProject, stubLayoutClient } from "./test-helpers";

export interface RenderAppOptions {
  /** Saved into the project store before the app starts, so it opens as the latest project. */
  project?: Project;
  storage?: MemoryStorage;
  overrides?: Partial<AppProps>;
}

export function renderApp(opts: RenderAppOptions = {}) {
  return mountApp("", opts.overrides ?? {}, opts);
}

/**
 * The app past its first visit: a project with items in it, so the header has its name, Undo, the
 * menu and Download (the first visit's header is Open file alone).
 */
export function renderWorkspace(opts: RenderAppOptions = {}) {
  return renderApp({ ...opts, project: opts.project ?? fixtureProject() });
}

/** The app opened on an old `#1.` link, as a bookmarked or sent one would be. */
export function renderAppFromHash(hash: string, opts: RenderAppOptions = {}) {
  return mountApp(hash, opts.overrides ?? {}, opts);
}

function mountApp(
  hash: string,
  overrides: Partial<AppProps>,
  opts: { project?: Project; storage?: MemoryStorage },
) {
  const stub = stubLayoutClient();
  const projectStore = createProjectStore(opts.storage ?? new MemoryStorage());
  if (opts.project) {
    projectStore.save(opts.project, EMPTY_FOREIGN);
  }
  const prefs = createPrefsStore(new MemoryStorage());
  const clearHash = vi.fn<() => void>();
  const store = createAppStore({
    projectStore,
    prefs,
    loadLayoutClient: () => Promise.resolve(stub.client),
    clearHash,
    confirm: () => true,
  });
  store.start(hash);
  const meshes: MeshSource = {
    get: vi.fn(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 })),
    reset: vi.fn(),
    forget: vi.fn(),
    dispose: vi.fn(),
  };
  const download = vi.fn<(blob: Blob, filename: string) => void>();
  render(
    <App
      store={store}
      meshes={meshes}
      download={download}
      viewerProps={{ webgl: () => false }}
      {...overrides}
    />,
  );
  return { store, stub, projectStore, prefs, clearHash, download };
}
