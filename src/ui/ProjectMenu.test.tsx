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
    onRename: vi.fn(),
    onOpen: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    onImport: vi.fn(),
    onExportJson: vi.fn(),
    ...over,
  };
}

describe("ProjectMenu", () => {
  it("renames, opens, creates, deletes and exports", () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    fireEvent.input(screen.getByLabelText("Project name"), { target: { value: "Wingspan 2" } });
    expect(p.onRename).toHaveBeenCalledWith("Wingspan 2");
    fireEvent.change(screen.getByLabelText("Saved projects"), { target: { value: "b" } });
    expect(p.onOpen).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    expect(p.onNew).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    expect(p.onDelete).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Save to file" }));
    expect(p.onExportJson).toHaveBeenCalled();
  });

  it("imports a chosen JSON file", async () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    const input = screen.getByLabelText("Open a project file");
    const file = new File(['{"hello":1}'], "game.insert.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(p.onImport).toHaveBeenCalledWith('{"hello":1}'));
  });

  it("offers files, not links", () => {
    render(<ProjectMenu {...props()} />);
    expect(screen.queryByRole("button", { name: /link/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Save to file" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open from file…" })).toBeTruthy();
  });

  it("hides the saved list and delete without storage", () => {
    render(<ProjectMenu {...props({ storageAvailable: false })} />);
    expect(screen.queryByLabelText("Saved projects")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
  });

  it("shows a message when the chosen file cannot be read, and resets the input", async () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    const input = screen.getByLabelText("Open a project file") as HTMLInputElement;
    const file = new File(["x"], "broken.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.reject(new Error("unreadable")) });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/unreadable/));
    expect(p.onImport).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("lists a current project that is not saved yet, and names an empty one", () => {
    const { rerender } = render(
      <ProjectMenu {...props({ currentId: "new", name: "Fresh", projects: [] })} />,
    );
    const select = screen.getByLabelText("Saved projects") as HTMLSelectElement;
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([["new", "Fresh"]]);
    expect(select.value).toBe("new");
    rerender(
      <ProjectMenu
        {...props({
          currentId: "new",
          name: "",
          projects: [{ id: "a", name: "", updatedAt: 1 }],
        })}
      />,
    );
    const next = screen.getByLabelText("Saved projects") as HTMLSelectElement;
    expect([...next.options].map((o) => o.textContent)).toEqual(["(unnamed)", "(unnamed)"]);
  });
});
