// src/app/App.guideHistory.test.tsx
// @vitest-environment jsdom
// The packing guide is a step of the browser's history: Back (the mouse's button, Alt+Left, a
// swipe) leaves it, for the plan; its own button does the same without taking two steps; Forward
// opens it again. The Download dialog is not reopened: the header's Download is the one way to it.
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import type { Project } from "../model/types";
import { fixtureProject, makeLayout, makeTray } from "./test-helpers";
import { renderApp } from "./test-app";

vi.mock("../instructions/png", async (orig) => ({
  ...(await orig<typeof import("../instructions/png")>()),
  svgToPng: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))),
}));

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  window.history.replaceState(null, "");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function withLayoutProject(): Project {
  const p = fixtureProject();
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", stack: 0, x: 0, y: 0 }),
    makeTray({ key: "b:p0:0", path: "1", stack: 1, x: 110, y: 0 }),
  ];
  return { ...p, layout: makeLayout(inputsHash(p), trays) };
}

function openGuide(): void {
  fireEvent.click(screen.getByRole("button", { name: "Download" }));
  fireEvent.click(screen.getByRole("button", { name: /^Packing guide/ }));
}

/** The browser's Back or Forward: the history changes, then the event arrives. */
async function traverse(go: () => void): Promise<void> {
  await act(async () => {
    go();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

const onGuide = (): boolean =>
  screen.queryByRole("button", { name: "Back to your insert" }) !== null;

describe("the packing guide in the browser's history", () => {
  it("is a history entry of its own, without a new address", () => {
    const before = window.location.href;
    const { store } = renderApp({ project: withLayoutProject() });
    const length = window.history.length;
    openGuide();
    expect(onGuide()).toBe(true);
    expect(window.history.length).toBe(length + 1);
    expect(window.history.state).toEqual({ packingGuide: store.state.project.value.id });
    expect(window.location.href).toBe(before);
  });

  it("leaves on the browser's Back, for the plan, with the focus on the Download button", async () => {
    renderApp({ project: withLayoutProject() });
    openGuide();
    await traverse(() => window.history.back());
    expect(onGuide()).toBe(false);
    expect(screen.getByRole("group", { name: "View" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Download" }));
  });

  it("opens again on Forward", async () => {
    renderApp({ project: withLayoutProject() });
    openGuide();
    await traverse(() => window.history.back());
    expect(onGuide()).toBe(false);
    await traverse(() => window.history.forward());
    expect(onGuide()).toBe(true);
    await traverse(() => window.history.back());
    expect(onGuide()).toBe(false);
  });

  it("leaves by its own button at once, and takes its entry off once, not twice", async () => {
    renderApp({ project: withLayoutProject() });
    const back = vi.spyOn(window.history, "back");
    openGuide();
    fireEvent.click(screen.getByRole("button", { name: "Back to your insert" }));
    // the plan is back in the same tick, with no dialog over it
    expect(onGuide()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    // the history entry is gone, and the page that returned has not been left by a second step
    expect(back).toHaveBeenCalledTimes(1);
    expect(window.history.state).toBeNull();
    expect(onGuide()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("group", { name: "View" })).toBeTruthy();
  });

  it("does nothing on a Back when the guide is not open", async () => {
    renderApp({ project: withLayoutProject() });
    await traverse(() => window.history.back());
    expect(onGuide()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("can be opened, left by the button and opened again", async () => {
    renderApp({ project: withLayoutProject() });
    openGuide();
    fireEvent.click(screen.getByRole("button", { name: "Back to your insert" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    openGuide();
    expect(onGuide()).toBe(true);
    await traverse(() => window.history.back());
    expect(onGuide()).toBe(false);
  });

  it("takes its entry off when the layout goes away under it", async () => {
    const project = withLayoutProject();
    const { store } = renderApp({ project });
    const back = vi.spyOn(window.history, "back");
    openGuide();
    store.newProject();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(window.history.state).toBeNull();
    expect(onGuide()).toBe(false);
  });
});
