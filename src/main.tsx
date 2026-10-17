// src/main.tsx
import { render } from "preact";
import { App } from "./app/App";
import { loadGeometryClient, loadLayoutClient } from "./app/clients";
import { createMeshSource } from "./app/meshes";
import { connectWindow, createAppStore } from "./app/store";
import { createPrefsStore, createProjectStore } from "./share";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./kit/kit.css";
import "./style.css";
import "./screens/workspace.css";
import "./screens/header.css";
import "./screens/rail.css";
import "./screens/stage.css";

const store = createAppStore({
  projectStore: createProjectStore(),
  prefs: createPrefsStore(),
  loadLayoutClient,
  clearHash: () => {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  },
  guardLeaving: (shouldWarn) => {
    // Only when the open project has changes that neither the browser nor a file holds.
    window.addEventListener("beforeunload", (e) => {
      if (shouldWarn()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  },
  confirm: (message) => window.confirm(message),
});
const meshes = createMeshSource(loadGeometryClient);
store.start(window.location.hash);
connectWindow(store, window);

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app element");
}
render(<App store={store} meshes={meshes} />, root);
