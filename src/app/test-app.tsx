// src/app/test-app.tsx
// Test-only: the App on a real store with stubbed clients. Imported only from *.test.tsx files.
import { render } from "@testing-library/preact";
import { vi } from "vitest";
import { createProjectStore } from "../share";
import { MemoryStorage } from "../test-support/memory-storage";
import { App } from "./App";
import type { MeshSource } from "./meshes";
import { createAppStore } from "./store";
import { cubeMesh, stubLayoutClient } from "./test-helpers";

export function renderApp(hash = "") {
  const stub = stubLayoutClient();
  const store = createAppStore({
    projectStore: createProjectStore(new MemoryStorage()),
    loadLayoutClient: () => Promise.resolve(stub.client),
    replaceHash: vi.fn(),
    confirm: () => true,
  });
  store.start(hash);
  const meshes: MeshSource = {
    get: vi.fn(() => Promise.resolve({ mesh: cubeMesh(), volumeMm3: 1 })),
    reset: vi.fn(),
    dispose: vi.fn(),
  };
  const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
  render(
    <App
      store={store}
      meshes={meshes}
      clipboard={clipboard}
      currentHref={() => "https://example.test/insert-generator/"}
      confirm={() => true}
      download={vi.fn()}
      viewerProps={{ webgl: () => false }}
    />,
  );
  return { store, stub, clipboard };
}
