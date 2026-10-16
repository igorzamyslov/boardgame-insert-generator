// src/ui/AppHeader.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaveState } from "../app/state";
import { AppHeader } from "./AppHeader";
import type { AppHeaderProps } from "./AppHeader";

afterEach(cleanup);

function props(over: Partial<AppHeaderProps> = {}): AppHeaderProps {
  return {
    name: "Wingspan",
    onRename: vi.fn(),
    saveState: "saved",
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onDownload: vi.fn(),
    downloadDisabled: false,
    menuDot: false,
    menu: (close) => (
      <button type="button" onClick={close}>
        Inside the menu
      </button>
    ),
    ...over,
  };
}

describe("AppHeader", () => {
  it("has one h1 with the wordmark and an editable project name", () => {
    const p = props();
    render(<AppHeader {...p} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Insert Generator");
    const name = screen.getByLabelText("Project name") as HTMLInputElement;
    expect(name.value).toBe("Wingspan");
    fireEvent.input(name, { target: { value: "Wingspan 2" } });
    expect(p.onRename).toHaveBeenCalledWith("Wingspan 2");
  });

  it("shows Saved in this browser", () => {
    render(<AppHeader {...props({ saveState: "saved" })} />);
    expect(screen.getByRole("status").textContent).toBe("Saved in this browser");
  });

  it("shows Saving paused", () => {
    render(<AppHeader {...props({ saveState: "paused" })} />);
    expect(screen.getByRole("status").textContent).toBe("Saving paused");
  });

  it("says what each other save state means", () => {
    const text: Record<SaveState, string> = {
      saved: "Saved in this browser",
      saving: "Saving…",
      paused: "Saving paused",
      failed: "Couldn't save",
      unavailable: "Not saved: this browser blocks storage",
    };
    const { rerender } = render(<AppHeader {...props()} />);
    for (const [state, expected] of Object.entries(text)) {
      rerender(<AppHeader {...props({ saveState: state as SaveState })} />);
      expect(screen.getByRole("status").textContent).toBe(expected);
    }
  });

  it("Undo and Redo follow history", () => {
    const p = props({ canUndo: true, canRedo: false });
    const { rerender } = render(<AppHeader {...p} />);
    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    const redo = screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(true);
    fireEvent.click(undo);
    expect(p.onUndo).toHaveBeenCalledTimes(1);
    rerender(<AppHeader {...props({ ...p, canUndo: false, canRedo: true })} />);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(p.onRedo).toHaveBeenCalledTimes(1);
  });

  it("Download calls out, and is off while there is nothing to download", () => {
    const p = props();
    const { rerender } = render(<AppHeader {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(p.onDownload).toHaveBeenCalledTimes(1);
    rerender(<AppHeader {...props({ downloadDisabled: true })} />);
    expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("opens the project menu, closes it on Escape and returns focus to its button", () => {
    render(<AppHeader {...props()} />);
    const button = screen.getByRole("button", { name: "Project menu" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Inside the menu")).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Inside the menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Inside the menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("closes on a click outside it, not on a click inside, and when the content asks", () => {
    render(<AppHeader {...props()} />);
    const button = screen.getByRole("button", { name: "Project menu" });
    fireEvent.click(button);
    fireEvent.click(screen.getByLabelText("Project name"));
    expect(screen.queryByText("Inside the menu")).toBeNull();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("group", { name: "Project" }));
    expect(screen.getByText("Inside the menu")).toBeTruthy();
    fireEvent.click(screen.getByText("Inside the menu"));
    expect(screen.queryByText("Inside the menu")).toBeNull();
  });

  it("ignores Escape and outside clicks while the menu is closed", () => {
    render(<AppHeader {...props()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.body);
    expect(screen.getByRole("button", { name: "Project menu" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("marks the menu button with a dot when something inside needs a look", () => {
    const { rerender, container } = render(<AppHeader {...props()} />);
    expect(container.querySelector(".app-menu-dot")).toBeNull();
    rerender(<AppHeader {...props({ menuDot: true })} />);
    expect(container.querySelector(".app-menu-dot")).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Project menu/ }).textContent).toMatch(
      /needs your attention/,
    );
  });
});
