// src/ui/ProjectMenu.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    onSendFile: vi.fn(),
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
    for (const name of ["New insert", "Your inserts", "Open file…", "Save file", "Settings"]) {
      expect(button(name)).toBeTruthy();
    }
    fireEvent.click(button("New insert"));
    expect(p.onNew).toHaveBeenCalled();
    fireEvent.click(button("Save file"));
    expect(p.onSaveFile).toHaveBeenCalled();
    fireEvent.click(button("Send file"));
    expect(p.onSendFile).toHaveBeenCalled();
    fireEvent.click(button("Settings"));
    expect(p.onSettings).toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalledTimes(4);
  });

  it("opens an insert from Your inserts and goes back", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    fireEvent.click(button("Your inserts"));
    expect(screen.getByRole("heading", { name: "Your inserts" })).toBeTruthy();
    fireEvent.click(button("Ark Nova"));
    expect(p.onOpen).toHaveBeenCalledWith("b");
    expect(p.onClose).toHaveBeenCalled();
    fireEvent.click(button("Back"));
    expect(button("New insert")).toBeTruthy();
  });

  it("deletes the open insert only after the question is answered", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    fireEvent.click(button("Delete…"));
    expect(p.onDelete).not.toHaveBeenCalled();
    fireEvent.click(button("Delete"));
    expect(p.onDelete).toHaveBeenCalledWith("a");
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

  it("hides Your inserts and Delete without storage", () => {
    render(<ProjectMenu {...props({ storageAvailable: false })} />);
    expect(screen.queryByRole("button", { name: "Your inserts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete…" })).toBeNull();
    expect(screen.getByText(/use Save file so nothing is lost/)).toBeTruthy();
  });

  it("moves the focus into Your inserts and back to the button that opened it", () => {
    render(<ProjectMenu {...props()} />);
    fireEvent.click(button("Your inserts"));
    expect(document.activeElement).toBe(button("Back"));
    fireEvent.click(button("Back"));
    expect(document.activeElement).toBe(button("Your inserts"));
  });

  it("puts the focus on Cancel when the delete question opens, and back on Delete… when kept", () => {
    render(<ProjectMenu {...props()} />);
    fireEvent.click(button("Delete…"));
    expect(document.activeElement).toBe(button("Cancel"));
    fireEvent.click(button("Cancel"));
    expect(document.activeElement).toBe(button("Delete…"));
  });

  it("lists an open insert that is not saved yet", () => {
    render(<ProjectMenu {...props({ currentId: "new", name: "Fresh", projects: [] })} />);
    fireEvent.click(button("Your inserts"));
    expect(screen.getAllByText("Fresh").length).toBeGreaterThan(0);
    expect(screen.getByText("Open now")).toBeTruthy();
  });

  it("lists the menu's notices at the top, with the conflict choices", () => {
    const p = props({
      conflict: true,
      onResolveConflict: vi.fn(),
      notices: [{ level: "warning", code: "storage.conflict", message: "Another tab saved." }],
    });
    render(<ProjectMenu {...p} />);
    // the messages come first: after their (hidden) live region, before any button
    const [live, list] = [...(document.querySelector(".project-menu")?.children ?? [])];
    expect(live?.getAttribute("role")).toBe("status");
    expect(list?.getAttribute("aria-label")).toBe("Project messages");
    expect(screen.getAllByText("Another tab saved.")).toHaveLength(2); // on screen, and spoken
    fireEvent.click(button("Use the other tab's version"));
    expect(p.onResolveConflict).toHaveBeenCalledWith("loadTheirs");
    expect(p.onClose).toHaveBeenCalled();
  });

  it("shows no messages block without notices", () => {
    render(<ProjectMenu {...props()} />);
    expect(screen.queryByRole("list", { name: "Project messages" })).toBeNull();
  });
});
