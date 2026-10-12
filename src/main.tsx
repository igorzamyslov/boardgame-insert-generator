// src/main.tsx
import { render } from "preact";
import { App } from "./app/App";
import { loadGeometryClient, loadLayoutClient } from "./app/clients";
import { createMeshSource } from "./app/meshes";
import { connectWindow, createAppStore } from "./app/store";
import { createProjectStore } from "./share";
import "./style.css";

const store = createAppStore({
  projectStore: createProjectStore(),
  loadLayoutClient,
  replaceHash: (hash) => {
    history.replaceState(null, "", hash);
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
