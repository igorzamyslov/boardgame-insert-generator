// src/screens/ProjectMenu.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_VERSION, BUILD_ID } from "../model/version";
import { ProjectMenu } from "./ProjectMenu";
import type { ProjectMenuProps } from "./ProjectMenu";

afterEach(cleanup);

function props(over: Partial<ProjectMenuProps> = {}): ProjectMenuProps {
  return {
    name: "Wingspan",
    currentId: "a",
    projects: [
      { id: "a", name: "Wingspan", updatedAt: 2 },
      { id: "b", name: "Ark Nova", updatedAt: 1 },
    ],
    storageAvailable: true,
    onOpen: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    onOpenFile: vi.fn(),
    onSaveFile: vi.fn(),
    onSettings: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });

describe("ProjectMenu", () => {
  it("offers New insert, Your inserts, Open file, Save file and Settings", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    for (const name of ["New insert", /^Your inserts/, "Open file…", "Save file", "Settings"]) {
      expect(button(name)).toBeTruthy();
    }
    fireEvent.click(button("New insert"));
    expect(p.onNew).toHaveBeenCalled();
    fireEvent.click(button("Save file"));
    expect(p.onSaveFile).toHaveBeenCalled();
    fireEvent.click(button("Settings"));
    expect(p.onSettings).toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalledTimes(3);
  });

  it("opens an insert from Your inserts and goes back", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    fireEvent.click(button(/^Your inserts/));
    expect(screen.getByRole("heading", { name: "Your inserts" })).toBeTruthy();
    fireEvent.click(button("Ark Nova"));
    expect(p.onOpen).toHaveBeenCalledWith("b");
    expect(p.onClose).toHaveBeenCalled();
    fireEvent.click(button("Back"));
    expect(button("New insert")).toBeTruthy();
  });

  it("deletes an insert from Your inserts only after the question is answered", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    fireEvent.click(button(/^Your inserts/));
    fireEvent.click(button("Delete Ark Nova…"));
    expect(p.onDelete).not.toHaveBeenCalled();
    fireEvent.click(button("Delete"));
    expect(p.onDelete).toHaveBeenCalledWith("b");
  });

  it("has no Delete or Send file", () => {
    render(<ProjectMenu {...props()} />);
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send file" })).toBeNull();
  });

  it("ends with the version and Licences", () => {
    render(<ProjectMenu {...props()} />);
    const panel = screen.getByRole("group", { name: "Project" });
    const [version, licences] = [...panel.children].slice(-2);
    expect(version?.textContent).toBe(`Insert Generator ${APP_VERSION} (${BUILD_ID})`);
    expect(version?.localName).not.toBe("button");
    expect(licences?.textContent).toBe("Licences");
    expect(licences?.getAttribute("href")).toBe("./third-party-licenses.txt");
  });

  it("offers Redo first on a phone, blocked while there is nothing to redo", () => {
    const p = props({ phone: true, canRedo: false, onRedo: vi.fn() });
    const { rerender } = render(<ProjectMenu {...p} />);
    const first = screen.getByRole("group", { name: "Project" }).querySelector("button");
    expect(first?.textContent).toBe("Redo");
    expect(first?.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(first as HTMLElement);
    expect(p.onRedo).not.toHaveBeenCalled();
    rerender(<ProjectMenu {...p} canRedo />);
    fireEvent.click(button("Redo"));
    expect(p.onRedo).toHaveBeenCalledTimes(1);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("has no Redo item on a wider screen, where the header has it", () => {
    render(<ProjectMenu {...props()} />);
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
  });

  it("says how many inserts are in this browser", () => {
    render(<ProjectMenu {...props()} />);
    expect(button(/^Your inserts/).textContent).toContain("2 in this browser");
  });

  it("asks the page for its file chooser and closes", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    fireEvent.click(button("Open file…"));
    expect(p.onOpenFile).toHaveBeenCalledTimes(1);
    expect(p.onClose).toHaveBeenCalled();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });

  it("offers files, not links", () => {
    render(<ProjectMenu {...props()} />);
    expect(screen.queryByRole("button", { name: /link/i })).toBeNull();
  });

  it("hides Your inserts without storage", () => {
    render(<ProjectMenu {...props({ storageAvailable: false })} />);
    expect(screen.queryByRole("button", { name: /^Your inserts/ })).toBeNull();
    expect(button("Save file")).toBeTruthy();
  });

  it("moves the focus into Your inserts and back to the button that opened it", () => {
    render(<ProjectMenu {...props()} />);
    fireEvent.click(button(/^Your inserts/));
    expect(document.activeElement).toBe(button("Back"));
    fireEvent.click(button("Back"));
    expect(document.activeElement).toBe(button(/^Your inserts/));
  });

  it("puts the focus on Cancel when the delete question opens, and back on Delete… when kept", () => {
    render(<ProjectMenu {...props()} />);
    fireEvent.click(button(/^Your inserts/));
    const ask = button("Delete Ark Nova…");
    fireEvent.click(ask);
    expect(document.activeElement).toBe(button("Cancel"));
    fireEvent.click(button("Cancel"));
    expect(document.activeElement).toBe(ask);
  });

  it("lists an open insert that is not saved yet", () => {
    render(<ProjectMenu {...props({ currentId: "new", name: "Fresh", projects: [] })} />);
    fireEvent.click(button(/^Your inserts/));
    expect(screen.getAllByText("Fresh").length).toBeGreaterThan(0);
    expect(screen.getByText("Open now")).toBeTruthy();
  });

  it("shows another tab's change as a note with the board's words and both choices", () => {
    const p = props({
      conflict: true,
      onResolveConflict: vi.fn(),
      onDismissNotice: vi.fn(),
      notices: [{ level: "warning", code: "storage.conflict", message: "Another tab saved." }],
    });
    render(<ProjectMenu {...p} />);
    const panel = screen.getByRole("group", { name: "Project" });
    // the note comes first, before any item
    const note = panel.querySelector(".pm-note");
    expect(panel.firstElementChild).toBe(note);
    expect(note?.textContent).toContain("You changed this insert in another tab.");
    expect(note?.textContent).toContain("Saving is paused here until you choose.");
    // saving is paused for the choice: it cannot be dismissed
    expect(screen.queryByRole("button", { name: /^Dismiss/ })).toBeNull();
    fireEvent.click(button("Use the other tab version"));
    expect(p.onResolveConflict).toHaveBeenCalledWith("loadTheirs");
    expect(p.onClose).toHaveBeenCalled();
    fireEvent.click(button("Keep this version"));
    expect(p.onResolveConflict).toHaveBeenLastCalledWith("keepMine");
  });

  it("shows any other notice in its own words, with a way to dismiss it", () => {
    const p = props({
      onDismissNotice: vi.fn(),
      notices: [{ level: "info", code: "storage.unavailable", message: "No storage here." }],
    });
    render(<ProjectMenu {...p} />);
    expect(screen.getByText("No storage here.")).toBeTruthy();
    fireEvent.click(button("Dismiss: No storage here."));
    expect(p.onDismissNotice).toHaveBeenCalledWith("storage.unavailable");
  });

  it("shows no note without notices", () => {
    render(<ProjectMenu {...props()} />);
    expect(document.querySelector(".pm-note")).toBeNull();
  });
});
