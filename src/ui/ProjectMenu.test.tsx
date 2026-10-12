// src/ui/ProjectMenu.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CopyLinkResult } from "../app/link";
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
    onCopyLink: vi.fn(() =>
      Promise.resolve<CopyLinkResult>({ status: "copied", length: 300, tooLong: false }),
    ),
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
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(p.onExportJson).toHaveBeenCalled();
  });

  it("imports a chosen JSON file", async () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    const input = screen.getByLabelText("Import a project JSON file");
    const file = new File(['{"hello":1}'], "game.insert.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(p.onImport).toHaveBeenCalledWith('{"hello":1}'));
  });

  it("confirms a copied link", async () => {
    render(<ProjectMenu {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Link copied."));
  });

  it("warns about a long link and offers the JSON file", async () => {
    const p = props({
      onCopyLink: () => Promise.resolve({ status: "copied", length: 2400, tooLong: true }),
    });
    render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/2400 characters/));
    fireEvent.click(screen.getByRole("button", { name: "Download JSON instead" }));
    expect(p.onExportJson).toHaveBeenCalled();
  });

  it("shows the link for manual copying when the clipboard refuses", async () => {
    const p = props({
      onCopyLink: () =>
        Promise.resolve({
          status: "failed",
          length: 20,
          tooLong: false,
          link: "https://x.test/#1.abc",
          error: "denied",
        }),
    });
    render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      const field = screen.getByLabelText("Share link");
      expect((field as HTMLInputElement).value).toBe("https://x.test/#1.abc");
    });
    expect(screen.getByRole("alert").textContent).toMatch(/denied/);
  });

  it("hides the saved list and delete without storage", () => {
    render(<ProjectMenu {...props({ storageAvailable: false })} />);
    expect(screen.queryByLabelText("Saved projects")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
  });
});
