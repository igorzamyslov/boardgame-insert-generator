// src/app/App.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { inputsHash } from "../model/hash";
import { APP_VERSION } from "../model/version";
import { encodeHash } from "../share";
import { EMPTY_FOREIGN, fixtureProject, makeLayout, makeResult, makeTray } from "./test-helpers";
import { renderApp } from "./test-app";

afterEach(cleanup);

function withLayoutHash(): string {
  const p = fixtureProject();
  const trays = [
    makeTray({ key: "a:p0:0", path: "0", stack: 0, x: 0, y: 0 }),
    makeTray({ key: "b:p0:0", path: "1", stack: 1, x: 110, y: 0 }),
  ];
  return encodeHash({ ...p, layout: makeLayout(inputsHash(p), trays) }, EMPTY_FOREIGN);
}

describe("App", () => {
  it("lays out inputs then results with the preview banner and footer", () => {
    renderApp();
    const inputs = screen.getByRole("region", { name: "Inputs" });
    expect(
      within(inputs)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Box", "Printer", "Components", "Settings"]);
    const results = screen.getByRole("region", { name: "Results" });
    expect(within(results).getByRole("heading", { name: "Summary" })).toBeTruthy();
    expect(screen.getByText(/shared links may break/)).toBeTruthy();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(`v${APP_VERSION}`);
    expect(
      within(footer).getByRole("link", { name: "Third-party licenses" }).getAttribute("href"),
    ).toBe("./third-party-licenses.txt");
  });

  it("switches to advanced inputs", () => {
    renderApp();
    expect(screen.queryByLabelText(/Bed margin/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(screen.getByLabelText(/Bed margin/)).toBeTruthy();
  });

  it("adds a component and starts an optimizer run after the pause", async () => {
    const { stub } = renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Add cards" }));
    expect(screen.getByRole("heading", { name: "Cards: Cards" })).toBeTruthy();
    await waitFor(() => expect(stub.calls).toHaveLength(1));
  });

  it("shows plan, 3D fallback and export for a stored layout and swaps with the keyboard", () => {
    const { store, stub } = renderApp(withLayoutHash());
    expect(stub.calls).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Plan view" })).toBeTruthy();
    expect(screen.getByText(/needs WebGL/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "3MF per part (.zip)" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1:/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Swap with…" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 2:/ }), { key: "Enter" });
    expect(store.state.project.value.locks).toEqual([
      { kind: "position", trayKey: "a:p0:0", path: "1", rotated: false },
      { kind: "position", trayKey: "b:p0:0", path: "0", rotated: false },
    ]);
  });

  it("locks and unlocks a tray's size from the tray details", () => {
    const { store } = renderApp(withLayoutHash());
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1:/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Lock size" }));
    expect(store.state.project.value.locks).toEqual([
      { kind: "size", trayKey: "a:p0:0", w: 100, d: 80, h: 40 },
    ]);
    expect(screen.getByRole("button", { name: /^Tray 1: .*, size locked$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock size" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("opens the assembly page and comes back", () => {
    renderApp(withLayoutHash());
    fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/— assembly$/);
    fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
    expect(screen.getByRole("heading", { name: "Plan view" })).toBeTruthy();
  });

  it("copies a share link built from the current page", async () => {
    const { clipboard } = renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalled());
    expect(clipboard.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/example\.test\/insert-generator\/#1\./,
    );
  });

  it("shows the shortfall of an infeasible run only while its inputs are current", async () => {
    const { store } = renderApp();
    store.state.lastResult.value = makeResult(null, {
      bestAttempt: { trays: [], shortfall: { x: 12.3, y: 0, z: 0 } },
    });
    store.state.lastResultHash.value = store.state.currentHash.value;
    expect(await screen.findByText(/Doesn't fit: short by 12\.3 mm left–right/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add cards" }));
    await waitFor(() => expect(screen.queryByText(/Doesn't fit/)).toBeNull());
  });
});
