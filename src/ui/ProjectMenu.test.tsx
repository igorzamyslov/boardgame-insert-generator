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

  it("shows a message when the chosen file cannot be read, and resets the input", async () => {
    const p = props();
    render(<ProjectMenu {...p} />);
    const input = screen.getByLabelText("Import a project JSON file") as HTMLInputElement;
    const file = new File(["x"], "broken.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.reject(new Error("unreadable")) });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/unreadable/));
    expect(p.onImport).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("shows a message when copying the link throws", async () => {
    const p = props({ onCopyLink: () => Promise.reject(new Error("no link")) });
    render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no link/));
  });

  it("drops the copy status when another project is opened", async () => {
    const p = props();
    const view = render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Link copied."));
    view.rerender(<ProjectMenu {...p} currentId="b" name="Ark Nova" />);
    expect(screen.queryByRole("status")).toBeNull();
    view.rerender(<ProjectMenu {...p} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("drops a manual-copy link when another project is opened", async () => {
    const p = props({
      onCopyLink: () =>
        Promise.resolve({
          status: "failed",
          length: 3,
          tooLong: false,
          link: "abc",
          error: "denied",
        }),
    });
    const view = render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => screen.getByLabelText("Share link"));
    view.rerender(<ProjectMenu {...p} currentId="b" name="Ark Nova" />);
    expect(screen.queryByLabelText("Share link")).toBeNull();
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

  it("shows the manual link and the long-link warning together", async () => {
    const p = props({
      onCopyLink: () =>
        Promise.resolve({
          status: "failed",
          length: 2400,
          tooLong: true,
          link: "https://x.test/#1.long",
          error: "denied",
        }),
    });
    render(<ProjectMenu {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => screen.getByLabelText("Share link"));
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toMatch(/denied/);
    expect(alert).toMatch(/2400 characters/);
    fireEvent.click(screen.getByRole("button", { name: "Download JSON instead" }));
    expect(p.onExportJson).toHaveBeenCalled();
  });
});
