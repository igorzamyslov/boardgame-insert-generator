// src/app/App.feedback.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { renderWorkspace } from "./test-app";

afterEach(cleanup);

describe("Send feedback in the project menu", () => {
  it("is below Settings, and opens the feedback dialog; Escape returns focus to the menu button", () => {
    renderWorkspace();
    const button = screen.getByRole("button", { name: /^Project menu/ });
    fireEvent.click(button);
    const menu = screen.getByRole("group", { name: "Project" });
    const names = within(menu)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names.indexOf("Send feedback")).toBeGreaterThan(names.indexOf("Settings"));
    fireEvent.click(within(menu).getByRole("button", { name: "Send feedback" }));
    const dialog = screen.getByRole("dialog", { name: "Send feedback" });
    // no Worker is set in tests: the dialog sends people to GitHub
    expect(within(dialog).getByRole("button", { name: "Open GitHub" })).toBeTruthy();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
