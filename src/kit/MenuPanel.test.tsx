// src/kit/MenuPanel.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuItem, MenuLink, MenuPanel, MenuSeparator } from "./MenuPanel";

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

  it("marks its region for the screenshots", () => {
    const { container } = render(
      <MenuPanel label="Project" region="menu">
        <MenuItem>Save file</MenuItem>
      </MenuPanel>,
    );
    expect(container.querySelector('[data-region="menu"]')?.getAttribute("aria-label")).toBe(
      "Project",
    );
  });

  it("blocks an item with a reason, and keeps it focusable", () => {
    const onClick = vi.fn();
    render(
      <MenuPanel label="Project">
        <MenuItem blockedReason="Nothing to redo" onClick={onClick}>
          Redo
        </MenuItem>
      </MenuPanel>,
    );
    const item = screen.getByRole("button", { name: "Redo" });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(item.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Nothing to redo",
    );
    item.focus();
    expect(document.activeElement).toBe(item);
    fireEvent.click(item);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("has a link that looks like an item", () => {
    render(
      <MenuPanel label="Project">
        <MenuLink href="./third-party-licenses.txt">Licences</MenuLink>
      </MenuPanel>,
    );
    const link = screen.getByRole("link", { name: "Licences" });
    expect(link.getAttribute("href")).toBe("./third-party-licenses.txt");
    expect(link.classList.contains("k-menu__item")).toBe(true);
  });
});
