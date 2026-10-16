// src/ui/InsertsList.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsertsList } from "./InsertsList";
import type { InsertsListProps } from "./InsertsList";

afterEach(cleanup);

function props(over: Partial<InsertsListProps> = {}): InsertsListProps {
  return {
    currentId: "a",
    projects: [
      { id: "a", name: "Wingspan", updatedAt: 2 },
      { id: "b", name: "Ark Nova", updatedAt: 1 },
    ],
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
}

describe("InsertsList", () => {
  it("opens another insert, and marks the open one", () => {
    const p = props();
    render(<InsertsList {...p} />);
    expect(screen.getByText("Open now")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wingspan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ark Nova" }));
    expect(p.onOpen).toHaveBeenCalledWith("b");
  });

  it("deletes an insert after confirming", () => {
    const p = props();
    render(<InsertsList {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete… .*Ark Nova/ }));
    // nothing is gone until the question is answered
    expect(p.onDelete).not.toHaveBeenCalled();
    const question = screen.getByRole("group", { name: "Delete “Ark Nova”?" });
    expect(question.textContent).toContain("can't be undone");
    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));
    expect(p.onDelete).toHaveBeenCalledWith("b");
  });

  it("focuses Cancel when the question opens and goes back to Delete… when it is kept", () => {
    render(<InsertsList {...props()} />);
    const ask = screen.getByRole("button", { name: /^Delete… .*Ark Nova/ });
    fireEvent.click(ask);
    const keep = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(document.activeElement).toBe(ask);
  });

  it("puts the focus on the list's first item once a deleted insert is gone", () => {
    const p = props();
    const { rerender } = render(<InsertsList {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete… .*Ark Nova/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    rerender(<InsertsList {...p} projects={[{ id: "a", name: "Wingspan", updatedAt: 2 }]} />);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /^Delete… .*Wingspan/ }),
    );
  });

  it("keeps an insert when the question is cancelled", () => {
    const p = props();
    render(<InsertsList {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete… .*Wingspan/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /^Delete/ })).toBeNull();
  });

  it("names an unnamed insert, and says when there are none", () => {
    const { rerender } = render(
      <InsertsList {...props({ projects: [{ id: "a", name: "", updatedAt: 1 }] })} />,
    );
    expect(screen.getAllByText("(unnamed)").length).toBeGreaterThan(0);
    rerender(<InsertsList {...props({ projects: [], currentId: "z" })} />);
    expect(screen.getByText("Nothing saved yet.")).toBeTruthy();
  });
});
