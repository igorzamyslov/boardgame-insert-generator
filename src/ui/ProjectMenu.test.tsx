// src/ui/ProjectMenu.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
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
    onImport: vi.fn(),
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

  it("imports a chosen JSON file and closes", async () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    const input = screen.getByLabelText("Open an insert file");
    const file = new File(['{"hello":1}'], "game.insert.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(p.onImport).toHaveBeenCalledWith('{"hello":1}'));
    expect(p.onClose).toHaveBeenCalled();
  });

  it("offers files, not links", () => {
    render(<ProjectMenu {...props()} />);
    expect(screen.queryByRole("button", { name: /link/i })).toBeNull();
  });

  it("hides Your inserts and Delete without storage", () => {
    render(<ProjectMenu {...props({ storageAvailable: false })} />);
    expect(screen.queryByRole("button", { name: "Your inserts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete…" })).toBeNull();
    expect(screen.getByText(/use Save file to keep your work/)).toBeTruthy();
  });

  it("shows a message when the chosen file cannot be read, resets the input and stays open", async () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    const input = screen.getByLabelText("Open an insert file") as HTMLInputElement;
    const file = new File(["x"], "broken.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.reject(new Error("unreadable")) });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/unreadable/));
    expect(p.onImport).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("lists an open insert that is not saved yet", () => {
    render(<ProjectMenu {...props({ currentId: "new", name: "Fresh", projects: [] })} />);
    fireEvent.click(button("Your inserts"));
    expect(screen.getAllByText("Fresh").length).toBeGreaterThan(0);
    expect(screen.getByText("Open now")).toBeTruthy();
  });
});
