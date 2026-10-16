// src/kit/MenuPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuItem, MenuPanel, MenuSeparator } from "./MenuPanel";

afterEach(cleanup);

describe("MenuPanel", () => {
  it("is a named group of plain buttons, not an ARIA menu", () => {
    const onClick = vi.fn();
    const { container } = render(
      <MenuPanel label="Project">
        <MenuItem onClick={onClick}>Save file</MenuItem>
        <MenuSeparator />
        <MenuItem meta="3 in this browser">Your inserts</MenuItem>
      </MenuPanel>,
    );
    expect(screen.getByRole("group", { name: "Project" })).toBeTruthy();
    expect(container.querySelector('[role="menu"], [role="menuitem"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save file" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Your inserts/ }).textContent).toContain(
      "3 in this browser",
    );
    expect(container.querySelector("hr, .k-menu__sep")?.getAttribute("aria-hidden")).toBe("true");
  });
});
