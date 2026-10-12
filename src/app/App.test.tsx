// src/app/App.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inputsHash } from "../model/hash";
import { APP_VERSION } from "../model/version";
import { encodeHash } from "../share";
import { CONFLICT_CODE } from "./persistence";
import { EMPTY_FOREIGN, fixtureProject, makeLayout, makeResult, makeTray } from "./test-helpers";
import { renderApp } from "./test-app";

// The assembly page's PNG needs a canvas, which jsdom lacks.
vi.mock("../instructions/png", async (orig) => ({
  ...(await orig<typeof import("../instructions/png")>()),
  svgToPng: vi.fn(() => Promise.resolve(new Blob(["png"], { type: "image/png" }))),
}));

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

  describe("conflict notices", () => {
    const notice = (message: string) => ({
      level: "info" as const,
      code: CONFLICT_CODE,
      message,
    });

    it("offers no choice on a notice left over from a resolved conflict", async () => {
      const { store } = renderApp();
      store.pushNotice(notice("Your version was kept as a copy."));
      expect(store.state.conflict.value).toBe(false);
      expect(await screen.findByText(/kept as a copy/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Keep my version" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Load the other tab/ })).toBeNull();
    });

    it("offers both choices during a real conflict and passes them on", async () => {
      const { store } = renderApp();
      const resolve = vi.spyOn(store, "resolveConflict").mockImplementation(() => undefined);
      store.state.conflict.value = true;
      store.pushNotice(notice("Another tab saved this project."));
      fireEvent.click(await screen.findByRole("button", { name: "Keep my version" }));
      expect(resolve).toHaveBeenLastCalledWith("keepMine");
      fireEvent.click(screen.getByRole("button", { name: "Load the other tab's version" }));
      expect(resolve).toHaveBeenLastCalledWith("loadTheirs");
    });
  });

  describe("assembly page", () => {
    it("moves the focus to the page and back to its button, and scrolls to the top", () => {
      const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
      renderApp(withLayoutHash());
      fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
      expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
      fireEvent.click(screen.getByRole("button", { name: "Back to the editor" }));
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Open the assembly page" }),
      );
      scrollTo.mockRestore();
    });

    it("hands its downloads to the app's download function", async () => {
      const { download } = renderApp(withLayoutHash());
      fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
      fireEvent.click(screen.getByRole("button", { name: /^Download PNG of layer 1/ }));
      await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      expect(download.mock.calls[0]?.[1]).toMatch(/-layer-1\.png$/);
    });

    it("returns to the editor when the layout goes away, and stays there when one comes back", async () => {
      const { store } = renderApp(withLayoutHash());
      fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
      store.newProject();
      expect(await screen.findByRole("region", { name: "Inputs" })).toBeTruthy();
      store.openFromHash(withLayoutHash());
      expect(await screen.findByRole("heading", { name: "Plan view" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to the editor" })).toBeNull();
    });

    it("returns to the editor when another project is opened", async () => {
      const { store } = renderApp(withLayoutHash());
      fireEvent.click(screen.getByRole("button", { name: "Open the assembly page" }));
      const other = { ...fixtureProject(), id: "other-project", name: "Other" };
      store.openFromHash(
        encodeHash({ ...other, layout: makeLayout(inputsHash(other)) }, EMPTY_FOREIGN),
      );
      expect(await screen.findByRole("region", { name: "Inputs" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Back to the editor" })).toBeNull();
    });
  });

  it("shows the message of a link that could not be built", async () => {
    renderApp("", {
      currentHref: () => {
        throw new Error("no address");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText(/Couldn't make the link: no address/)).toBeTruthy();
  });

  it("locks the whole stack from the plan's Lock position button", () => {
    const p = fixtureProject();
    const trays = [
      makeTray({ key: "a:p0:0", path: "0", level: 0, z: 0 }),
      makeTray({ key: "b:p0:1", path: "0", level: 1, z: 40 }),
      makeTray({ key: "c:p1:0", path: "1", stack: 1, x: 110 }),
    ];
    const hash = encodeHash({ ...p, layout: makeLayout(inputsHash(p), trays) }, EMPTY_FOREIGN);
    const { store } = renderApp(hash);
    fireEvent.keyDown(screen.getByRole("button", { name: /^Tray 1:/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Lock position" }));
    const locks = store.state.project.value.locks;
    expect(locks.filter((l) => l.kind === "position").map((l) => l.trayKey)).toEqual([
      "a:p0:0",
      "b:p0:1",
    ]);
    expect(locks.some((l) => l.kind === "stack")).toBe(true);
    expect(screen.getByRole("button", { name: "Unlock position" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unlock position" }));
    expect(store.state.project.value.locks).toEqual([]);
  });

  it("dismisses an app notice", async () => {
    const { store } = renderApp();
    store.pushNotice({ level: "info", code: "test.note", message: "Heads up." });
    expect(await screen.findByText("Heads up.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Heads up." }));
    await waitFor(() => expect(screen.queryByText("Heads up.")).toBeNull());
    expect(store.state.appNotices.value).toEqual([]);
  });

  it("undoes the last layout from the summary", async () => {
    const p = fixtureProject();
    const before = makeLayout(inputsHash(p), [makeTray({ key: "old:p0:0" })]);
    const { store } = renderApp(
      encodeHash({ ...p, layout: makeLayout(inputsHash(p)) }, EMPTY_FOREIGN),
    );
    store.state.undoSlot.value = { layout: before };
    fireEvent.click(await screen.findByRole("button", { name: "Undo layout" }));
    expect(store.state.project.value.layout).toBe(before);
    expect(store.state.undoSlot.value).toBeNull();
  });
});
