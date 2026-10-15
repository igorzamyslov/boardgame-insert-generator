// src/ui/Notices.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { Notice } from "../model/types";
import { Notices } from "./Notices";

afterEach(cleanup);

const notice = (level: Notice["level"]): Notice => ({
  level,
  code: `test.${level}`,
  message: `A ${level} message`,
});

describe("Notices", () => {
  it("announces errors as alerts and warnings politely, and leaves notes silent", () => {
    const { container } = render(
      <Notices notices={[notice("error"), notice("warning"), notice("info")]} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("A error message");
    expect(screen.getByRole("status").textContent).toContain("A warning message");
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("A info message").closest("li")?.getAttribute("role")).toBeNull();
  });

  it("offers dismissing unless canDismiss says the notice has to stay", () => {
    const onDismiss = () => undefined;
    render(
      <Notices
        notices={[notice("warning"), notice("info")]}
        onDismiss={onDismiss}
        canDismiss={(n) => n.level !== "warning"}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Dismiss: A warning/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Dismiss: A info/ })).toBeTruthy();
  });
});

describe("Notices markup", () => {
  it("renders each notice as a pf-notice with a level word, the message, and the level class", () => {
    const { container } = render(
      <Notices
        notices={[notice("error"), notice("warning"), notice("info")]}
        label="Layout messages"
        class="stage-block"
      />,
    );
    const list = screen.getByRole("list", { name: "Layout messages" });
    expect(list.className).toContain("notices");
    expect(list.className).toContain("stage-block");
    const items = Array.from(container.querySelectorAll("li"));
    expect(items.map((li) => li.className)).toEqual([
      "pf-notice pf-notice--error",
      "pf-notice pf-notice--warn",
      "pf-notice",
    ]);
    expect(items.map((li) => li.querySelector("strong.notice-level")?.textContent)).toEqual([
      "Error:",
      "Warning:",
      "Note:",
    ]);
  });

  it("puts the action and a dismiss button named after the message in the notice", () => {
    render(
      <Notices
        notices={[notice("info")]}
        onDismiss={() => undefined}
        renderAction={() => <button type="button">Do it</button>}
      />,
    );
    const li = screen.getByText("A info message").closest("li");
    expect(li?.querySelector(".notice-action")?.textContent).toBe("Do it");
    expect(li?.querySelector("button.notice-dismiss")?.getAttribute("aria-label")).toBe(
      "Dismiss: A info message",
    );
  });

  describe("limit", () => {
    const many = (count: number, level: Notice["level"], prefix = level): Notice[] =>
      Array.from({ length: count }, (_, i) => ({
        level,
        code: `${prefix}.${i}`,
        message: `${prefix} ${i}`,
      }));

    it("shows everything when there is no limit, or the notices fit it", () => {
      const { container } = render(<Notices notices={many(8, "info")} />);
      expect(container.querySelectorAll("li")).toHaveLength(8);
      expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
      cleanup();
      render(<Notices notices={many(3, "info")} limit={3} />);
      expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    });

    it("folds the rest behind Show all, and back", () => {
      const { container } = render(<Notices notices={many(10, "warning")} limit={3} />);
      expect(container.querySelectorAll("li")).toHaveLength(3);
      fireEvent.click(screen.getByRole("button", { name: "Show all 10 messages" }));
      expect(container.querySelectorAll("li")).toHaveLength(10);
      fireEvent.click(screen.getByRole("button", { name: "Show fewer messages" }));
      expect(container.querySelectorAll("li")).toHaveLength(3);
    });

    it("keeps every error and fills the rest with the most severe, in the original order", () => {
      const list = [...many(5, "info"), ...many(2, "error"), ...many(3, "warning")];
      const { container } = render(<Notices notices={list} limit={3} />);
      const shown = [...container.querySelectorAll(".notice-text")].map((e) => e.textContent);
      expect(shown).toEqual(["error 0", "error 1", "warning 0"]);
      expect(screen.getByRole("button", { name: "Show all 10 messages" })).toBeTruthy();
    });

    it("never hides an error, even past the limit", () => {
      const { container } = render(<Notices notices={many(6, "error")} limit={2} />);
      expect(container.querySelectorAll("li")).toHaveLength(6);
      expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    });
  });
});
