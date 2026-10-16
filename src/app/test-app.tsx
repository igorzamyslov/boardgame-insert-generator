// src/app/test-app.tsx
// Test-only: the App on a real store with stubbed clients. Imported only from *.test.tsx files.
import { render } from "@testing-library/preact";
import { vi } from "vitest";
import type { Project } from "../model/types";
import { createProjectStore } from "../share";
import { MemoryStorage } from "../test-support/memory-storage";
import { App } from "./App";
import type { AppProps } from "./App";
import type { MeshSource } from "./meshes";
import { createAppStore } from "./store";
import { EMPTY_FOREIGN, cubeMesh, stubLayoutClient } from "./test-helpers";

export interface RenderAppOptions {
  /** Saved into the project store before the app starts, so it opens as the latest project. */
  project?: Project;
  storage?: MemoryStorage;
  overrides?: Partial<AppProps>;
}

export function renderApp(opts: RenderAppOptions = {}) {
  return mountApp("", opts.overrides ?? {}, opts);
}

/** Temporary: for the tests that test opening a link. */
export function renderAppFromHash(hash: string, overrides: Partial<AppProps> = {}) {
  return mountApp(hash, overrides, {});
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
  const store = createAppStore({
    projectStore,
    loadLayoutClient: () => Promise.resolve(stub.client),
    replaceHash: vi.fn(),
    confirm: () => true,
  });
  store.start(hash);
  const meshes: MeshSource = {
    get: vi.fn(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 })),
    reset: vi.fn(),
    forget: vi.fn(),
    dispose: vi.fn(),
  };
  const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
  const download = vi.fn<(blob: Blob, filename: string) => void>();
  render(
    <App
      store={store}
      meshes={meshes}
      clipboard={clipboard}
      currentHref={() => "https://example.test/insert-generator/"}
      download={download}
      viewerProps={{ webgl: () => false }}
      {...overrides}
    />,
  );
  return { store, stub, projectStore, clipboard, download };
}
