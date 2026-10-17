// src/kit/main.tsx
// The kit gallery's entry (kit.html): the same tokens and base styles as the app, then the kit.
import { render } from "preact";
import "../styles/fonts.css";
import "../styles/tokens.css";
import "../styles/base.css";
import "./kit.css";
import "./gallery.css";
import { Gallery } from "./Gallery";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app element");
}
render(<Gallery />, root);
